import { prisma } from "@/lib/db";
import { classifyRisk, forecastPriority, LOAD_STATUSES } from "@/lib/format";

const STALE_READING_HOURS = 36;
const FORECAST_WINDOW_DAYS = 5;
const TARGET_FILL_PERCENT = 0.92;
const DELIVERY_BUFFER_DAYS = 1;
const MANAGED_QUALITY_RULES = [
  "MISSING_READING",
  "STALE_READING",
  "READING_OVER_CAPACITY",
  "NEGATIVE_READING",
  "RUNOUT_RISK",
  "DELIVERED_MISSING_TICKET",
  "TONS_MISMATCH",
  "UNRECONCILED_TICKET"
];

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function confidenceScore(source: string | null | undefined, hoursSinceReading: number | null, suspicious = false) {
  let score = 100;
  if (source === "Manual" || source === "Grower") score -= 5;
  else if (source === "Driver") score -= 3;
  else if (source === "Estimate") score -= 15;
  if (hoursSinceReading === null) score -= 50;
  else if (hoursSinceReading > STALE_READING_HOURS) score -= Math.min(40, (hoursSinceReading - STALE_READING_HOURS) * 1.5);
  else if (hoursSinceReading > 24) score -= 10;
  if (suspicious) score -= 30;
  return Math.max(0, Math.round(score * 10) / 10);
}

export async function refreshInventoryEstimates() {
  const now = new Date();
  const bins = await prisma.feedBin.findMany({ where: { active: true } });
  for (const bin of bins) {
    const latest = await prisma.binReading.findFirst({
      where: { feedBinId: bin.id },
      orderBy: [{ readingDatetime: "desc" }, { id: "desc" }]
    });
    let values;
    if (!latest) {
      values = {
        lastReadingId: null,
        estimatedAt: now,
        currentEstimatedTons: 0,
        percentFull: 0,
        dailyConsumptionTons: bin.estimatedDailyConsumptionTons,
        projectedEmptyDatetime: null,
        daysRemaining: null,
        riskLevel: "Unknown",
        confidenceScore: 0
      };
    } else {
      const hoursElapsed = Math.max(0, (now.getTime() - latest.readingDatetime.getTime()) / 36e5);
      const currentTons = Math.max(0, latest.readingTons - bin.estimatedDailyConsumptionTons * (hoursElapsed / 24));
      const daysRemaining = bin.estimatedDailyConsumptionTons > 0 ? currentTons / bin.estimatedDailyConsumptionTons : null;
      const suspicious = latest.readingTons > bin.capacityTons || latest.readingTons < 0;
      values = {
        lastReadingId: latest.id,
        estimatedAt: now,
        currentEstimatedTons: Math.round(currentTons * 100) / 100,
        percentFull: bin.capacityTons ? Math.round(Math.min(200, (currentTons / bin.capacityTons) * 100) * 10) / 10 : 0,
        dailyConsumptionTons: Math.round(bin.estimatedDailyConsumptionTons * 100) / 100,
        projectedEmptyDatetime: daysRemaining === null ? null : addDays(now, daysRemaining),
        daysRemaining: daysRemaining === null ? null : Math.round(daysRemaining * 100) / 100,
        riskLevel: classifyRisk(daysRemaining, currentTons, bin.minimumSafeTons),
        confidenceScore: confidenceScore(latest.source, hoursElapsed, suspicious)
      };
    }
    await prisma.binInventoryEstimate.upsert({
      where: { feedBinId: bin.id },
      update: values,
      create: { feedBinId: bin.id, ...values }
    });
  }
  return bins.length;
}

