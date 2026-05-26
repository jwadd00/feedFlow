const { PrismaClient } = require("@prisma/client");
const { defaultSqliteDatabaseUrl } = require("./sqlite-url.cjs");

process.env.SQLITE_DATABASE_URL ||= defaultSqliteDatabaseUrl();
const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;
const now = new Date();

const feedTypes = [
  ["START", "Starter Feed"],
  ["GROW", "Grower Feed"],
  ["FIN", "Finisher Feed"],
  ["WD", "Withdrawal Feed"]
];

const farms = [
  { code: "DF-510", name: "Prairie View Farm", grower: "Nora Jenkins", region: "North", route: "N-3", houses: 4 },
  { code: "DF-520", name: "Blue Stem Farm", grower: "Caleb Ortiz", region: "East", route: "E-4", houses: 6 },
  { code: "DF-530", name: "Riverbend Farm", grower: "Maya Thompson", region: "South", route: "S-2", houses: 8 },
  { code: "DF-540", name: "High Plains Farm", grower: "Owen Brooks", region: "West", route: "W-2", houses: 4 },
  { code: "DF-550", name: "Maple Line Farm", grower: "Lena Foster", region: "Central", route: "C-1", houses: 6 }
];

const agePattern = [7, 9, 11, 13, 15, 17, 19, 21];
const levelPattern = [0.18, 0.31, 0.45, 0.58, 0.72, 0.84, 0.25, 0.66, 0.39, 0.91];
const sources = ["Sensor", "Grower", "Driver", "Manual"];

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY);
}

function flockAgeDays(placementDate) {
  return Math.max(0, Math.floor((now.getTime() - placementDate.getTime()) / DAY));
}

function ageMultiplier(age) {
  if (age <= 7) return 0.35;
  if (age <= 14) return 0.55;
  if (age <= 21) return 0.8;
  if (age <= 28) return 1;
  if (age <= 35) return 1.15;
  if (age <= 42) return 1.3;
  if (age <= 56) return 1.15;
  return 0.9;
}

function classifyRisk(daysRemaining, currentTons, minSafeTons) {
  if (daysRemaining === null || currentTons === null) return "Unknown";
  if (currentTons <= 0 || daysRemaining <= 0.5) return "Critical";
  if (currentTons <= (minSafeTons || 0) || daysRemaining <= 1.5) return "High";
  if (daysRemaining <= 3) return "Watch";
  return "Normal";
}

function forecastPriority(daysRemaining) {
  if (daysRemaining === null) return "Medium";
  if (daysRemaining <= 1) return "Critical";
  if (daysRemaining <= 2) return "High";
  if (daysRemaining <= 4) return "Medium";
  return "Low";
}

function confidenceScore(source, hoursSinceReading, suspicious) {
  let score = 100;
  if (source === "Manual" || source === "Grower") score -= 5;
  else if (source === "Driver") score -= 3;
  else if (source === "Estimate") score -= 15;
  if (hoursSinceReading > 36) score -= Math.min(40, (hoursSinceReading - 36) * 1.5);
  else if (hoursSinceReading > 24) score -= 10;
  if (suspicious) score -= 30;
  return Math.max(0, Math.round(score * 10) / 10);
}

