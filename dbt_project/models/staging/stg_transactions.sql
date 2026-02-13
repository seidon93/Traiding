-- stg_transactions: Clean main accounting transactions
-- Source: raw.fact_transakce

with source as (
    select * from {{ source('raw', 'fact_transakce') }}
)

select
    transakce_id            as transaction_id,
    datum::date             as transaction_date,
    typ_dokladu             as document_type,
    castka::numeric         as amount,
    mena                    as currency,
    kurz::numeric           as exchange_rate,
    castka_czk::numeric     as amount_czk,
    dph_sazba::numeric      as vat_rate,
    dph_castka::numeric     as vat_amount,
    ucet_md                 as debit_account,
    ucet_dal                as credit_account,
    stredisko_id            as cost_center_id,
    projekt_id              as project_id,
    profit_centrum_id       as profit_center_id,
    pobocka_id              as branch_id,
    popis                   as description,
    stav                    as status,
    uzivatel                as user_id,
    current_timestamp       as _loaded_at
from source
