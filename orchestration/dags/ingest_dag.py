"""
Financial Controlling – Airflow DAG
=====================================
Orchestrates the daily ingestion of 17 CSV files from GitHub into PostgreSQL.
Schedule: Daily at 06:00 UTC (simulates end-of-day accounting refresh).
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator

import os
import sys

# Add scripts directory to path so we can import ingest module
sys.path.insert(0, "/opt/airflow/scripts")

from ingest import ingest_file  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

DB_HOST = os.getenv("FINANCIAL_DB_HOST", "postgres")
DB_PORT = os.getenv("FINANCIAL_DB_PORT", "5432")
DB_USER = os.getenv("FINANCIAL_DB_USER", "financial_admin")
DB_PASS = os.getenv("FINANCIAL_DB_PASSWORD", "fin_controlling_2024")
DB_NAME = os.getenv("FINANCIAL_DB_NAME", "financial_controlling")

DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

CSV_FILES = {
    # Dimensions first (no dependencies)
    "dimensions": [
        "dim_regiony.csv",
        "dim_pobocky.csv",
        "dim_strediska.csv",
        "dim_profit_centra.csv",
        "dim_projekty.csv",
        "dim_ucty.csv",
        "dim_zamestnanci.csv",
        "dim_produkty.csv",
        "dim_zakaznici.csv",
        "dim_dodavatele.csv",
    ],
    # Facts after dimensions
    "facts": [
        "fact_transakce.csv",
        "fact_mzdy.csv",
        "fact_prodeje.csv",
        "fact_nakupy.csv",
        "fact_vyrobni_zakazky.csv",
        "fact_cashflow.csv",
        "fact_budget.csv",
    ],
}

# ─────────────────────────────────────────────
# Task callables
# ─────────────────────────────────────────────


def ensure_schema(**kwargs):
    """Create raw schema if it doesn't exist."""
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with engine.begin() as conn:
        conn.execute(text("CREATE SCHEMA IF NOT EXISTS raw"))


def ingest_csv(filename: str, **kwargs):
    """Ingest a single CSV file."""
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    rows = ingest_file(filename, engine)
    return {"filename": filename, "rows_loaded": rows}


# ─────────────────────────────────────────────
# DAG Definition
# ─────────────────────────────────────────────

default_args = {
    "owner": "financial_controlling",
    "depends_on_past": False,
    "email_on_failure": False,
    "email_on_retry": False,
    "retries": 2,
    "retry_delay": timedelta(minutes=5),
    "execution_timeout": timedelta(minutes=30),
}

with DAG(
    dag_id="financial_data_ingestion",
    default_args=default_args,
    description="Daily ingestion of financial CSV data from GitHub into PostgreSQL raw schema",
    schedule_interval="0 6 * * *",  # Every day at 06:00 UTC
    start_date=datetime(2024, 1, 1),
    catchup=False,
    max_active_runs=1,
    tags=["financial", "ingestion", "etl"],
) as dag:

    # Step 1: Ensure schema exists
    task_ensure_schema = PythonOperator(
        task_id="ensure_raw_schema",
        python_callable=ensure_schema,
    )

    # Step 2: Ingest dimension tables (parallel)
    dim_tasks = []
    for csv_file in CSV_FILES["dimensions"]:
        task = PythonOperator(
            task_id=f"ingest_{csv_file.replace('.csv', '')}",
            python_callable=ingest_csv,
            op_kwargs={"filename": csv_file},
        )
        task_ensure_schema >> task
        dim_tasks.append(task)

    # Step 3: Ingest fact tables (parallel, after dimensions)
    for csv_file in CSV_FILES["facts"]:
        task = PythonOperator(
            task_id=f"ingest_{csv_file.replace('.csv', '')}",
            python_callable=ingest_csv,
            op_kwargs={"filename": csv_file},
        )
        # Facts depend on all dimensions being loaded first
        for dim_task in dim_tasks:
            dim_task >> task
