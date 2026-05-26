export const LOAD_STATUSES = [
  "Planned",
  "Scheduled",
  "Released to Mill",
  "Loaded",
  "In Transit",
  "Delivered",
  "Ticket Reconciled",
  "Exception",
  "Cancelled"
] as const;

export function classifyRisk(daysRemaining: number | null, currentTons: number | null, minSafeTons: number | null) {
  if (daysRemaining === null || currentTons === null) return "Unknown";
  if (currentTons <= 0 || daysRemaining <= 0.5) return "Critical";
  if (currentTons <= (minSafeTons ?? 0) || daysRemaining <= 1.5) return "High";
  if (daysRemaining <= 3) return "Watch";
  return "Normal";
}

export function forecastPriority(daysRemaining: number | null) {
  if (daysRemaining === null) return "Medium";
  if (daysRemaining <= 1) return "Critical";
  if (daysRemaining <= 2) return "High";
  if (daysRemaining <= 4) return "Medium";
  return "Low";
}

export function fmtDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function fmtNumber(value?: number | null, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function statusTone(value?: string | null) {
  if (["Critical", "High", "Exception"].includes(value ?? "")) return "danger";
  if (["Watch", "Medium", "Scheduled", "Released to Mill", "Loaded", "In Transit"].includes(value ?? "")) return "maize";
  if (["Normal", "Low", "Delivered", "Ticket Reconciled", "Resolved"].includes(value ?? "")) return "leaf";
  return "slate";
}