async function refreshEstimates() {
  const bins = await prisma.feedBin.findMany({
    where: { active: true },
    include: { house: { include: { flocks: { where: { active: true }, orderBy: { placementDate: "desc" }, take: 1 } } } }
  });

  for (const bin of bins) {
    const flock = bin.house.flocks[0];
    const age = flock ? flockAgeDays(flock.placementDate) : null;
    const baseDaily = flock?.baseDailyTons ?? bin.estimatedDailyConsumptionTons;
    const birdFactor = flock && bin.house.birdCount ? flock.birdCount / bin.house.birdCount : 1;
    const daily = Math.max(0, Math.round(baseDaily * birdFactor * (age === null ? 1 : ageMultiplier(age)) * 100) / 100);
    const reading = await prisma.binReading.findFirst({
      where: { feedBinId: bin.id },
      orderBy: [{ readingDatetime: "desc" }, { id: "desc" }]
    });

    let values;
    if (!reading) {
      values = {
        lastReadingId: null,
        estimatedAt: now,
        currentEstimatedTons: 0,
        percentFull: 0,
        dailyConsumptionTons: daily,
        projectedEmptyDatetime: null,
        daysRemaining: null,
        riskLevel: "Unknown",
        confidenceScore: 0
      };
    } else {
      const hours = Math.max(0, (now.getTime() - reading.readingDatetime.getTime()) / 36e5);
      const current = Math.max(0, reading.readingTons - daily * (hours / 24));
      const days = daily > 0 ? current / daily : null;
      values = {
        lastReadingId: reading.id,
        estimatedAt: now,
        currentEstimatedTons: Math.round(current * 100) / 100,
        percentFull: bin.capacityTons ? Math.round(Math.min(200, (current / bin.capacityTons) * 100) * 10) / 10 : 0,
        dailyConsumptionTons: daily,
        projectedEmptyDatetime: days === null ? null : addDays(now, days),
        daysRemaining: days === null ? null : Math.round(days * 100) / 100,
        riskLevel: classifyRisk(days, current, bin.minimumSafeTons),
        confidenceScore: confidenceScore(reading.source, hours, reading.readingTons > bin.capacityTons || reading.readingTons < 0)
      };
    }

    await prisma.binInventoryEstimate.upsert({
      where: { feedBinId: bin.id },
      update: values,
      create: { feedBinId: bin.id, ...values }
    });
  }
}

async function generateForecasts() {
  const estimates = await prisma.binInventoryEstimate.findMany({ include: { feedBin: true } });

  for (const estimate of estimates) {
    if (!estimate.feedBin.active) continue;
    if (!(estimate.daysRemaining === null || estimate.daysRemaining <= 5)) continue;

    const priority = forecastPriority(estimate.daysRemaining);
    let recommendedDeliveryDatetime = null;
    if (estimate.projectedEmptyDatetime) {
      recommendedDeliveryDatetime = addDays(estimate.projectedEmptyDatetime, -1);
      if (recommendedDeliveryDatetime < now) recommendedDeliveryDatetime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }

    const recommendedTons = Math.round(Math.max(0, estimate.feedBin.capacityTons * 0.92 - estimate.currentEstimatedTons) * 10) / 10;
    if (recommendedTons <= 0 && !["Critical", "High"].includes(estimate.riskLevel)) continue;

    const reason =
      estimate.daysRemaining === null
        ? "No projected empty date available because current inventory confidence is too low or consumption is missing."
        : `Projected to run out in ${estimate.daysRemaining.toFixed(1)} day(s). Current estimate is ${estimate.currentEstimatedTons.toFixed(1)} tons. Recommended delivery is ${recommendedTons.toFixed(1)} tons. Inventory confidence score is ${estimate.confidenceScore.toFixed(0)}.`;

    const open = await prisma.loadForecast.findFirst({
      where: { feedBinId: estimate.feedBinId, status: "Open" },
      orderBy: { generatedAt: "desc" }
    });
    const data = {
      generatedAt: now,
      currentEstimatedTons: estimate.currentEstimatedTons,
      daysRemaining: estimate.daysRemaining,
      recommendedDeliveryDatetime,
      recommendedTons,
      priority,
      confidenceScore: estimate.confidenceScore,
      reason,
      status: "Open"
    };

    if (open) await prisma.loadForecast.update({ where: { id: open.id }, data });
    else await prisma.loadForecast.create({ data: { feedBinId: estimate.feedBinId, ...data } });
  }
}

