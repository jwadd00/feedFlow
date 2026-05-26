"use server";

import { revalidatePath } from "next/cache";
import {
  addBinReading,
  addDeliveryTicket,
  createFarm,
  createFarmHouse,
  createFeedBin,
  createFeedType,
  createLoadFromForecast,
  createManualLoad,
  deferForecast,
  generateLoadForecasts,
  refreshInventoryEstimates,
  resolveIssue,
  runDataQualityChecks,
  updateFarm,
  updateFarmHouse,
  updateFeedBin,
  updateFeedType,
  updateLoadAssignment,
  updateLoadStatus
} from "@/lib/ops";

function refreshAll() {
  ["/", "/operations", "/bins", "/forecasts", "/loads", "/quality", "/admin"].forEach((path) => revalidatePath(path));
}

export async function refreshEstimatesAction() {
  await refreshInventoryEstimates();
  refreshAll();
}

export async function addBinReadingAction(formData: FormData) {
  await addBinReading(formData);
  refreshAll();
}

export async function generateForecastsAction() {
  await generateLoadForecasts();
  refreshAll();
}

export async function createLoadFromForecastAction(formData: FormData) {
  await createLoadFromForecast(formData);
  refreshAll();
}

export async function deferForecastAction(formData: FormData) {
  await deferForecast(formData);
  refreshAll();
}

export async function createManualLoadAction(formData: FormData) {
  await createManualLoad(formData);
  refreshAll();
}

export async function updateLoadStatusAction(formData: FormData) {
  await updateLoadStatus(formData);
  refreshAll();
}

export async function updateLoadAssignmentAction(formData: FormData) {
  await updateLoadAssignment(formData);
  refreshAll();
}

export async function addDeliveryTicketAction(formData: FormData) {
  await addDeliveryTicket(formData);
  refreshAll();
}

export async function runDataQualityChecksAction() {
  await runDataQualityChecks();
  refreshAll();
}

export async function resolveIssueAction(formData: FormData) {
  await resolveIssue(formData);
  refreshAll();
}

export async function createFarmAction(formData: FormData) {
  await createFarm(formData);
  refreshAll();
}

export async function updateFarmAction(formData: FormData) {
  await updateFarm(formData);
  refreshAll();
}

export async function createFarmHouseAction(formData: FormData) {
  await createFarmHouse(formData);
  refreshAll();
}

export async function updateFarmHouseAction(formData: FormData) {
  await updateFarmHouse(formData);
  refreshAll();
}

export async function createFeedTypeAction(formData: FormData) {
  await createFeedType(formData);
  refreshAll();
}

export async function updateFeedTypeAction(formData: FormData) {
  await updateFeedType(formData);
  refreshAll();
}

export async function createFeedBinAction(formData: FormData) {
  await createFeedBin(formData);
  refreshAll();
}

export async function updateFeedBinAction(formData: FormData) {
  await updateFeedBin(formData);
  refreshAll();
}
