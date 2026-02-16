-- mart_hr_budget: HR / Workforce Budget
-- ======================================
-- FTE count, salary plan, bonuses, employer contributions
-- Aggregated by cost center × period with YoY growth

with payroll as (
    select * from {{ ref('stg_payroll') }}
),

employees as (
    select * from {{ ref('stg_employees') }}
),

cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
),

-- Monthly aggregation
monthly_hr as (
    select
        p.cost_center_id,
        p.period                as fiscal_period,
        split_part(p.period, '-', 1)::integer as fiscal_year,
        split_part(p.period, '-', 2)::integer as fiscal_month,

        -- FTE count (each active employee = 1 FTE for full-time, 0.5 for partial)
        count(distinct p.employee_id) as headcount,
        count(distinct case
            when e.contract_type = 'Plný úvazek' then p.employee_id
        end) as fte_full_time,
        count(distinct case
            when e.contract_type = 'Částečný úvazek' then p.employee_id
        end) as fte_part_time,
        count(distinct case
            when e.contract_type = 'DPP' then p.employee_id
        end) as fte_contractors,
        -- Effective FTE
        count(distinct case when e.contract_type = 'Plný úvazek' then p.employee_id end)
        + count(distinct case when e.contract_type = 'Částečný úvazek' then p.employee_id end) * 0.5
        + count(distinct case when e.contract_type = 'DPP' then p.employee_id end) * 0.2
            as effective_fte,

        -- Salary components
        sum(p.base_salary)                  as total_base_salary,
        sum(p.bonuses)                      as total_bonuses,
        sum(p.gross_salary_total)           as total_gross_salary,
        sum(p.social_insurance_employee)    as total_soc_insurance_employee,
        sum(p.health_insurance_employee)    as total_health_insurance_employee,
        sum(p.social_insurance_employer)    as total_soc_insurance_employer,
        sum(p.health_insurance_employer)    as total_health_insurance_employer,
        sum(p.income_tax)                   as total_income_tax,
        sum(p.net_salary)                   as total_net_salary,
        sum(p.total_employer_cost)          as total_employer_cost,

        -- Averages
        avg(p.gross_salary_total)           as avg_gross_salary,
        avg(p.total_employer_cost)          as avg_employer_cost_per_employee
    from payroll p
    left join employees e on p.employee_id = e.employee_id
    group by p.cost_center_id, p.period
),

-- Add previous year for YoY comparison
with_prev_year as (
    select
        m.*,
        -- Previous year same period
        lag(m.total_employer_cost, 12) over (
            partition by m.cost_center_id
            order by m.fiscal_year, m.fiscal_month
        ) as prev_year_employer_cost,
        lag(m.effective_fte, 12) over (
            partition by m.cost_center_id
            order by m.fiscal_year, m.fiscal_month
        ) as prev_year_fte,
        lag(m.avg_gross_salary, 12) over (
            partition by m.cost_center_id
            order by m.fiscal_year, m.fiscal_month
        ) as prev_year_avg_salary
    from monthly_hr m
)

select
    wpy.cost_center_id,
    cc.cost_center_name,
    cc.type                 as cost_center_type,
    wpy.fiscal_period,
    wpy.fiscal_year,
    wpy.fiscal_month,

    -- Headcount
    wpy.headcount,
    wpy.fte_full_time,
    wpy.fte_part_time,
    wpy.fte_contractors,
    wpy.effective_fte,

    -- Salary plan
    wpy.total_base_salary,
    wpy.total_bonuses,
    wpy.total_gross_salary,
    wpy.total_soc_insurance_employer,
    wpy.total_health_insurance_employer,
    wpy.total_income_tax,
    wpy.total_net_salary,
    wpy.total_employer_cost,

    -- Per-employee metrics
    wpy.avg_gross_salary,
    wpy.avg_employer_cost_per_employee,
    case when wpy.effective_fte > 0
        then round(wpy.total_employer_cost / wpy.effective_fte, 2)
        else 0
    end as cost_per_fte,

    -- Bonus ratio
    case when wpy.total_gross_salary > 0
        then round(wpy.total_bonuses / wpy.total_gross_salary * 100, 2)
        else 0
    end as bonus_ratio_pct,

    -- Employer contribution ratio
    case when wpy.total_gross_salary > 0
        then round((wpy.total_soc_insurance_employer + wpy.total_health_insurance_employer)
                    / wpy.total_gross_salary * 100, 2)
        else 0
    end as employer_contribution_ratio_pct,

    -- YoY Growth
    case when wpy.prev_year_employer_cost > 0
        then round((wpy.total_employer_cost - wpy.prev_year_employer_cost)
                    / wpy.prev_year_employer_cost * 100, 2)
        else null
    end as yoy_cost_growth_pct,
    case when wpy.prev_year_fte > 0
        then round((wpy.effective_fte - wpy.prev_year_fte)
                    / wpy.prev_year_fte * 100, 2)
        else null
    end as yoy_fte_growth_pct,
    case when wpy.prev_year_avg_salary > 0
        then round((wpy.avg_gross_salary - wpy.prev_year_avg_salary)
                    / wpy.prev_year_avg_salary * 100, 2)
        else null
    end as yoy_salary_growth_pct,

    -- YTD
    sum(wpy.total_employer_cost) over (
        partition by wpy.fiscal_year, wpy.cost_center_id
        order by wpy.fiscal_month
    ) as ytd_employer_cost

from with_prev_year wpy
left join cost_centers cc on wpy.cost_center_id = cc.cost_center_id