export async function addBinReading(formData: FormData) {
  const feedBinId = Number(formData.get("feedBinId"));
  const readingTons = Number(formData.get("readingTons"));
  const source = String(formData.get("source") || "Manual");
  const readingDatetime = new Date(String(formData.get("readingDatetime") || new Date().toISOString()));
  const notes = String(formData.get("notes") || "");
  const bin = await prisma.feedBin.findUniqueOrThrow({ where: { id: feedBinId } });
  await prisma.binReading.create({
    data: {
      feedBinId,
      readingDatetime,
      source,
      readingTons,
      readingPercent: bin.capacityTons ? Math.round((readingTons / bin.capacityTons) * 1000) / 10 : null,
      notes: notes || null,
      createdBy: "next"
    }
  });
  await refreshInventoryEstimates();
}

export async function generateLoadForecasts() {
  await refreshInventoryEstimates();
  const now = new Date();
  const estimates = await prisma.binInventoryEstimate.findMany({ include: { feedBin: true } });
  let updated = 0;
  for (const estimate of estimates) {
    if (!estimate.feedBin.active) continue;
    const shouldForecast = estimate.daysRemaining === null || estimate.daysRemaining <= FORECAST_WINDOW_DAYS;
    if (!shouldForecast) continue;
    const priority = forecastPriority(estimate.daysRemaining);
    let recommendedDeliveryDatetime: Date | null = null;
    if (estimate.projectedEmptyDatetime) {
      recommendedDeliveryDatetime = addDays(estimate.projectedEmptyDatetime, -DELIVERY_BUFFER_DAYS);
      if (recommendedDeliveryDatetime < now) recommendedDeliveryDatetime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }
    const targetTons = estimate.feedBin.capacityTons * TARGET_FILL_PERCENT;
    const recommendedTons = Math.round(Math.max(0, targetTons - estimate.currentEstimatedTons) * 10) / 10;
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
    updated++;
  }
  const openForecasts = await prisma.loadForecast.findMany({
    where: { status: "Open" },
    include: { feedBin: { include: { estimate: true } } }
  });
  for (const forecast of openForecasts) {
    const estimate = forecast.feedBin.estimate;
    const stillNeeded =
      forecast.feedBin.active &&
      (!estimate ||
        estimate.daysRemaining === null ||
        estimate.daysRemaining <= FORECAST_WINDOW_DAYS ||
        ["Critical", "High"].includes(estimate.riskLevel));
    if (!stillNeeded) {
      await prisma.loadForecast.update({
        where: { id: forecast.id },
        data: { status: "Cancelled", reason: `${forecast.reason}\nCancelled after configuration recalculation.` }
      });
    }
  }
  return updated;
}

export async function deferForecast(formData: FormData) {
  const id = Number(formData.get("forecastId"));
  const note = String(formData.get("note") || "No note provided.");
  const forecast = await prisma.loadForecast.findUniqueOrThrow({ where: { id } });
  await prisma.loadForecast.update({ where: { id }, data: { status: "Deferred", reason: `${forecast.reason}\nDeferred note: ${note}` } });
}

async function nextLoadNumber() {
  const count = await prisma.load.count();
  return `LD-${10001 + count}`;
}

async function farmForBin(feedBinId: number) {
  const bin = await prisma.feedBin.findUniqueOrThrow({ where: { id: feedBinId }, include: { house: { include: { farm: true } } } });
  return { bin, farm: bin.house.farm };
}

export async function createLoadFromForecast(formData: FormData) {
  const forecastId = Number(formData.get("forecastId"));
  const plannedTons = Number(formData.get("plannedTons"));
  const scheduledDeliveryDatetime = new Date(String(formData.get("scheduledDeliveryDatetime") || new Date().toISOString()));
  const notes = String(formData.get("notes") || "Created from forecast queue.");
  const forecast = await prisma.loadForecast.findUniqueOrThrow({ where: { id: forecastId } });
  const { bin, farm } = await farmForBin(forecast.feedBinId);
  const load = await prisma.load.create({
    data: {
      loadNumber: await nextLoadNumber(),
      farmId: farm.id,
      feedBinId: bin.id,
      feedTypeId: bin.feedTypeId,
      createdFromForecastId: forecast.id,
      plannedTons: Number.isFinite(plannedTons) ? plannedTons : forecast.recommendedTons,
      scheduledDeliveryDatetime,
      priority: forecast.priority,
      status: "Planned",
      route: farm.route,
      notes,
      createdBy: "next"
    }
  });
  await prisma.loadForecast.update({ where: { id: forecast.id }, data: { status: "Converted" } });
  await prisma.loadStatusHistory.create({ data: { loadId: load.id, newStatus: "Planned", changedAt: new Date(), changedBy: "next", notes: "Load created from forecast." } });
}

