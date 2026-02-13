-- stg_employees: Clean employee / HR dimension
-- Source: raw.dim_zamestnanci

with source as (
    select * from {{ source('raw', 'dim_zamestnanci') }}
)

select
    zamestnanec_id          as employee_id,
    jmeno                   as first_name,
    prijmeni                as last_name,
    stredisko_id            as cost_center_id,
    pozice                  as position,
    hruba_mzda::numeric     as gross_salary,
    datum_nastupu::date     as hire_date,
    stav                    as status,
    typ_uvazku              as contract_type,
    email,
    current_timestamp       as _loaded_at
from source
