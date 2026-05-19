from src.database import ensure_database_ready
from src.inventory import refresh_inventory_estimates

if __name__ == "__main__":
    ensure_database_ready()
    count = refresh_inventory_estimates()
    print(f"Inventory estimates refreshed: {count}")
