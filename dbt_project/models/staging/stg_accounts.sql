-- stg_accounts: Clean chart of accounts dimension
-- Source: raw.dim_ucty

with source as (
    select * from {{ source('raw', 'dim_ucty') }}
)

select
    ucet_cislo      as account_number,
    ucet_nazev      as account_name,
    typ             as account_type,
    skupina         as account_group,
    trida           as account_class,
    stav            as status,
    current_timestamp as _loaded_at
from source