async function main() {
  const feedTypeRows = [];
  for (const [feedCode, feedName] of feedTypes) {
    feedTypeRows.push(
      await prisma.feedType.upsert({
        where: { feedCode },
        update: { feedName, active: true },
        create: { feedCode, feedName, active: true }
      })
    );
  }

  let houseTotal = 0;
  let binTotal = 0;
  let flockTotal = 0;

  for (let farmIndex = 0; farmIndex < farms.length; farmIndex++) {
    const spec = farms[farmIndex];
    const farm = await prisma.farm.upsert({
      where: { farmCode: spec.code },
      update: {
        farmName: spec.name,
        growerName: spec.grower,
        region: spec.region,
        route: spec.route,
        address: `${spec.name} Road`,
        active: true
      },
      create: {
        farmCode: spec.code,
        farmName: spec.name,
        growerName: spec.grower,
        region: spec.region,
        route: spec.route,
        address: `${spec.name} Road`,
        active: true
      }
    });

    for (let houseIndex = 1; houseIndex <= spec.houses; houseIndex++) {
      const houseCode = `H${houseIndex}`;
      const birdCount = 22000 + farmIndex * 750 + houseIndex * 325;
      const house = await prisma.farmHouse.upsert({
        where: { uq_farm_house: { farmId: farm.id, houseCode } },
        update: { birdCount, flockAgeDays: null, active: true },
        create: { farmId: farm.id, houseCode, birdCount, flockAgeDays: null, active: true }
      });
      houseTotal++;

      const age = agePattern[(farmIndex + houseIndex - 1) % agePattern.length];
      const flockCode = `${spec.code}-FLOCK-${houseCode}`;
      await prisma.flock.upsert({
        where: { uq_house_flock: { farmHouseId: house.id, flockCode } },
        update: {
          placementDate: new Date(now.getTime() - age * DAY),
          birdCount,
          breed: "Broiler",
          targetMarketDays: 42,
          baseDailyTons: null,
          active: true,
          notes: `Demo flock aged ${age} days.`
        },
        create: {
          farmHouseId: house.id,
          flockCode,
          placementDate: new Date(now.getTime() - age * DAY),
          birdCount,
          breed: "Broiler",
          targetMarketDays: 42,
          baseDailyTons: null,
          active: true,
          notes: `Demo flock aged ${age} days.`
        }
      });
      flockTotal++;

      for (let binNumber = 1; binNumber <= 2; binNumber++) {
        const feedType = feedTypeRows[(farmIndex + houseIndex + binNumber) % feedTypeRows.length];
        const capacityTons = binNumber === 1 ? 18 + (houseIndex % 3) : 20 + (farmIndex % 3);
        const baseDaily = Math.round((2.0 + (houseIndex % 4) * 0.25 + farmIndex * 0.12 + binNumber * 0.08) * 10) / 10;
        const minimumSafeTons = binNumber === 1 ? 2.0 : 2.5;
        const binCode = `B${binNumber}`;
        const bin = await prisma.feedBin.upsert({
          where: { uq_house_bin: { farmHouseId: house.id, binCode } },
          update: { feedTypeId: feedType.id, capacityTons, estimatedDailyConsumptionTons: baseDaily, minimumSafeTons, active: true },
          create: { farmHouseId: house.id, feedTypeId: feedType.id, binCode, capacityTons, estimatedDailyConsumptionTons: baseDaily, minimumSafeTons, active: true }
        });
        binTotal++;

        const level = levelPattern[(farmIndex * 7 + houseIndex * 2 + binNumber) % levelPattern.length];
        const readingTons = Math.round(capacityTons * level * 10) / 10;
        const hoursAgo = 2 + ((farmIndex + houseIndex + binNumber) % 8) * 3;
        const source = sources[(farmIndex + houseIndex + binNumber) % sources.length];
        const marker = `${spec.code}-${houseCode}-${binCode}-CURRENT`;
        const existingReading = await prisma.binReading.findFirst({ where: { feedBinId: bin.id, notes: marker } });
        const readingData = {
          readingDatetime: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
          source,
          readingTons,
          readingPercent: Math.round((readingTons / capacityTons) * 1000) / 10,
          notes: marker,
          createdBy: "demo-seed"
        };

        if (existingReading) await prisma.binReading.update({ where: { id: existingReading.id }, data: readingData });
        else await prisma.binReading.create({ data: { feedBinId: bin.id, ...readingData } });
      }
    }
  }

  await refreshEstimates();
  await generateForecasts();
  console.log(`Seeded ${farms.length} farms, ${houseTotal} houses, ${flockTotal} current flocks, and ${binTotal} bins.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
