import Link from "next/link";
import { AlertTriangle, ClipboardCheck, DatabaseZap, PackageCheck, Settings, Sparkles, Truck } from "lucide-react";
import { PageHeader, Stat } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const workflow = [
  {
    step: "1",
    title: "Configure the operating model",
    icon: Settings,
    href: "/admin",
    action: "Admin",
    detail: "Maintain farms, houses, active flocks, feed types, and bins. Flock placement date and bird count shape age-based consumption; capacity, minimum safe tons, and active status drive estimates, forecast timing, and data quality checks."
  },
  {
    step: "2",
    title: "Capture bin inventory signals",
    icon: PackageCheck,
    href: "/bins",
    action: "Bin Surveillance",
    detail: "Add grower, driver, sensor, manual, or estimate readings. Each reading refreshes current tons against the active flock's age-adjusted decline rate, percent full, days remaining, projected empty date, risk level, and confidence score."
  },
  {
    step: "3",
    title: "Refresh forecasted needs",
    icon: Sparkles,
    href: "/forecasts",
    action: "Forecasted Needs",
    detail: "Generate the open forecast queue for bins expected to need feed within the forecast window. Review priority, recommended delivery time, recommended tons, and forecast reasoning."
  },
  {
    step: "4",
    title: "Convert needs into planned loads",
    icon: Truck,
    href: "/loads",
    action: "Load Planning",
    detail: "Create loads from forecasts or manually create loads. Assign schedule, truck, driver, route, status, and delivery details as the load moves through the operation."
  },
  {
    step: "5",
    title: "Capture tickets and reconcile",
    icon: ClipboardCheck,
    href: "/loads",
    action: "Delivery Tickets",
    detail: "Record delivered tons and ticket numbers. Reconciliation status feeds the load lifecycle and quality checks for mismatches or stale unreconciled tickets."
  },
  {
    step: "6",
    title: "Clear exception work",
    icon: AlertTriangle,
    href: "/quality",
    action: "Data Quality",
    detail: "Run checks for missing readings, stale readings, over-capacity readings, runout risk, missing tickets, ton mismatches, and unreconciled tickets."
  },
  {
    step: "7",
    title: "Monitor the operation",
    icon: DatabaseZap,
    href: "/operations",
    action: "Operations Hub",
    detail: "Use the hub as the end-of-loop view for risk distribution, active loads, and open data quality work after setup, readings, forecasts, loads, and reconciliation are current."
  }
];

export default async function WorkflowPage() {
  await ensureDatabaseReady();
  const [activeBins, openForecasts, activeLoads, openIssues] = await Promise.all([
    prisma.feedBin.count({ where: { active: true } }),
    prisma.loadForecast.count({ where: { status: "Open" } }),
    prisma.load.count({ where: { status: { in: ["Planned", "Scheduled", "Released to Mill", "Loaded", "In Transit"] } } }),
    prisma.dataQualityIssue.count({ where: { issueStatus: "Open" } })
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Operating rhythm"
        title="Typical Workflow"
        description="A practical end-to-end path through FeedFlow, from master data setup to reconciled delivery tickets and exception cleanup."
        actions={<Link className="button" href="/operations"><DatabaseZap size={16} />Open hub</Link>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Active Bins" value={activeBins} />
        <Stat label="Open Forecasts" value={openForecasts} tone="#d99a28" />
        <Stat label="Active Loads" value={activeLoads} />
        <Stat label="Open Issues" value={openIssues} tone="#b42318" />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        {workflow.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.step} className="panel p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-field font-bold text-leaf">{item.step}</div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon size={17} />
                    <h2 className="text-lg font-bold">{item.title}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                  <Link className="button button-secondary mt-4" href={item.href}>{item.action}</Link>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="panel p-5">
          <h2 className="text-lg font-bold">When Configuration Changes</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Updates to active flocks, placement dates, bird counts, bin capacity, daily consumption, minimum safe tons, feed type, house assignment, or active status automatically recalculate inventory estimates, forecast recommendations, and managed data quality issues.
          </p>
        </div>
        <div className="panel p-5">
          <h2 className="text-lg font-bold">Daily Loop</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Keep farm, house, feed type, and bin setup current.</li>
            <li>Refresh or add bin readings where confidence is low or readings are stale.</li>
            <li>Generate forecasts and convert actionable needs to planned loads.</li>
            <li>Track load status through delivery and capture tickets.</li>
            <li>Run data quality checks and resolve or ignore exceptions with notes.</li>
            <li>Review the Operations Hub for risk and active work.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
