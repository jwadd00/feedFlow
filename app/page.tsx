import Link from "next/link";
import { BarChart3, ClipboardList, DatabaseZap, PackageSearch, Route, Settings, Sparkles, Truck } from "lucide-react";
import { generateForecastsAction, runDataQualityChecksAction } from "@/app/actions";
import { DataTable, PageHeader, Pill, Stat, Tons } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

async function metrics() {
  const [activeFarms, activeBins, criticalBins, openForecasts, openDataIssues] = await Promise.all([
    prisma.farm.count({ where: { active: true } }),
    prisma.feedBin.count({ where: { active: true } }),
    prisma.binInventoryEstimate.count({ where: { riskLevel: { in: ["Critical", "High"] } } }),
    prisma.loadForecast.count({ where: { status: "Open" } }),
    prisma.dataQualityIssue.count({ where: { issueStatus: "Open" } })
  ]);
  return { activeFarms, activeBins, criticalBins, openForecasts, openDataIssues };
}

export default async function Home() {
  await ensureDatabaseReady();
  const snapshot = await metrics();
  const activeLoads = await prisma.load.findMany({
    where: { status: { in: ["Planned", "Scheduled", "Released to Mill", "Loaded", "In Transit"] } },
    include: { farm: true, feedBin: true, feedType: true },
    orderBy: [{ scheduledDeliveryDatetime: "asc" }, { createdAt: "desc" }],
    take: 8
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Operations workspace"
        title="FeedFlow"
        description="A practical command center for feed inventory, forecasts, load planning, tickets, and data quality."
        actions={
          <>
            <form action={generateForecastsAction}><button><Sparkles size={16} />Refresh forecasts</button></form>
            <form action={runDataQualityChecksAction}><button className="button-secondary"><DatabaseZap size={16} />Run checks</button></form>
          </>
        }
      />
      <section className="grid gap-4 md:grid-cols-5">
        <Stat label="Active Farms" value={snapshot.activeFarms} />
        <Stat label="Active Bins" value={snapshot.activeBins} />
        <Stat label="Critical / High" value={snapshot.criticalBins} tone="#b42318" />
        <Stat label="Open Forecasts" value={snapshot.openForecasts} tone="#d99a28" />
        <Stat label="Open Issues" value={snapshot.openDataIssues} tone="#b42318" />
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <h2 className="text-lg font-bold">Go To</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["/workflow", ClipboardList, "Workflow", "Daily rhythm from setup through reconciliation."],
              ["/admin", Settings, "Admin", "Configure farms, houses, feed types, and bins."],
              ["/bins", PackageSearch, "Bin Surveillance", "Inventory estimates and readings."],
              ["/forecasts", Sparkles, "Forecasted Needs", "Open needs and conversion."],
              ["/loads", Truck, "Load Planning", "Loads, assignments, tickets."],
              ["/quality", DatabaseZap, "Data Quality", "Exception cleanup queue."],
              ["/operations", BarChart3, "Operations Hub", "Risk, active loads, and open issues."]
            ].map(([href, Icon, title, text]) => (
              <Link key={String(href)} href={String(href)} className="rounded-md border border-line p-3 hover:bg-field">
                <div className="flex items-center gap-2 font-bold"><Icon size={16} />{String(title)}</div>
                <div className="mt-1 text-sm text-slate-600">{String(text)}</div>
              </Link>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-bold">Active Loads</h2>
          <DataTable
            rows={activeLoads.map((load) => ({
              load: load.loadNumber,
              farm: load.farm.farmName,
              bin: load.feedBin.binCode,
              tons: <Tons value={load.plannedTons} />,
              status: <Pill value={load.status} />,
              scheduled: fmtDate(load.scheduledDeliveryDatetime),
              route: <span className="inline-flex items-center gap-1"><Route size={14} />{load.route || "-"}</span>
            }))}
            columns={[
              { key: "load", label: "Load" },
              { key: "farm", label: "Farm" },
              { key: "bin", label: "Bin" },
              { key: "tons", label: "Tons", align: "right" },
              { key: "status", label: "Status" },
              { key: "scheduled", label: "Scheduled" },
              { key: "route", label: "Route" }
            ]}
            empty="No active loads."
          />
        </div>
      </section>
    </main>
  );
}
