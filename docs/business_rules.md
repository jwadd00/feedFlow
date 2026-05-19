# Business Rules

## Inventory Rules

- A bin reading should not exceed bin capacity.
- A bin reading should not be negative.
- A reading older than 36 hours is stale.
- Current inventory estimate = latest reading tons minus expected consumption since that reading.
- Sensor/driver/grower/manual readings are tracked separately by source.

## Forecast Rules

- Bins projected to run out within 5 days are forecast candidates.
- Recommended delivery date = projected empty date minus 1 day buffer.
- Priority logic:
  - Critical: less than or equal to 1 day remaining
  - High: less than or equal to 2 days remaining
  - Medium: less than or equal to 4 days remaining
  - Low: otherwise
- Recommended tons are calculated to fill the bin to 92% of capacity.

## Load Rules

- A forecast can be converted into a planned load.
- Every status change is written to `load_status_history`.
- Valid load statuses:
  - Planned
  - Scheduled
  - Released to Mill
  - Loaded
  - In Transit
  - Delivered
  - Ticket Reconciled
  - Exception
  - Cancelled

## Data Quality Rules

- Missing reading creates a high-severity issue.
- Stale reading creates a medium-severity issue.
- Reading over capacity creates a high-severity issue.
- Runout within 1 day creates high/critical issue.
- Delivered load with no ticket creates a high-severity issue.
- Ticket actual tons differing from planned by more than 1 ton creates a medium-severity issue.