export async function createManualLoad(formData: FormData) {
  const feedBinId = Number(formData.get("feedBinId"));
  const { bin, farm } = await farmForBin(feedBinId);
  const load = await prisma.load.create({
    data: {
      loadNumber: await nextLoadNumber(),
      farmId: farm.id,
      feedBinId,
      feedTypeId: bin.feedTypeId,
      plannedTons: Number(formData.get("plannedTons")),
      scheduledDeliveryDatetime: new Date(String(formData.get("scheduledDeliveryDatetime") || new Date().toISOString())),
      priority: String(formData.get("priority") || "Medium"),
      status: "Planned",
      truck: String(formData.get("truck") || "") || null,
      driver: String(formData.get("driver") || "") || null,
      route: farm.route,
      notes: String(formData.get("notes") || "") || null,
      createdBy: "next"
    }
  });
  await prisma.loadStatusHistory.create({ data: { loadId: load.id, newStatus: "Planned", changedAt: new Date(), changedBy: "next", notes: "Manual load created." } });
}

export async function updateLoadStatus(formData: FormData) {
  const loadId = Number(formData.get("loadId"));
  const newStatus = String(formData.get("newStatus"));
  if (!LOAD_STATUSES.includes(newStatus as never)) throw new Error(`Invalid status: ${newStatus}`);
  const load = await prisma.load.findUniqueOrThrow({ where: { id: loadId } });
  await prisma.load.update({ where: { id: loadId }, data: { status: newStatus } });
  await prisma.loadStatusHistory.create({
    data: { loadId, oldStatus: load.status, newStatus, changedAt: new Date(), changedBy: "next", notes: String(formData.get("notes") || "") || null }
  });
}

export async function updateLoadAssignment(formData: FormData) {
  await prisma.load.update({
    where: { id: Number(formData.get("loadId")) },
    data: {
      truck: String(formData.get("truck") || "") || null,
      driver: String(formData.get("driver") || "") || null,
      scheduledDeliveryDatetime: new Date(String(formData.get("scheduledDeliveryDatetime") || new Date().toISOString()))
    }
  });
}

export async function addDeliveryTicket(formData: FormData) {
  const loadId = Number(formData.get("loadId"));
  const load = await prisma.load.findUniqueOrThrow({ where: { id: loadId } });
  const reconciled = formData.get("reconciled") === "on";
  const ticket = await prisma.deliveryTicket.create({
    data: {
      loadId,
      ticketNumber: String(formData.get("ticketNumber")),
      deliveredAt: new Date(String(formData.get("deliveredAt") || new Date().toISOString())),
      actualTons: Number(formData.get("actualTons")),
      feedTypeId: load.feedTypeId,
      reconciled
    }
  });
  const oldStatus = load.status;
  const newStatus = reconciled ? "Ticket Reconciled" : "Delivered";
  await prisma.load.update({ where: { id: loadId }, data: { status: newStatus } });
  await prisma.loadStatusHistory.create({ data: { loadId, oldStatus, newStatus, changedAt: new Date(), changedBy: "next", notes: `Ticket ${ticket.ticketNumber} captured.` } });
}

