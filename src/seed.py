from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select

from src.database import get_session, retry_database_operation
from src.models import (
    BinReading,
    DeliveryTicket,
    Farm,
    FarmHouse,
    FeedBin,
    FeedType,
    Load,
    LoadStatusHistory,
)


@retry_database_operation("seed sample data")
def seed_if_empty() -> None:
    with get_session() as session:
        existing = session.scalar(select(Farm).limit(1))
        if existing:
            return

        starter = FeedType(feed_code="START", feed_name="Starter Feed")
        grower = FeedType(feed_code="GROW", feed_name="Grower Feed")
        finisher = FeedType(feed_code="FIN", feed_name="Finisher Feed")
        withdrawal = FeedType(feed_code="WD", feed_name="Withdrawal Feed")
        session.add_all([starter, grower, finisher, withdrawal])
        session.flush()

        farms = [
            Farm(farm_code="F-100", farm_name="Cedar Ridge Farm", grower_name="Mason Clark", region="North", route="N-1", address="County Road 18"),
            Farm(farm_code="F-200", farm_name="Turkey Creek Farm", grower_name="Evan Miller", region="East", route="E-2", address="Turkey Creek Road"),
            Farm(farm_code="F-300", farm_name="Oak Hollow Farm", grower_name="Sarah Walker", region="South", route="S-1", address="Oak Hollow Lane"),
            Farm(farm_code="F-400", farm_name="Clearwater Farm", grower_name="Ben Taylor", region="West", route="W-4", address="Clearwater Road"),
        ]
        session.add_all(farms)
        session.flush()

        houses = []
        for farm in farms:
            houses.extend([
                FarmHouse(farm_id=farm.id, house_code="H1", bird_count=24500, flock_age_days=18),
                FarmHouse(farm_id=farm.id, house_code="H2", bird_count=23800, flock_age_days=24),
            ])
        session.add_all(houses)
        session.flush()

        feed_types = [starter, grower, finisher, withdrawal]
        bins = []
        for idx, house in enumerate(houses):
            feed_type = feed_types[idx % len(feed_types)]
            bins.extend([
                FeedBin(
                    farm_house_id=house.id,
                    feed_type_id=feed_type.id,
                    bin_code="B1",
                    capacity_tons=18.0,
                    estimated_daily_consumption_tons=2.3 + (idx % 3) * 0.4,
                    minimum_safe_tons=2.0,
                ),
                FeedBin(
                    farm_house_id=house.id,
                    feed_type_id=feed_type.id,
                    bin_code="B2",
                    capacity_tons=20.0,
                    estimated_daily_consumption_tons=2.1 + (idx % 2) * 0.5,
                    minimum_safe_tons=2.5,
                ),
            ])
        session.add_all(bins)
        session.flush()

        now = datetime.utcnow()
        sample_levels = [13.5, 7.8, 4.2, 15.0, 2.1, 11.7, 19.5, 3.6, 8.5, 12.0, 1.8, 17.2, 6.6, 9.4, 14.7, 5.3]
        sources = ["Sensor", "Grower", "Driver", "Manual"]
        readings = []
        for i, feed_bin in enumerate(bins):
            hours_ago = [4, 10, 20, 30, 42, 8, 6, 52, 12, 15, 3, 28, 40, 2, 18, 60][i % 16]
            tons = sample_levels[i % len(sample_levels)]
            readings.append(
                BinReading(
                    feed_bin_id=feed_bin.id,
                    reading_datetime=now - timedelta(hours=hours_ago),
                    source=sources[i % len(sources)],
                    reading_tons=tons,
                    reading_percent=round((tons / feed_bin.capacity_tons) * 100, 1),
                    notes="Seed reading",
                    created_by="system",
                )
            )
        # Add one intentionally suspicious reading over capacity for data quality testing.
        readings.append(
            BinReading(
                feed_bin_id=bins[0].id,
                reading_datetime=now - timedelta(hours=1),
                source="Manual",
                reading_tons=21.2,
                reading_percent=117.8,
                notes="Intentionally suspicious sample reading",
                created_by="system",
            )
        )
        session.add_all(readings)
        session.flush()

        # Add sample loads.
        farm = farms[0]
        feed_bin = bins[1]
        load_1 = Load(
            load_number="LD-10001",
            farm_id=farm.id,
            feed_bin_id=feed_bin.id,
            feed_type_id=feed_bin.feed_type_id,
            planned_tons=17.5,
            scheduled_delivery_datetime=now + timedelta(hours=6),
            priority="High",
            status="Scheduled",
            truck="Truck 14",
            driver="R. Johnson",
            route=farm.route,
            notes="Seed scheduled load",
            created_by="system",
        )
        farm2 = farms[2]
        feed_bin2 = bins[10]
        load_2 = Load(
            load_number="LD-10002",
            farm_id=farm2.id,
            feed_bin_id=feed_bin2.id,
            feed_type_id=feed_bin2.feed_type_id,
            planned_tons=16.0,
            scheduled_delivery_datetime=now - timedelta(hours=5),
            priority="Critical",
            status="Delivered",
            truck="Truck 07",
            driver="L. Sanders",
            route=farm2.route,
            notes="Seed delivered load",
            created_by="system",
        )
        session.add_all([load_1, load_2])
        session.flush()

        session.add_all([
            LoadStatusHistory(load_id=load_1.id, old_status=None, new_status="Planned", changed_at=now - timedelta(hours=2), changed_by="system"),
            LoadStatusHistory(load_id=load_1.id, old_status="Planned", new_status="Scheduled", changed_at=now - timedelta(hours=1), changed_by="system"),
            LoadStatusHistory(load_id=load_2.id, old_status=None, new_status="Planned", changed_at=now - timedelta(hours=12), changed_by="system"),
            LoadStatusHistory(load_id=load_2.id, old_status="Planned", new_status="Delivered", changed_at=now - timedelta(hours=4), changed_by="system"),
        ])

        ticket = DeliveryTicket(
            load_id=load_2.id,
            ticket_number="TKT-90001",
            delivered_at=now - timedelta(hours=4),
            actual_tons=15.2,
            feed_type_id=feed_bin2.feed_type_id,
            reconciled=False,
            reconciliation_notes="Seed ticket awaiting reconciliation",
        )
        session.add(ticket)
        session.commit()
