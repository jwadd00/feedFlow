import { addBinReadingAction, refreshEstimatesAction } from "@/app/actions";
import { DataTable, PageHeader, Pill, Tons } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BinSurveillance() {
  await ensureDatabaseReady();
  const bins = await prisma.feedBin.findMany({
    where: { active: true },
    include: { feedType: true, estimate: { include: { lastReading: true } }, house: { include: { farm: true, flocks: { where: { active: true }, orderBy: { placementDate: "desc" }, take: 1 } } } },
    orderBy: { id: "asc" }
  });
  const nowLocal = new Date().toISOString().slice(0, 16);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Inventory board"
        title="Farm Bin Surveillance"
        description="Review current inventory estimates, projected empty dates, risk levels, and confidence scores."
        actions={<form action={refreshEstimatesAction}><button>Refresh estimates</button></form>}
      />
      <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={addBinReadingAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Add Bin Reading</h2>
          <label className="block text-sm font-semibold">
            Feed bin
            <select name="feedBinId">
              {bins.map((bin) => (
                <option key={bin.id} value={bin.id}>{bin.house.farm.farmCode} - {bin.house.farm.farmName} / {bin.house.houseCode} / {bin.binCode}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Reading tons<input name="readingTons" type="number" min="0" max="100" step="0.1" defaultValue="5.0" required /></label>
            <label className="block text-sm font-semibold">Source<select name="source" defaultValue="Manual"><option>Sensor</option><option>Grower</option><option>Driver</option><option>Manual</option><option>Estimate</option></select></label>
          </div>
          <label className="block text-sm font-semibold">Reading time<input name="readingDatetime" type="datetime-local" defaultValue={nowLocal} required /></label>
          <label className="block text-sm font-semibold">Notes<textarea name="notes" rows={3} placeholder="Optional notes about this reading" /></label>
          <button type="submit">Save reading</button>
        </form>
        <div>
          <h2 className="mb-3 text-lg font-bold">Inventory Board</h2>
          <DataTable
            rows={bins.map((bin) => ({
              farm: bin.house.farm.farmName,
              region: bin.house.farm.region || "-",
              house: bin.house.houseCode,
              bin: bin.binCode,
              feed: bin.feedType.feedName,
              flock: bin.house.flocks[0]?.flockCode ?? "-",
              capacity: <Tons value={bin.capacityTons} />,
              current: <Tons value={bin.estimate?.currentEstimatedTons} />,
              full: `${fmtNumber(bin.estimate?.percentFull, 0)}%`,
              daily: <Tons value={bin.estimate?.dailyConsumptionTons} />,
              days: fmtNumber(bin.estimate?.daysRemaining),
              risk: <Pill value={bin.estimate?.riskLevel || "Unknown"} />,
              confidence: `${fmtNumber(bin.estimate?.confidenceScore, 0)}%`,
              last: fmtDate(bin.estimate?.lastReading?.readingDatetime)
            }))}
            columns={[
              { key: "farm", label: "Farm" },
              { key: "region", label: "Region" },
              { key: "house", label: "House" },
              { key: "bin", label: "Bin" },
              { key: "feed", label: "Feed" },
              { key: "flock", label: "Flock" },
              { key: "capacity", label: "Capacity", align: "right" },
              { key: "current", label: "Current", align: "right" },
              { key: "full", label: "Full", align: "right" },
              { key: "daily", label: "Daily", align: "right" },
              { key: "days", label: "Days", align: "right" },
              { key: "risk", label: "Risk" },
              { key: "confidence", label: "Confidence", align: "right" },
              { key: "last", label: "Last Reading" }
            ]}
          />
        </div>
      </section>
    </main>
  );
}
