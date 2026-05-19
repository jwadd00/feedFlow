-- Azure SQL reference DDL for the FeedFlow MVP.
-- The app normally creates tables through SQLAlchemy models. Use this script
-- when you want to review or provision the schema directly in Azure SQL.

IF OBJECT_ID(N'dbo.data_quality_issues', N'U') IS NULL
CREATE TABLE dbo.data_quality_issues (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_data_quality_issues PRIMARY KEY,
    rule_code NVARCHAR(100) NOT NULL,
    entity_type NVARCHAR(100) NOT NULL,
    entity_id INT NOT NULL,
    severity NVARCHAR(50) NOT NULL,
    issue_status NVARCHAR(50) NOT NULL CONSTRAINT df_data_quality_issues_issue_status DEFAULT N'Open',
    detected_at DATETIME2 NOT NULL,
    assigned_to NVARCHAR(100) NULL,
    issue_summary NVARCHAR(MAX) NOT NULL,
    resolution_notes NVARCHAR(MAX) NULL,
    resolved_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT uq_open_issue UNIQUE (rule_code, entity_type, entity_id, issue_status)
);
GO

IF OBJECT_ID(N'dbo.farms', N'U') IS NULL
CREATE TABLE dbo.farms (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_farms PRIMARY KEY,
    farm_code NVARCHAR(50) NOT NULL,
    farm_name NVARCHAR(200) NOT NULL,
    grower_name NVARCHAR(200) NULL,
    region NVARCHAR(100) NULL,
    route NVARCHAR(100) NULL,
    address NVARCHAR(300) NULL,
    active BIT NOT NULL CONSTRAINT df_farms_active DEFAULT 1,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT uq_farms_farm_code UNIQUE (farm_code)
);
GO

IF OBJECT_ID(N'dbo.farm_houses', N'U') IS NULL
CREATE TABLE dbo.farm_houses (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_farm_houses PRIMARY KEY,
    farm_id INT NOT NULL,
    house_code NVARCHAR(50) NOT NULL,
    bird_count INT NULL,
    flock_age_days INT NULL,
    active BIT NOT NULL CONSTRAINT df_farm_houses_active DEFAULT 1,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT fk_farm_houses_farms FOREIGN KEY (farm_id) REFERENCES dbo.farms(id),
    CONSTRAINT uq_farm_house UNIQUE (farm_id, house_code)
);
GO

IF OBJECT_ID(N'dbo.feed_types', N'U') IS NULL
CREATE TABLE dbo.feed_types (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_feed_types PRIMARY KEY,
    feed_code NVARCHAR(50) NOT NULL,
    feed_name NVARCHAR(200) NOT NULL,
    active BIT NOT NULL CONSTRAINT df_feed_types_active DEFAULT 1,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT uq_feed_types_feed_code UNIQUE (feed_code)
);
GO

IF OBJECT_ID(N'dbo.feed_bins', N'U') IS NULL
CREATE TABLE dbo.feed_bins (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_feed_bins PRIMARY KEY,
    farm_house_id INT NOT NULL,
    feed_type_id INT NOT NULL,
    bin_code NVARCHAR(50) NOT NULL,
    capacity_tons FLOAT NOT NULL,
    estimated_daily_consumption_tons FLOAT NOT NULL,
    minimum_safe_tons FLOAT NOT NULL CONSTRAINT df_feed_bins_minimum_safe_tons DEFAULT 2.0,
    active BIT NOT NULL CONSTRAINT df_feed_bins_active DEFAULT 1,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT fk_feed_bins_farm_houses FOREIGN KEY (farm_house_id) REFERENCES dbo.farm_houses(id),
    CONSTRAINT fk_feed_bins_feed_types FOREIGN KEY (feed_type_id) REFERENCES dbo.feed_types(id),
    CONSTRAINT uq_house_bin UNIQUE (farm_house_id, bin_code)
);
GO

IF OBJECT_ID(N'dbo.bin_readings', N'U') IS NULL
CREATE TABLE dbo.bin_readings (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_bin_readings PRIMARY KEY,
    feed_bin_id INT NOT NULL,
    reading_datetime DATETIME2 NOT NULL,
    source NVARCHAR(50) NOT NULL,
    reading_tons FLOAT NOT NULL,
    reading_percent FLOAT NULL,
    notes NVARCHAR(MAX) NULL,
    created_by NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT fk_bin_readings_feed_bins FOREIGN KEY (feed_bin_id) REFERENCES dbo.feed_bins(id)
);
GO