async function upsertOpenIssue(ruleCode: string, entityType: string, entityId: number, severity: string, issueSummary: string) {
  const detectedAt = new Date();
  await prisma.dataQualityIssue.upsert({
    where: { uq_open_issue: { ruleCode, entityType, entityId, issueStatus: "Open" } },
    update: { severity, issueSummary, detectedAt },
    create: { ruleCode, entityType, entityId, severity, issueStatus: "Open", detectedAt, issueSummary }
  });
}

export async function runDataQualityChecks() {
  await refreshInventoryEstimates();
  const now = new Date();
  await prisma.dataQualityIssue.updateMany({
    where: { issueStatus: "Open", ruleCode: { in: MANAGED_QUALITY_RULES } },
    data: {
      issueStatus: "Resolved",
      resolvedAt: now,
      resolutionNotes: "Auto-resolved before rerunning managed data quality checks."
    }
  });
  const bins = await prisma.feedBin.findMany({ where: { active: true } });
  for (const bin of bins) {
    const latest = await prisma.binReading.findFirst({ where: { feedBinId: bin.id }, orderBy: [{ readingDatetime: "desc" }, { id: "desc" }] });
    if (!latest) {
      await upsertOpenIssue("MISSING_READING", "FeedBin", bin.id, "High", `No reading exists for bin ${bin.binCode}.`);
      continue;
    }
    const ageHours = (now.getTime() - latest.readingDatetime.getTime()) / 36e5;
    if (ageHours > STALE_READING_HOURS) await upsertOpenIssue("STALE_READING", "FeedBin", bin.id, "Medium", `Latest reading is ${ageHours.toFixed(1)} hours old; threshold is ${STALE_READING_HOURS} hours.`);
    if (latest.readingTons > bin.capacityTons) await upsertOpenIssue("READING_OVER_CAPACITY", "BinReading", latest.id, "High", `Reading of ${latest.readingTons.toFixed(1)} tons exceeds capacity of ${bin.capacityTons.toFixed(1)} tons.`);
    if (latest.readingTons < 0) await upsertOpenIssue("NEGATIVE_READING", "BinReading", latest.id, "Critical", `Reading of ${latest.readingTons.toFixed(1)} tons is negative.`);
  }
  const estimates = await prisma.binInventoryEstimate.findMany();
  for (const estimate of estimates) {
    if (estimate.daysRemaining !== null && estimate.daysRemaining <= 1) {
      await upsertOpenIssue("RUNOUT_RISK", "FeedBin", estimate.feedBinId, estimate.daysRemaining <= 0.5 ? "Critical" : "High", `Bin projected to run out in ${estimate.daysRemaining.toFixed(1)} day(s).`);
    }
  }
  const deliveredLoads = await prisma.load.findMany({ where: { status: "Delivered" }, include: { tickets: true } });
  for (const load of deliveredLoads) {
    if (!load.tickets.length) await upsertOpenIssue("DELIVERED_MISSING_TICKET", "Load", load.id, "High", `Load ${load.loadNumber} is delivered but has no delivery ticket.`);
  }
  const tickets = await prisma.deliveryTicket.findMany({ include: { load: true } });
  for (const ticket of tickets) {
    const diff = Math.abs((ticket.load.plannedTons || 0) - ticket.actualTons);
    if (diff > 1) await upsertOpenIssue("TONS_MISMATCH", "DeliveryTicket", ticket.id, "Medium", `Ticket actual tons differ from planned tons by ${diff.toFixed(1)} tons.`);
    if (!ticket.reconciled && ticket.deliveredAt < new Date(now.getTime() - 24 * 60 * 60 * 1000)) await upsertOpenIssue("UNRECONCILED_TICKET", "DeliveryTicket", ticket.id, "Medium", `Ticket ${ticket.ticketNumber} has been unreconciled for more than 24 hours.`);
  }
  return prisma.dataQualityIssue.count({ where: { issueStatus: "Open" } });
}

