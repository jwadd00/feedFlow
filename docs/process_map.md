# FeedFlow Process Map

## MVP Process Boundary

Start: a bin reading is captured or estimated.

End: a delivered load is reconciled and added to load history.

```text
Bin Reading
  ↓
Inventory Estimate
  ↓
Projected Need
  ↓
Planned Load
  ↓
Scheduled Load
  ↓
Delivered Load
  ↓
Reconciled Load
  ↓
Historical Analytics
```

## Future-State Workflow

| Step | Process Area | Owner | Trigger | System Action | Human Action | Output |
|---:|---|---|---|---|---|---|
| 1 | Bin Surveillance | System / Grower / Driver | New reading | Capture reading event | Confirm manual reading | New bin reading |
| 2 | Data Quality | System | Reading received | Validate stale/impossible/conflicting data | Resolve exceptions | Validated inventory |
| 3 | Inventory Estimate | System | Valid reading or elapsed time | Calculate current tons, percent full, projected empty | Override only if needed | Current inventory estimate |
| 4 | Forecasting | System | Estimate updated | Recommend load need | Planner approves/defers | Forecasted need |
| 5 | Load Planning | Planner | Forecast open | Convert need to planned load | Edit tons/date | Planned load |
| 6 | Dispatch | Dispatcher | Planned load | Assign truck/driver/route | Schedule load | Scheduled load |
| 7 | Mill | Mill Ops | Scheduled load | Show release queue | Produce/load feed | Loaded load |
| 8 | Delivery | Driver | Load in transit | Track status | Confirm delivery/ticket | Delivered load |
| 9 | Reconciliation | Admin/System | Ticket received | Compare planned vs actual | Resolve mismatches | Closed load |
| 10 | Analytics | System/Manager | Load closed | Update KPIs | Review performance | History insights |
