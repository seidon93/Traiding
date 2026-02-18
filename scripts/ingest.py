"""
Financial Controlling – CSV Ingestion Script
=============================================
Downloads 17 CSV files from GitHub and loads them into the PostgreSQL `raw` schema.
Uses Polars for fast reading & sanitization, SQLAlchemy for DB writes.

Usage:
    python ingest.py                          # full load (all files)
    python ingest.py --file dim_regiony.csv   # single file
"""

import os
import io
import sys
import logging
import argparse
from typing import Optional

import polars as pl
import requests
from sqlalchemy import create_engine, text

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────

GITHUB_RAW_BASE = os.getenv(
    "GITHUB_RAW_BASE_URL",
    "https://raw.githubusercontent.com/seidon93/Data/main/financial_dataset",
)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "financial_dataset")

DB_HOST = os.getenv("FINANCIAL_DB_HOST", "localhost")
DB_PORT = os.getenv("FINANCIAL_DB_PORT", "5432")
DB_USER = os.getenv("FINANCIAL_DB_USER", "financial_admin")
DB_PASS = os.getenv("FINANCIAL_DB_PASSWORD", "fin_controlling_2024")
DB_NAME = os.getenv("FINANCIAL_DB_NAME", "financial_controlling")

DATABASE_URL = f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

RAW_SCHEMA = "raw"

CSV_FILES = [
    # Dimension tables
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
    # Fact tables
    "fact_transakce.csv",
    "fact_mzdy.csv",
    "fact_prodeje.csv",
    "fact_nakupy.csv",
    "fact_vyrobni_zakazky.csv",
    "fact_cashflow.csv",
    "fact_budget.csv",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("ingest")


# ─────────────────────────────────────────────
# Core functions
# ─────────────────────────────────────────────


def download_csv(filename: str) -> bytes:
    """Download a single CSV file from GitHub RAW URL."""
    url = f"{GITHUB_RAW_BASE}/{filename}"
    log.info("Downloading %s", url)

    response = requests.get(url, timeout=120)
    response.raise_for_status()

    return response.content


def sanitize(df: pl.DataFrame, filename: str) -> pl.DataFrame:
    """
    Basic data sanitization:
    - Strip whitespace from column names
    - Remove fully-null rows
    - Handle UTF-8 BOM (already handled by reading as utf-8-sig)
    """
    # Clean column names
    clean_cols = {col: col.strip().lower().replace(" ", "_") for col in df.columns}
    df = df.rename(clean_cols)

    # Remove rows where ALL values are null
    df = df.filter(~pl.all_horizontal(pl.all().is_null()))

    log.info("  %s: %d rows × %d cols after sanitization", filename, df.height, df.width)
    return df


def load_to_postgres(df: pl.DataFrame, table_name: str, engine) -> int:
    """Load a Polars DataFrame into a PostgreSQL table (raw schema)."""
    # Convert to pandas for to_sql (Polars doesn't natively support SQLAlchemy)
    pdf = df.to_pandas()

    with engine.begin() as conn:
        # Drop and recreate (full refresh)
        conn.execute(text(f'DROP TABLE IF EXISTS {RAW_SCHEMA}."{table_name}" CASCADE'))

    pdf.to_sql(
        name=table_name,
        con=engine,
        schema=RAW_SCHEMA,
        if_exists="replace",
        index=False,
        method="multi",
        chunksize=5000,
    )

    log.info("  ✓ Loaded %d rows into %s.%s", len(pdf), RAW_SCHEMA, table_name)
    return len(pdf)


def ingest_file(filename: str, engine, source: str = "local") -> int:
    """Full pipeline for a single CSV file: download/read → sanitize → load."""
    log.info("─" * 50)
    log.info("Processing: %s (source: %s)", filename, source)

    if source == "local":
        path = os.path.join(DATA_DIR, filename)
        if not os.path.exists(path):
            raise FileNotFoundError(f"Local file not found: {path}")
        log.info("Reading local file: %s", path)
        with open(path, "rb") as f:
            raw_bytes = f.read()
    else:
        # Download
        raw_bytes = download_csv(filename)

    # Read with Polars (handle BOM encoding)
    content = raw_bytes.decode("utf-8-sig")
    df = pl.read_csv(io.StringIO(content), infer_schema_length=10000)

    # Sanitize
    df = sanitize(df, filename)

    # Table name = filename without extension
    table_name = filename.replace(".csv", "")

    # Load
    rows = load_to_postgres(df, table_name, engine)

    return rows


def ingest_all(target_file: Optional[str] = None, source: str = "local"):
    """Run ingestion for all CSV files (or a single one)."""
    log.info("=" * 60)
    log.info("  FINANCIAL DATA INGESTION")
    log.info("=" * 60)
    log.info("  Source: %s (%s)", DATA_DIR if source == "local" else GITHUB_RAW_BASE, source)
    log.info("  Target: %s (schema: %s)", DATABASE_URL.split("@")[1], RAW_SCHEMA)

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    # Ensure raw schema exists
    with engine.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {RAW_SCHEMA}"))

    files = [target_file] if target_file else CSV_FILES
    total_rows = 0
    errors = []

    for f in files:
        try:
            rows = ingest_file(f, engine, source=source)
            total_rows += rows
        except Exception as e:
            log.error("  ✗ FAILED %s: %s", f, e)
            errors.append((f, str(e)))

    log.info("=" * 60)
    log.info("  DONE: %d files, %d total rows loaded", len(files) - len(errors), total_rows)
    if errors:
        log.warning("  ERRORS: %d files failed", len(errors))
        for f, err in errors:
            log.warning("    - %s: %s", f, err)
    log.info("=" * 60)

    if errors:
        sys.exit(1)


# ─────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest financial CSV data from GitHub to PostgreSQL")
    parser.add_argument("--file", type=str, help="Single CSV filename to ingest (default: all)")
    parser.add_argument("--source", type=str, choices=["local", "github"], default="local", help="Source of CSV files")
    args = parser.parse_args()

    ingest_all(target_file=args.file, source=args.source)
