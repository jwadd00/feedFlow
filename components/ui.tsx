import Link from "next/link";
import { fmtNumber, statusTone } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-line pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <div className="mb-1 text-xs font-bold uppercase text-leaf">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, tone = "#2f6f4f" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="metric rounded-md border border-line p-4" style={{ borderLeftColor: tone }}>
      <div className="text-xs font-semibold uppercase text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}

export function Pill({ value }: { value?: string | null }) {
  const tone = statusTone(value);
  const className =
    tone === "danger"
      ? "bg-red-50 text-red-700"
      : tone === "maize"
        ? "bg-amber-50 text-amber-700"
        : tone === "leaf"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${className}`}>{value || "-"}</span>;
}

export function DataTable({
  rows,
  columns,
  empty = "No records available."
}: {
  rows: Record<string, React.ReactNode>[];
  columns: { key: string; label: string; align?: "right" }[];
  empty?: string;
}) {
  if (!rows.length) return <div className="panel p-4 text-sm text-slate-600">{empty}</div>;
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-white">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-field text-left text-xs font-bold uppercase text-slate-500">
          <tr>{columns.map((col) => <th key={col.key} className={`px-3 py-2 ${col.align === "right" ? "text-right" : ""}`}>{col.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index} className="align-top">
              {columns.map((col) => <td key={col.key} className={`px-3 py-2 ${col.align === "right" ? "text-right" : ""}`}>{row[col.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tons({ value }: { value?: number | null }) {
  return <>{fmtNumber(value)} tons</>;
}

export function AppNav() {
  const links = [
    ["/", "Home"],
    ["/workflow", "Workflow"],
    ["/admin", "Admin"],
    ["/bins", "Bins"],
    ["/forecasts", "Forecasts"],
    ["/loads", "Loads"],
    ["/quality", "Quality"],
    ["/operations", "Operations"]
  ];
  return (
    <nav className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap gap-1 px-4 py-3">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="rounded px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-field hover:text-ink">
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