export async function resolveIssue(formData: FormData) {
  const id = Number(formData.get("issueId"));
  const action = String(formData.get("action") || "Resolved");
  await prisma.dataQualityIssue.update({
    where: { id },
    data: {
      issueStatus: action,
      resolutionNotes: String(formData.get("notes") || "") || null,
      resolvedAt: new Date()
    }
  });
}

async function recalculateAfterConfigurationChange() {
  await refreshInventoryEstimates();
  await generateLoadForecasts();
  await runDataQualityChecks();
}

function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function nullableText(formData: FormData, name: string) {
  const value = String(formData.get(name) || "").trim();
  return value || null;
}

export async function createFarm(formData: FormData) {
  await prisma.farm.create({
    data: {
      farmCode: String(formData.get("farmCode") || "").trim(),
      farmName: String(formData.get("farmName") || "").trim(),
      growerName: nullableText(formData, "growerName"),
      region: nullableText(formData, "region"),
      route: nullableText(formData, "route"),
      address: nullableText(formData, "address"),
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function updateFarm(formData: FormData) {
  await prisma.farm.update({
    where: { id: Number(formData.get("farmId")) },
    data: {
      farmCode: String(formData.get("farmCode") || "").trim(),
      farmName: String(formData.get("farmName") || "").trim(),
      growerName: nullableText(formData, "growerName"),
      region: nullableText(formData, "region"),
      route: nullableText(formData, "route"),
      address: nullableText(formData, "address"),
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function createFarmHouse(formData: FormData) {
  await prisma.farmHouse.create({
    data: {
      farmId: Number(formData.get("farmId")),
      houseCode: String(formData.get("houseCode") || "").trim(),
      birdCount: Number(formData.get("birdCount")) || null,
      flockAgeDays: Number(formData.get("flockAgeDays")) || null,
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function updateFarmHouse(formData: FormData) {
  await prisma.farmHouse.update({
    where: { id: Number(formData.get("farmHouseId")) },
    data: {
      farmId: Number(formData.get("farmId")),
      houseCode: String(formData.get("houseCode") || "").trim(),
      birdCount: Number(formData.get("birdCount")) || null,
      flockAgeDays: Number(formData.get("flockAgeDays")) || null,
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function createFeedType(formData: FormData) {
  await prisma.feedType.create({
    data: {
      feedCode: String(formData.get("feedCode") || "").trim(),
      feedName: String(formData.get("feedName") || "").trim(),
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function updateFeedType(formData: FormData) {
  await prisma.feedType.update({
    where: { id: Number(formData.get("feedTypeId")) },
    data: {
      feedCode: String(formData.get("feedCode") || "").trim(),
      feedName: String(formData.get("feedName") || "").trim(),
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function createFeedBin(formData: FormData) {
  await prisma.feedBin.create({
    data: {
      farmHouseId: Number(formData.get("farmHouseId")),
      feedTypeId: Number(formData.get("feedTypeId")),
      binCode: String(formData.get("binCode") || "").trim(),
      capacityTons: Number(formData.get("capacityTons")),
      estimatedDailyConsumptionTons: Number(formData.get("estimatedDailyConsumptionTons")),
      minimumSafeTons: Number(formData.get("minimumSafeTons")),
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}

export async function updateFeedBin(formData: FormData) {
  await prisma.feedBin.update({
    where: { id: Number(formData.get("feedBinId")) },
    data: {
      farmHouseId: Number(formData.get("farmHouseId")),
      feedTypeId: Number(formData.get("feedTypeId")),
      binCode: String(formData.get("binCode") || "").trim(),
      capacityTons: Number(formData.get("capacityTons")),
      estimatedDailyConsumptionTons: Number(formData.get("estimatedDailyConsumptionTons")),
      minimumSafeTons: Number(formData.get("minimumSafeTons")),
      active: checkboxValue(formData, "active")
    }
  });
  await recalculateAfterConfigurationChange();
}
