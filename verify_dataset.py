import pandas as pd, os

d = 'financial_dataset'
print("=" * 50)
print("DATASET VERIFICATION")
print("=" * 50)

for f in sorted(os.listdir(d)):
    if f.endswith('.csv'):
        df = pd.read_csv(os.path.join(d, f))
        size = os.path.getsize(os.path.join(d, f)) / 1024 / 1024
        print(f"  {f:40s} {len(df):>10,} rows  {size:6.1f} MB")

print()
cf = pd.read_csv(os.path.join(d, 'fact_cashflow.csv'))
income = cf[cf['smer'] == 'Příjem']['castka'].sum()
expense = cf[cf['smer'] == 'Výdaj']['castka'].sum()
net = cf['castka'].sum()
print(f"CASH FLOW:")
print(f"  Income:  {income:>20,.0f} CZK")
print(f"  Expense: {expense:>20,.0f} CZK")
print(f"  NET:     {net:>20,.0f} CZK  {'✓ POSITIVE' if net > 0 else '✗ NEGATIVE'}")

ucty = pd.read_csv(os.path.join(d, 'dim_ucty.csv'))
print(f"\nChart of accounts: {len(ucty)} accounts across {ucty['trida'].nunique()} classes")
