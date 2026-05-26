import { prisma } from "@/lib/db";
import { generateLoadForecasts, refreshInventoryEstimates, runDataQualityChecks } from "@/lib/ops";

let bootPromise: Promise<void> | null = null;

export async function ensureDatabaseReady() {
  bootPromise ??= (async () => {
    const farmCount = await prisma.farm.count();
    if (farmCount === 0 && process.env.SEED_SAMPLE_DATA !== "false") {
      await seedSampleData();
    }
    if (process.env.RUN_STARTUP_JOBS !== "false") {
      await refreshInventoryEstimates();
      await generateLoadForecasts();
      await runDataQualityChecks();
    }
  })();
  return bootPromise;
}

async function seedSampleData() {
  const now = new Date();
  const feedTypes = await Promise.all(
    [
      ["START", "Starter Feed"],
      ["GROW", "Grower Feed"],
      ["FIN", "Finisher Feed"],
      ["WD", "Withdrawal Feed"]
    ].map(([feedCode, feedName]) => prisma.feedType.create({ data: { feedCode, feedName } }))
  );
  const farms = await Promise.all(
    [
      ["F-100", "Cedar Ridge Farm", "Mason Clark", "North", "N-1", "County Road 18"],
      ["F-200", "Turkey Creek Farm", "Evan Miller", "East", "E-2", "Turkey Creek Road"],
      ["F-300", "Oak Hollow Farm", "Sarah Walker", "South", "S-1", "Oak Hollow Lane"],
      ["F-400", "Clearwater Farm", "Ben Taylor", "West", "W-4", "Clearwater Road"]
    ].map(([farmCode, farmName, growerName, region, route, address]) =>
      prisma.farm.create({ data: { farmCode, farmName, growerName, region, route, address } })
    )
  );
  const houses = [];
  for (const farm of farms) {
    houses.push(await prisma.farmHouse.create({ data: { farmId: farm.id, houseCode: "H1", birdCount: 24500, flockAgeDays: 18 } }));
    houses.push(await prisma.farmHouse.create({ data: { farmId: farm.id, houseCode: "H2", birdCount: 23800, flockAgeDays: 24 } }));
  }
  for (let i = 0; i < houses.length; i++) {
    await prisma.flock.create({
      data: {
        farmHouseId: houses[i].id,
        flockCode: `FL-${1000 + i}`,
        placementDate: new Date(now.getTime() - (18 + (i % 4) * 4) * 24 * 60 * 60 * 1000),
        birdCount: houses[i].birdCount ?? 24000,
        breed: "Broiler",
        targetMarketDays: 42,
        active: true,
        notes: "Seed active flock"
      }
    });
  }
  const bins = [];
  for (let i = 0; i < houses.length; i++) {
    const feedType = feedTypes[i % feedTypes.length];
    bins.push(await prisma.feedBin.create({ data: { farmHouseId: houses[i].id, feedTypeId: feedType.id, binCode: "B1", capacityTons: 18, estimatedDailyConsumptionTons: 2.3 + (i % 3) * 0.4, minimumSafeTons: 2 } }));
    bins.push(await prisma.feedBin.create({ data: { farmHouseId: houses[i].id, feedTypeId: feedType.id, binCode: "B2", capacityTons: 20, estimatedDailyConsumptionTons: 2.1 + (i % 2) * 0.5, minimumSafeTons: 2.5 } }));
  }
  const sampleLevels = [13.5, 7.8, 4.2, 15, 2.1, 11.7, 19.5, 3.6, 8.5, 12, 1.8, 17.2, 6.6, 9.4, 14.7, 5.3];
  const hoursAgo = [4, 10, 20, 30, 42, 8, 6, 52, 12, 15, 3, 28, 40, 2, 18, 60];
  const sources = ["Sensor", "Grower", "Driver", "Manual"];
  for (let i = 0; i < bins.length; i++) {
    const tons = sampleLevels[i % sampleLevels.length];
    await prisma.binReading.create({
      data: {
        feedBinId: bins[i].id,
        readingDatetime: new Date(now.getTime() - hoursAgo[i % hoursAgo.length] * 60 * 60 * 1000),
        source: sources[i % sources.length],
        readingTons: tons,
        readingPercent: Math.round((tons / bins[i].capacityTons) * 1000) / 10,
        notes: "Seed reading",
        createdBy: "system"
      }
    });
  }
  await prisma.binReading.create({
    data: {
      feedBinId: bins[0].id,
      readingDatetime: new Date(now.getTime() - 60 * 60 * 1000),
      source: "Manual",
      readingTons: 21.2,
      readingPercent: 117.8,
      notes: "Intentionally suspicious sample reading",
      createdBy: "system"
    }
  });
  const load1 = await prisma.load.create({
    data: {
      loadNumber: "LD-10001",
      farmId: farms[0].id,
      feedBinId: bins[1].id,
      feedTypeId: bins[1].feedTypeId,
      plannedTons: 17.5,
      scheduledDeliveryDatetime: new Date(now.getTime() + 6 * 60 * 60 * 1000),
      priority: "High",
      status: "Scheduled",
      truck: "Truck 14",
      driver: "R. Johnson",
      route: farms[0].route,
      notes: "Seed scheduled load",
      createdBy: "system"
    }
  });
  const load2 = await prisma.load.create({
    data: {
      loadNumber: "LD-10002",
      farmId: farms[2].id,
      feedBinId: bins[10].id,
      feedTypeId: bins[10].feedTypeId,
      plannedTons: 16,
      scheduledDeliveryDatetime: new Date(now.getTime() - 5 * 60 * 60 * 1000),
      priority: "Critical",
      status: "Delivered",
      truck: "Truck 07",
      driver: "L. Sanders",
      route: farms[2].route,
      notes: "Seed delivered load",
      createdBy: "system"
    }
  });
  await prisma.loadStatusHistory.createMany({
    data: [
      { loadId: load1.id, newStatus: "Planned", changedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), changedBy: "system" },
      { loadId: load1.id, oldStatus: "Planned", newStatus: "Scheduled", changedAt: new Date(now.getTime() - 60 * 60 * 1000), changedBy: "system" },
      { loadId: load2.id, newStatus: "Planned", changedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000), changedBy: "system" },
      { loadId: load2.id, oldStatus: "Planned", newStatus: "Delivered", changedAt: new Date(now.getTime() - 4 * 60 * 60 * 1000), changedBy: "system" }
    ]
  });
  await prisma.deliveryTicket.create({
    data: {
      loadId: load2.id,
      ticketNumber: "TKT-90001",
      deliveredAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      actualTons: 15.2,
      feedTypeId: bins[10].feedTypeId,
      reconciled: false,
      reconciliationNotes: "Seed ticket awaiting reconciliation"
    }
  });
}
