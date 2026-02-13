-- dim_cost_centers: Enriched cost center dimension
-- Includes branch and region information for hierarchical reporting

with cost_centers as (
    select * from {{ ref('stg_cost_centers') }}
),

branches as (
    select * from {{ ref('stg_branches') }}
),

regions as (
    select * from {{ ref('stg_regions') }}
),

parent_centers as (
    select
        cost_center_id      as parent_id,
        cost_center_name    as parent_name,
        type                as parent_type
    from {{ ref('stg_cost_centers') }}
)

select
    cc.cost_center_id,
    cc.cost_center_name,
    cc.type                 as cost_center_type,
    cc.status,

    -- Parent hierarchy
    cc.parent_cost_center_id,
    pc.parent_name          as parent_cost_center_name,
    pc.parent_type          as parent_cost_center_type,

    -- Branch
    cc.branch_id,
    b.branch_name,
    b.city                  as branch_city,
    b.address               as branch_address,

    -- Region
    b.region_id,
    r.region_name,
    r.country

from cost_centers cc
left join branches b        on cc.branch_id = b.branch_id
left join regions r         on b.region_id = r.region_id
left join parent_centers pc on cc.parent_cost_center_id = pc.parent_id
