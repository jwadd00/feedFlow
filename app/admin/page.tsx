import {
  createFarmAction,
  createFarmHouseAction,
  createFeedBinAction,
  createFeedTypeAction,
  updateFarmAction,
  updateFarmHouseAction,
  updateFeedBinAction,
  updateFeedTypeAction
} from "@/app/actions";
import { DataTable, PageHeader, Pill, Stat, Tons } from "@/components/ui";
import { ensureDatabaseReady } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import { fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

function ActiveCheckbox({ active }: { active: boolean }) {
  return <input className="w-auto" name="active" type="checkbox" defaultChecked={active} />;
}

function NumericInput({ name, value, step = "1" }: { name: string; value?: number | null; step?: string }) {
  return <input name={name} type="number" step={step} defaultValue={value ?? ""} />;
}

export default async function AdminPage() {
  await ensureDatabaseReady();
  const [farms, houses, feedTypes, bins, openIssues, openForecasts] = await Promise.all([
    prisma.farm.findMany({ include: { houses: true }, orderBy: { farmCode: "asc" } }),
    prisma.farmHouse.findMany({ include: { farm: true, bins: true }, orderBy: [{ farmId: "asc" }, { houseCode: "asc" }] }),
    prisma.feedType.findMany({ include: { bins: true }, orderBy: { feedCode: "asc" } }),
    prisma.feedBin.findMany({
      include: { feedType: true, estimate: true, house: { include: { farm: true } } },
      orderBy: [{ farmHouseId: "asc" }, { binCode: "asc" }]
    }),
    prisma.dataQualityIssue.count({ where: { issueStatus: "Open" } }),
    prisma.loadForecast.count({ where: { status: "Open" } })
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        eyebrow="Configuration"
        title="Admin"
        description="Add and edit farms, houses, feed types, and bins. Changes to bin capacity, daily consumption, safe minimum, and active status recalculate inventory, forecasts, and quality checks."
      />
      <section className="grid gap-4 md:grid-cols-4">
        <Stat label="Farms" value={farms.length} />
        <Stat label="Bins" value={bins.length} />
        <Stat label="Open Forecasts" value={openForecasts} tone="#d99a28" />
        <Stat label="Open Issues" value={openIssues} tone="#b42318" />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <form action={createFarmAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Add Farm</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Farm code<input name="farmCode" required /></label>
            <label className="block text-sm font-semibold">Farm name<input name="farmName" required /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Grower<input name="growerName" /></label>
            <label className="block text-sm font-semibold">Region<input name="region" /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Route<input name="route" /></label>
            <label className="block text-sm font-semibold">Address<input name="address" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><ActiveCheckbox active /> Active</label>
          <button type="submit">Add farm</button>
        </form>

        <form action={createFarmHouseAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Add House</h2>
          <label className="block text-sm font-semibold">Farm<select name="farmId">{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.farmCode} - {farm.farmName}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-semibold">House code<input name="houseCode" required /></label>
            <label className="block text-sm font-semibold">Bird count<NumericInput name="birdCount" /></label>
            <label className="block text-sm font-semibold">Flock age days<NumericInput name="flockAgeDays" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><ActiveCheckbox active /> Active</label>
          <button type="submit" disabled={!farms.length}>Add house</button>
        </form>

        <form action={createFeedTypeAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Add Feed Type</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">Feed code<input name="feedCode" required /></label>
            <label className="block text-sm font-semibold">Feed name<input name="feedName" required /></label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><ActiveCheckbox active /> Active</label>
          <button type="submit">Add feed type</button>
        </form>

        <form action={createFeedBinAction} className="panel space-y-3 p-5">
          <h2 className="text-lg font-bold">Add Bin</h2>
          <label className="block text-sm font-semibold">House<select name="farmHouseId">{houses.map((house) => <option key={house.id} value={house.id}>{house.farm.farmCode} / {house.houseCode}</option>)}</select></label>
          <label className="block text-sm font-semibold">Feed type<select name="feedTypeId">{feedTypes.map((feed) => <option key={feed.id} value={feed.id}>{feed.feedCode} - {feed.feedName}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="block text-sm font-semibold">Bin code<input name="binCode" required /></label>
            <label className="block text-sm font-semibold">Capacity tons<NumericInput name="capacityTons" value={18} step="0.1" /></label>
            <label className="block text-sm font-semibold">Daily tons<NumericInput name="estimatedDailyConsumptionTons" value={2.5} step="0.1" /></label>
            <label className="block text-sm font-semibold">Min safe tons<NumericInput name="minimumSafeTons" value={2} step="0.1" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold"><ActiveCheckbox active /> Active</label>
          <button type="submit" disabled={!houses.length || !feedTypes.length}>Add bin</button>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Farms</h2>
        <DataTable
          rows={farms.map((farm) => ({
            edit: (
              <form action={updateFarmAction} className="grid min-w-[720px] gap-2">
                <input type="hidden" name="farmId" value={farm.id} />
                <div className="grid gap-2 md:grid-cols-[0.7fr_1.2fr_1fr_0.8fr_0.8fr_1.2fr_auto]">
                  <input name="farmCode" defaultValue={farm.farmCode} required />
                  <input name="farmName" defaultValue={farm.farmName} required />
                  <input name="growerName" defaultValue={farm.growerName ?? ""} />
                  <input name="region" defaultValue={farm.region ?? ""} />
                  <input name="route" defaultValue={farm.route ?? ""} />
                  <input name="address" defaultValue={farm.address ?? ""} />
                  <label className="flex items-center gap-2 text-sm"><ActiveCheckbox active={farm.active} /> Active</label>
                </div>
                <button type="submit">Save farm</button>
              </form>
            ),
            houses: farm.houses.length
          }))}
          columns={[
            { key: "edit", label: "Farm Configuration" },
            { key: "houses", label: "Houses", align: "right" }
          ]}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Houses</h2>
        <DataTable
          rows={houses.map((house) => ({
            edit: (
              <form action={updateFarmHouseAction} className="grid min-w-[720px] gap-2">
                <input type="hidden" name="farmHouseId" value={house.id} />
                <div className="grid gap-2 md:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto]">
                  <select name="farmId" defaultValue={house.farmId}>{farms.map((farm) => <option key={farm.id} value={farm.id}>{farm.farmCode} - {farm.farmName}</option>)}</select>
                  <input name="houseCode" defaultValue={house.houseCode} required />
                  <NumericInput name="birdCount" value={house.birdCount} />
                  <NumericInput name="flockAgeDays" value={house.flockAgeDays} />
                  <label className="flex items-center gap-2 text-sm"><ActiveCheckbox active={house.active} /> Active</label>
                </div>
                <button type="submit">Save house</button>
              </form>
            ),
            bins: house.bins.length
          }))}
          columns={[
            { key: "edit", label: "House Configuration" },
            { key: "bins", label: "Bins", align: "right" }
          ]}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Feed Types</h2>
        <DataTable
          rows={feedTypes.map((feed) => ({
            edit: (
              <form action={updateFeedTypeAction} className="grid min-w-[520px] gap-2">
                <input type="hidden" name="feedTypeId" value={feed.id} />
                <div className="grid gap-2 md:grid-cols-[0.8fr_1.4fr_auto]">
                  <input name="feedCode" defaultValue={feed.feedCode} required />
                  <input name="feedName" defaultValue={feed.feedName} required />
                  <label className="flex items-center gap-2 text-sm"><ActiveCheckbox active={feed.active} /> Active</label>
                </div>
                <button type="submit">Save feed type</button>
              </form>
            ),
            bins: feed.bins.length
          }))}
          columns={[
            { key: "edit", label: "Feed Type Configuration" },
            { key: "bins", label: "Bins", align: "right" }
          ]}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">Bins</h2>
        <DataTable
          rows={bins.map((bin) => ({
            edit: (
              <form action={updateFeedBinAction} className="grid min-w-[960px] gap-2">
                <input type="hidden" name="feedBinId" value={bin.id} />
                <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_0.6fr_0.7fr_0.7fr_0.7fr_auto]">
                  <select name="farmHouseId" defaultValue={bin.farmHouseId}>{houses.map((house) => <option key={house.id} value={house.id}>{house.farm.farmCode} / {house.houseCode}</option>)}</select>
                  <select name="feedTypeId" defaultValue={bin.feedTypeId}>{feedTypes.map((feed) => <option key={feed.id} value={feed.id}>{feed.feedCode} - {feed.feedName}</option>)}</select>
                  <input name="binCode" defaultValue={bin.binCode} required />
                  <NumericInput name="capacityTons" value={bin.capacityTons} step="0.1" />
                  <NumericInput name="estimatedDailyConsumptionTons" value={bin.estimatedDailyConsumptionTons} step="0.1" />
                  <NumericInput name="minimumSafeTons" value={bin.minimumSafeTons} step="0.1" />
                  <label className="flex items-center gap-2 text-sm"><ActiveCheckbox active={bin.active} /> Active</label>
                </div>
                <button type="submit">Save bin and recalculate</button>
              </form>
            ),
            farm: `${bin.house.farm.farmCode} / ${bin.house.houseCode}`,
            current: <Tons value={bin.estimate?.currentEstimatedTons} />,
            days: fmtNumber(bin.estimate?.daysRemaining),
            risk: <Pill value={bin.estimate?.riskLevel ?? "Unknown"} />,
            active: <Pill value={bin.active ? "Active" : "Inactive"} />
          }))}
          columns={[
            { key: "edit", label: "Bin Configuration" },
            { key: "farm", label: "Farm / House" },
            { key: "current", label: "Current", align: "right" },
            { key: "days", label: "Days", align: "right" },
            { key: "risk", label: "Risk" },
            { key: "active", label: "Status" }
          ]}
        />
      </section>
    </main>
  );
}