IF OBJECT_ID(N'dbo.bin_inventory_estimates', N'U') IS NULL
CREATE TABLE dbo.bin_inventory_estimates (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_bin_inventory_estimates PRIMARY KEY,
    feed_bin_id INT NOT NULL,
    last_reading_id INT NULL,
    estimated_at DATETIME2 NOT NULL,
    current_estimated_tons FLOAT NOT NULL,
    percent_full FLOAT NOT NULL,
    daily_consumption_tons FLOAT NOT NULL,
    projected_empty_datetime DATETIME2 NULL,
    days_remaining FLOAT NULL,
    risk_level NVARCHAR(50) NOT NULL,
    confidence_score FLOAT NOT NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT fk_bin_inventory_estimates_feed_bins FOREIGN KEY (feed_bin_id) REFERENCES dbo.feed_bins(id),
    CONSTRAINT fk_bin_inventory_estimates_bin_readings FOREIGN KEY (last_reading_id) REFERENCES dbo.bin_readings(id),
    CONSTRAINT uq_bin_inventory_estimates_feed_bin_id UNIQUE (feed_bin_id)
);
GO

IF OBJECT_ID(N'dbo.load_forecasts', N'U') IS NULL
CREATE TABLE dbo.load_forecasts (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_load_forecasts PRIMARY KEY,
    feed_bin_id INT NOT NULL,
    generated_at DATETIME2 NOT NULL,
    current_estimated_tons FLOAT NOT NULL,
    days_remaining FLOAT NULL,
    recommended_delivery_datetime DATETIME2 NULL,
    recommended_tons FLOAT NOT NULL,
    priority NVARCHAR(50) NOT NULL,
    confidence_score FLOAT NOT NULL,
    reason NVARCHAR(MAX) NOT NULL,
    status NVARCHAR(50) NOT NULL CONSTRAINT df_load_forecasts_status DEFAULT N'Open',
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT fk_load_forecasts_feed_bins FOREIGN KEY (feed_bin_id) REFERENCES dbo.feed_bins(id)
);
GO

IF OBJECT_ID(N'dbo.loads', N'U') IS NULL
CREATE TABLE dbo.loads (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_loads PRIMARY KEY,
    load_number NVARCHAR(50) NOT NULL,
    farm_id INT NOT NULL,
    feed_bin_id INT NOT NULL,
    feed_type_id INT NOT NULL,
    created_from_forecast_id INT NULL,
    planned_tons FLOAT NOT NULL,
    scheduled_delivery_datetime DATETIME2 NULL,
    priority NVARCHAR(50) NOT NULL,
    status NVARCHAR(50) NOT NULL CONSTRAINT df_loads_status DEFAULT N'Planned',
    truck NVARCHAR(100) NULL,
    driver NVARCHAR(100) NULL,
    route NVARCHAR(100) NULL,
    notes NVARCHAR(MAX) NULL,
    created_by NVARCHAR(100) NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT uq_loads_load_number UNIQUE (load_number),
    CONSTRAINT fk_loads_farms FOREIGN KEY (farm_id) REFERENCES dbo.farms(id),
    CONSTRAINT fk_loads_feed_bins FOREIGN KEY (feed_bin_id) REFERENCES dbo.feed_bins(id),
    CONSTRAINT fk_loads_feed_types FOREIGN KEY (feed_type_id) REFERENCES dbo.feed_types(id),
    CONSTRAINT fk_loads_load_forecasts FOREIGN KEY (created_from_forecast_id) REFERENCES dbo.load_forecasts(id)
);
GO

IF OBJECT_ID(N'dbo.load_status_history', N'U') IS NULL
CREATE TABLE dbo.load_status_history (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_load_status_history PRIMARY KEY,
    load_id INT NOT NULL,
    old_status NVARCHAR(50) NULL,
    new_status NVARCHAR(50) NOT NULL,
    changed_at DATETIME2 NOT NULL,
    changed_by NVARCHAR(100) NULL,
    notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT fk_load_status_history_loads FOREIGN KEY (load_id) REFERENCES dbo.loads(id)
);
GO

IF OBJECT_ID(N'dbo.delivery_tickets', N'U') IS NULL
CREATE TABLE dbo.delivery_tickets (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT pk_delivery_tickets PRIMARY KEY,
    load_id INT NOT NULL,
    ticket_number NVARCHAR(100) NOT NULL,
    delivered_at DATETIME2 NOT NULL,
    actual_tons FLOAT NOT NULL,
    feed_type_id INT NOT NULL,
    reconciled BIT NOT NULL CONSTRAINT df_delivery_tickets_reconciled DEFAULT 0,
    reconciliation_notes NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT uq_delivery_tickets_ticket_number UNIQUE (ticket_number),
    CONSTRAINT fk_delivery_tickets_loads FOREIGN KEY (load_id) REFERENCES dbo.loads(id),
    CONSTRAINT fk_delivery_tickets_feed_types FOREIGN KEY (feed_type_id) REFERENCES dbo.feed_types(id)
);
GO
