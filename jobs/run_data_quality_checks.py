from src.database import ensure_database_ready
from src.data_quality import run_data_quality_checks

if __name__ == "__main__":
    ensure_database_ready()
    count = run_data_quality_checks()
    print(f"Open data quality issues: {count}")
