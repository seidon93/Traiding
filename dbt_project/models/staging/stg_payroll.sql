-- stg_payroll: Clean payroll / salary data
-- Source: raw.fact_mzdy

with source as (
    select * from {{ source('raw', 'fact_mzdy') }}
)

select
    zamestnanec_id                  as employee_id,
    stredisko_id                    as cost_center_id,
    obdobi                          as period,
    zakladni_mzda::numeric          as base_salary,
    odmeny::numeric                 as bonuses,
    hruba_mzda_celkem::numeric      as gross_salary_total,
    soc_pojisteni_zam::numeric      as social_insurance_employee,
    zdr_pojisteni_zam::numeric      as health_insurance_employee,
    soc_pojisteni_firma::numeric    as social_insurance_employer,
    zdr_pojisteni_firma::numeric    as health_insurance_employer,
    dan_z_prijmu::numeric           as income_tax,
    cista_mzda::numeric             as net_salary,
    celkove_naklady_firma::numeric  as total_employer_cost,
    current_timestamp               as _loaded_at
from source
