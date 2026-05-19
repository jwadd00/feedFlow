from src.database import ensure_database_ready
from src.inventory import refresh_inventory_estimates
from src.forecasting import generate_load_forecasts
from src.data_quality import run_data_quality_checks

if __name__ == "__main__":
    ensure_database_ready()
    inventory_count = refresh_inventory_estimates()
    forecast_count = generate_load_forecasts()
    issue_count = run_data_quality_checks()
    print(f"Inventory estimates refreshed: {inventory_count}")
    print(f"Open forecasts updated: {forecast_count}")
    print(f"Open data quality issues: {issue_count}")
