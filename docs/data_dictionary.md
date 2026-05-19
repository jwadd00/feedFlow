# Data Dictionary

## Core Master Data

| Table | Purpose |
|---|---|
| `farms` | Farm-level master data: farm code, name, grower, region, route. |
| `farm_houses` | Houses/barns associated to farms. Includes bird count and flock age. |
| `feed_types` | Feed product/ration definitions. |
| `feed_bins` | Bin master data: house, bin code, feed type, capacity, estimated daily consumption. |

## Operational Data

| Table | Purpose |
|---|---|
| `bin_readings` | Raw bin reading events from sensor, grower, driver, or manual entry. |
| `bin_inventory_estimates` | Current calculated inventory per active bin. |
| `load_forecasts` | Forecasted load needs generated from inventory estimates. |
| `loads` | Planned/scheduled/active/delivered load records. |
| `load_status_history` | Immutable status-transition history for each load. |
| `delivery_tickets` | Ticket data with actual delivered tons. |
| `data_quality_issues` | Open/resolved/ignored data quality exceptions. |
