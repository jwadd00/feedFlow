import { resolveIssueAction, runDataQualityChecksAction } from "@/app/actions";
import { DataTable, PageHeader, Pill } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DataQuality() {
  await ensureDatabaseReady();
  const issues = await prisma.dataQualityIssue.findMany({
    where: { issueStatus: "Open" },
    orderBy: [{ severity: "asc" }, { detectedAt: "desc" }],
    take: 250
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Cleanup queue"
        title="Data Quality Work Queue"
        description="Find and resolve stale readings, impossible inventory values, tons mismatches, and missing reconciliation records."
        actions={<form action={runDataQualityChecksAction}><button>Run data quality checks</button></form>}
      />
      <section>
        <h2 className="mb-3 text-lg font-bold">Open Issues</h2>
        <DataTable
          rows={issues.map((issue) => ({
            id: issue.id,
            severity: <Pill value={issue.severity} />,
            rule: issue.ruleCode,
            entity: `${issue.entityType} ${issue.entityId}`,
            summary: issue.issueSummary,
            detected: fmtDate(issue.detectedAt),
            assigned: issue.assignedTo || "-"
          }))}
          columns={[
            { key: "id", label: "ID" },
            { key: "severity", label: "Severity" },
            { key: "rule", label: "Rule" },
            { key: "entity", label: "Entity" },
            { key: "summary", label: "Summary" },
            { key: "detected", label: "Detected" },
            { key: "assigned", label: "Assigned" }
          ]}
          empty="No open data quality issues."
        />
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <form action={resolveIssueAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Resolve or Ignore Issue</h2>
          <label className="block text-sm font-semibold">Issue<select name="issueId">{issues.map((issue) => <option key={issue.id} value={issue.id}>{issue.id} | {issue.severity} | {issue.ruleCode} | {issue.issueSummary.slice(0, 80)}</option>)}</select></label>
          <label className="block text-sm font-semibold">Action<select name="action"><option value="Resolved">Resolve</option><option value="Ignored">Ignore</option></select></label>
          <label className="block text-sm font-semibold">Resolution notes<textarea name="notes" rows={4} /></label>
          <button type="submit" disabled={!issues.length}>Submit</button>
        </form>
        <div className="panel p-5">
          <h2 className="text-lg font-bold">Current Rule Checks</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <li>Missing bin reading</li>
            <li>Stale bin reading</li>
            <li>Reading above bin capacity</li>
            <li>Negative reading</li>
            <li>Runout risk within 1 day</li>
            <li>Delivered load missing ticket</li>
            <li>Planned vs actual tons mismatch</li>
            <li>Unreconciled ticket older than 24 hours</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
