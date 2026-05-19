-- Azure SQL views for reporting and review.

CREATE OR ALTER VIEW dbo.vw_bin_surveillance AS
SELECT
    f.farm_code,
    f.farm_name,
    f.region,
    f.route,
    fh.house_code,
    fb.id AS feed_bin_id,
    fb.bin_code,
    ft.feed_name,
    fb.capacity_tons,
    e.current_estimated_tons,
    e.percent_full,
    e.daily_consumption_tons,
    e.days_remaining,
    e.projected_empty_datetime,
    e.risk_level,
    e.confidence_score,
    br.reading_datetime AS last_reading_datetime,
    br.source AS last_reading_source,
    br.reading_tons AS last_reading_tons
FROM dbo.feed_bins AS fb
JOIN dbo.farm_houses AS fh ON fh.id = fb.farm_house_id
JOIN dbo.farms AS f ON f.id = fh.farm_id
JOIN dbo.feed_types AS ft ON ft.id = fb.feed_type_id
LEFT JOIN dbo.bin_inventory_estimates AS e ON e.feed_bin_id = fb.id
LEFT JOIN dbo.bin_readings AS br ON br.id = e.last_reading_id;
GO

CREATE OR ALTER VIEW dbo.vw_open_load_forecasts AS
SELECT
    lf.id AS forecast_id,
    f.farm_code,
    f.farm_name,
    fh.house_code,
    fb.bin_code,
    ft.feed_name,
    lf.current_estimated_tons,
    lf.days_remaining,
    lf.recommended_delivery_datetime,
    lf.recommended_tons,
    lf.priority,
    lf.confidence_score,
    lf.reason,
    lf.generated_at
FROM dbo.load_forecasts AS lf
JOIN dbo.feed_bins AS fb ON fb.id = lf.feed_bin_id
JOIN dbo.farm_houses AS fh ON fh.id = fb.farm_house_id
JOIN dbo.farms AS f ON f.id = fh.farm_id
JOIN dbo.feed_types AS ft ON ft.id = fb.feed_type_id
WHERE lf.status = N'Open';
GO

CREATE OR ALTER VIEW dbo.vw_load_history AS
SELECT
    l.id AS load_id,
    l.load_number,
    f.farm_code,
    f.farm_name,
    fh.house_code,
    fb.bin_code,
    ft.feed_name,
    l.planned_tons,
    dt.actual_tons,
    dt.actual_tons - l.planned_tons AS tons_variance,
    l.priority,
    l.status,
    l.scheduled_delivery_datetime,
    dt.delivered_at,
    dt.ticket_number,
    dt.reconciled
FROM dbo.loads AS l
JOIN dbo.farms AS f ON f.id = l.farm_id
JOIN dbo.feed_bins AS fb ON fb.id = l.feed_bin_id
JOIN dbo.farm_houses AS fh ON fh.id = fb.farm_house_id
JOIN dbo.feed_types AS ft ON ft.id = l.feed_type_id
LEFT JOIN dbo.delivery_tickets AS dt ON dt.load_id = l.id;
GO
