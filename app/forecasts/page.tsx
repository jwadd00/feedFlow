import { createLoadFromForecastAction, deferForecastAction, generateForecastsAction } from "@/app/actions";
import { DataTable, PageHeader, Pill, Tons } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ForecastedNeeds() {
  await ensureDatabaseReady();
  const [openForecasts, history] = await Promise.all([
    prisma.loadForecast.findMany({
      where: { status: "Open" },
      include: { feedBin: { include: { feedType: true, house: { include: { farm: true } } } } },
      orderBy: [{ priority: "asc" }, { daysRemaining: "asc" }],
      take: 100
    }),
    prisma.loadForecast.findMany({
      include: { feedBin: { include: { feedType: true, house: { include: { farm: true } } } } },
      orderBy: { generatedAt: "desc" },
      take: 100
    })
  ]);
  const nowLocal = new Date().toISOString().slice(0, 16);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Forecast queue"
        title="Forecasted Needs"
        description="Prioritized bins that likely need feed within the forecast window."
        actions={<form action={generateForecastsAction}><button>Generate / refresh</button></form>}
      />
      <section>
        <h2 className="mb-3 text-lg font-bold">Open Forecast Queue</h2>
        <DataTable
          rows={openForecasts.map((forecast) => ({
            id: forecast.id,
            farm: forecast.feedBin.house.farm.farmName,
            bin: `${forecast.feedBin.house.houseCode}/${forecast.feedBin.binCode}`,
            feed: forecast.feedBin.feedType.feedName,
            current: <Tons value={forecast.currentEstimatedTons} />,
            days: fmtNumber(forecast.daysRemaining),
            delivery: fmtDate(forecast.recommendedDeliveryDatetime),
            tons: <Tons value={forecast.recommendedTons} />,
            priority: <Pill value={forecast.priority} />,
            confidence: `${fmtNumber(forecast.confidenceScore, 0)}%`,
            reason: forecast.reason
          }))}
          columns={[
            { key: "id", label: "ID" },
            { key: "farm", label: "Farm" },
            { key: "bin", label: "Bin" },
            { key: "feed", label: "Feed" },
            { key: "current", label: "Current", align: "right" },
            { key: "days", label: "Days", align: "right" },
            { key: "delivery", label: "Delivery" },
            { key: "tons", label: "Tons", align: "right" },
            { key: "priority", label: "Priority" },
            { key: "confidence", label: "Confidence", align: "right" },
            { key: "reason", label: "Reason" }
          ]}
          empty="No open forecasted needs right now."
        />
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <form action={createLoadFromForecastAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Convert Forecast to Planned Load</h2>
          <label className="block text-sm font-semibold">Forecast<select name="forecastId">{openForecasts.map((f) => <option key={f.id} value={f.id}>{f.id} | {f.feedBin.house.farm.farmName} | {f.feedBin.house.houseCode}/{f.feedBin.binCode} | {f.priority} | {f.recommendedTons} tons</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Planned tons<input name="plannedTons" type="number" min="0" max="50" step="0.1" defaultValue={openForecasts[0]?.recommendedTons ?? 18} required /></label>
            <label className="block text-sm font-semibold">Scheduled delivery<input name="scheduledDeliveryDatetime" type="datetime-local" defaultValue={nowLocal} required /></label>
          </div>
          <label className="block text-sm font-semibold">Notes<textarea name="notes" rows={3} defaultValue="Created from forecast queue." /></label>
          <button type="submit" disabled={!openForecasts.length}>Create planned load</button>
        </form>
        <form action={deferForecastAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Defer Forecast</h2>
          <label className="block text-sm font-semibold">Forecast<select name="forecastId">{openForecasts.map((f) => <option key={f.id} value={f.id}>{f.id} | {f.feedBin.house.farm.farmName} | {f.priority}</option>)}</select></label>
          <label className="block text-sm font-semibold">Deferral note<textarea name="note" rows={5} placeholder="Why is this forecast being deferred?" /></label>
          <button type="submit" disabled={!openForecasts.length}>Defer forecast</button>
        </form>
      </section>
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Recent Forecast History</h2>
        <DataTable
          rows={history.map((forecast) => ({
            id: forecast.id,
            farm: forecast.feedBin.house.farm.farmName,
            bin: `${forecast.feedBin.house.houseCode}/${forecast.feedBin.binCode}`,
            tons: <Tons value={forecast.recommendedTons} />,
            priority: <Pill value={forecast.priority} />,
            status: <Pill value={forecast.status} />,
            generated: fmtDate(forecast.generatedAt)
          }))}
          columns={[
            { key: "id", label: "ID" },
            { key: "farm", label: "Farm" },
            { key: "bin", label: "Bin" },
            { key: "tons", label: "Tons", align: "right" },
            { key: "priority", label: "Priority" },
            { key: "status", label: "Status" },
            { key: "generated", label: "Generated" }
          ]}
          empty="No forecast history available."
        />
      </section>
    </main>
  );
}
