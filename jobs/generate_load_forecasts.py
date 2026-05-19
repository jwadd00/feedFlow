from src.database import ensure_database_ready
from src.forecasting import generate_load_forecasts

if __name__ == "__main__":
    ensure_database_ready()
    count = generate_load_forecasts()
    print(f"Open forecasts updated: {count}")
