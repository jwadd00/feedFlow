import { generateForecastsAction, runDataQualityChecksAction } from "@/app/actions";
import { DataTable, PageHeader, Pill, Stat, Tons } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function OperationsHub() {
  await ensureDatabaseReady();
  const [activeFarms, activeBins, criticalBins, openForecasts, openDataIssues, riskCounts, issues, loads] = await Promise.all([
    prisma.farm.count({ where: { active: true } }),
    prisma.feedBin.count({ where: { active: true } }),
    prisma.binInventoryEstimate.count({ where: { riskLevel: { in: ["Critical", "High"] } } }),
    prisma.loadForecast.count({ where: { status: "Open" } }),
    prisma.dataQualityIssue.count({ where: { issueStatus: "Open" } }),
    prisma.binInventoryEstimate.groupBy({ by: ["riskLevel"], _count: true, orderBy: { riskLevel: "asc" } }),
    prisma.dataQualityIssue.findMany({ where: { issueStatus: "Open" }, orderBy: [{ severity: "asc" }, { detectedAt: "desc" }], take: 10 }),
    prisma.load.findMany({
      where: { status: { in: ["Planned", "Scheduled", "Released to Mill", "Loaded", "In Transit"] } },
      include: { farm: true, feedBin: true, feedType: true },
      orderBy: [{ scheduledDeliveryDatetime: "asc" }, { createdAt: "desc" }],
      take: 25
    })
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Single operational view"
        title="Operations Hub"
        description="Bin risk, open forecasts, active loads, and data quality issues."
        actions={
          <>
            <form action={generateForecastsAction}><button>Refresh forecasts</button></form>
            <form action={runDataQualityChecksAction}><button className="button-secondary">Run data checks</button></form>
          </>
        }
      />
      <section className="grid gap-4 md:grid-cols-5">
        <Stat label="Active Farms" value={activeFarms} />
        <Stat label="Active Bins" value={activeBins} />
        <Stat label="Critical / High Bins" value={criticalBins} tone="#b42318" />
        <Stat label="Open Forecasts" value={openForecasts} tone="#d99a28" />
        <Stat label="Open Data Issues" value={openDataIssues} tone="#b42318" />
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="panel p-5">
          <h2 className="text-lg font-bold">Bin Risk Distribution</h2>
          <div className="mt-4 space-y-3">
            {riskCounts.map((item) => (
              <div key={item.riskLevel} className="flex items-center justify-between border-b border-line pb-2">
                <Pill value={item.riskLevel} />
                <span className="text-lg font-bold">{item._count}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold">Open Data Quality Issues</h2>
          <DataTable
            rows={issues.map((issue) => ({
              severity: <Pill value={issue.severity} />,
              rule: issue.ruleCode,
              entity: `${issue.entityType} ${issue.entityId}`,
              summary: issue.issueSummary,
              detected: fmtDate(issue.detectedAt)
            }))}
            columns={[
              { key: "severity", label: "Severity" },
              { key: "rule", label: "Rule" },
              { key: "entity", label: "Entity" },
              { key: "summary", label: "Summary" },
              { key: "detected", label: "Detected" }
            ]}
            empty="No open issues."
          />
        </div>
      </section>
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Active Loads</h2>
        <DataTable
          rows={loads.map((load) => ({
            load: load.loadNumber,
            farm: load.farm.farmName,
            bin: load.feedBin.binCode,
            feed: load.feedType.feedName,
            tons: <Tons value={load.plannedTons} />,
            priority: <Pill value={load.priority} />,
            status: <Pill value={load.status} />,
            scheduled: fmtDate(load.scheduledDeliveryDatetime),
            truck: load.truck || "-"
          }))}
          columns={[
            { key: "load", label: "Load" },
            { key: "farm", label: "Farm" },
            { key: "bin", label: "Bin" },
            { key: "feed", label: "Feed" },
            { key: "tons", label: "Tons", align: "right" },
            { key: "priority", label: "Priority" },
            { key: "status", label: "Status" },
            { key: "scheduled", label: "Scheduled" },
            { key: "truck", label: "Truck" }
          ]}
          empty="No active loads."
        />
      </section>
    </main>
  );
}
