from __future__ import annotations

from src.database import create_tables
from src.seed import seed_if_empty


def main() -> None:
    create_tables()
    seed_if_empty()
    print("Sample data seed complete. Existing non-empty farm data was left unchanged.")


if __name__ == "__main__":
    main()
