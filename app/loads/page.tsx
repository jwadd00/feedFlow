import { addDeliveryTicketAction, createManualLoadAction, updateLoadAssignmentAction, updateLoadStatusAction } from "@/app/actions";
import { DataTable, PageHeader, Pill, Tons } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtDate, LOAD_STATUSES } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LoadPlanning() {
  await ensureDatabaseReady();
  const [loads, bins, tickets] = await Promise.all([
    prisma.load.findMany({
      include: { farm: true, feedBin: true, feedType: true },
      orderBy: [{ scheduledDeliveryDatetime: "asc" }, { createdAt: "desc" }],
      take: 100
    }),
    prisma.feedBin.findMany({ where: { active: true }, include: { house: { include: { farm: true } }, feedType: true }, orderBy: { id: "asc" } }),
    prisma.deliveryTicket.findMany({ include: { load: { include: { farm: true } } }, orderBy: { deliveredAt: "desc" }, take: 100 })
  ]);
  const nowLocal = new Date().toISOString().slice(0, 16);
  const eligibleLoads = loads.filter((load) => ["Loaded", "In Transit", "Delivered", "Scheduled", "Released to Mill"].includes(load.status));

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader eyebrow="Planning and tracking" title="Load Planning & Tracking" description="Create, schedule, update, deliver, and reconcile feed loads." />
      <section>
        <h2 className="mb-3 text-lg font-bold">Active / Recent Loads</h2>
        <DataTable
          rows={loads.map((load) => ({
            id: load.id,
            load: load.loadNumber,
            farm: load.farm.farmName,
            bin: load.feedBin.binCode,
            feed: load.feedType.feedName,
            tons: <Tons value={load.plannedTons} />,
            priority: <Pill value={load.priority} />,
            status: <Pill value={load.status} />,
            scheduled: fmtDate(load.scheduledDeliveryDatetime),
            truck: load.truck || "-",
            driver: load.driver || "-",
            route: load.route || "-"
          }))}
          columns={[
            { key: "id", label: "ID" },
            { key: "load", label: "Load" },
            { key: "farm", label: "Farm" },
            { key: "bin", label: "Bin" },
            { key: "feed", label: "Feed" },
            { key: "tons", label: "Tons", align: "right" },
            { key: "priority", label: "Priority" },
            { key: "status", label: "Status" },
            { key: "scheduled", label: "Scheduled" },
            { key: "truck", label: "Truck" },
            { key: "driver", label: "Driver" },
            { key: "route", label: "Route" }
          ]}
          empty="No loads available."
        />
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <form action={createManualLoadAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Create Manual Load</h2>
          <label className="block text-sm font-semibold">Feed bin<select name="feedBinId">{bins.map((bin) => <option key={bin.id} value={bin.id}>{bin.house.farm.farmCode} - {bin.house.farm.farmName} / {bin.house.houseCode} / {bin.binCode}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Planned tons<input name="plannedTons" type="number" min="0" max="50" step="0.1" defaultValue="18.0" required /></label>
            <label className="block text-sm font-semibold">Priority<select name="priority"><option>Critical</option><option>High</option><option>Medium</option><option>Low</option></select></label>
          </div>
          <label className="block text-sm font-semibold">Scheduled delivery<input name="scheduledDeliveryDatetime" type="datetime-local" defaultValue={nowLocal} required /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Truck<input name="truck" /></label>
            <label className="block text-sm font-semibold">Driver<input name="driver" /></label>
          </div>
          <label className="block text-sm font-semibold">Notes<textarea name="notes" rows={3} /></label>
          <button type="submit">Create load</button>
        </form>
        <form action={addDeliveryTicketAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Capture Delivery Ticket</h2>
          <label className="block text-sm font-semibold">Load<select name="loadId">{eligibleLoads.map((load) => <option key={load.id} value={load.id}>{load.id} | {load.loadNumber} | {load.farm.farmName} | {load.status}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Ticket number<input name="ticketNumber" required /></label>
            <label className="block text-sm font-semibold">Actual tons<input name="actualTons" type="number" min="0" max="50" step="0.1" defaultValue="18.0" required /></label>
          </div>
          <label className="block text-sm font-semibold">Delivered at<input name="deliveredAt" type="datetime-local" defaultValue={nowLocal} required /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input className="w-auto" name="reconciled" type="checkbox" /> Mark as reconciled</label>
          <button type="submit" disabled={!eligibleLoads.length}>Save ticket</button>
        </form>
        <form action={updateLoadStatusAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Update Load Status</h2>
          <label className="block text-sm font-semibold">Load<select name="loadId">{loads.map((load) => <option key={load.id} value={load.id}>{load.id} | {load.loadNumber} | {load.farm.farmName} | {load.status}</option>)}</select></label>
          <label className="block text-sm font-semibold">New status<select name="newStatus">{LOAD_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label className="block text-sm font-semibold">Status notes<textarea name="notes" rows={3} /></label>
          <button type="submit" disabled={!loads.length}>Update status</button>
        </form>
        <form action={updateLoadAssignmentAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Update Assignment</h2>
          <label className="block text-sm font-semibold">Load<select name="loadId">{loads.map((load) => <option key={load.id} value={load.id}>{load.id} | {load.loadNumber} | {load.farm.farmName} | {load.status}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Truck<input name="truck" /></label>
            <label className="block text-sm font-semibold">Driver<input name="driver" /></label>
          </div>
          <label className="block text-sm font-semibold">Scheduled delivery<input name="scheduledDeliveryDatetime" type="datetime-local" defaultValue={nowLocal} required /></label>
          <button type="submit" disabled={!loads.length}>Save assignment</button>
        </form>
      </section>
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-bold">Delivery Tickets</h2>
        <DataTable
          rows={tickets.map((ticket) => ({
            ticket: ticket.ticketNumber,
            load: ticket.load.loadNumber,
            farm: ticket.load.farm.farmName,
            planned: <Tons value={ticket.load.plannedTons} />,
            actual: <Tons value={ticket.actualTons} />,
            variance: <Tons value={ticket.actualTons - ticket.load.plannedTons} />,
            delivered: fmtDate(ticket.deliveredAt),
            reconciled: <Pill value={ticket.reconciled ? "Reconciled" : "Open"} />
          }))}
          columns={[
            { key: "ticket", label: "Ticket" },
            { key: "load", label: "Load" },
            { key: "farm", label: "Farm" },
            { key: "planned", label: "Planned", align: "right" },
            { key: "actual", label: "Actual", align: "right" },
            { key: "variance", label: "Variance", align: "right" },
            { key: "delivered", label: "Delivered" },
            { key: "reconciled", label: "Reconciled" }
          ]}
          empty="No delivery tickets available."
        />
      </section>
    </main>
  );
}
