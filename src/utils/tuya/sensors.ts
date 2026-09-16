import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "core/db";
import { tuyaSensorReadings, tuyaSensors } from "core/db/schema";

export type Sensor = typeof tuyaSensors.$inferSelect;
export type SensorKind = Sensor["kind"];
export type SensorReading = typeof tuyaSensorReadings.$inferSelect;

const READINGS_PAGE_SIZE = 300;

/**
 * Tuya reports a product category rather than a role. These are the categories behind the
 * sensors this account exposes; anything else is stored but left unclassified so it still
 * shows up instead of being silently dropped.
 */
const KIND_BY_CATEGORY: Record<string, SensorKind> = {
    wsdcg: "temperature_humidity",
    mcs: "door",
    pir: "motion",
};

export function kindForCategory(category: string, productName?: string): SensorKind {
    const known = KIND_BY_CATEGORY[category];
    if (known) return known;
    // Some devices ship with a wrong category but an honest product name.
    if (productName && /motion|pir|occupanc/i.test(productName)) return "motion";
    return "unknown";
}

/**
 * The data points a device actually reports are more reliable than its declared category:
 * these PIR sensors ship as category "tdq", which is Tuya's code for a wall switch.
 */
export function kindForCodes(codes: string[], fallback: SensorKind): SensorKind {
    if (codes.some((code) => /^pir(_state)?$/.test(code))) return "motion";
    if (codes.includes("doorcontact_state")) return "door";
    if (codes.includes("va_temperature") || codes.includes("va_humidity")) {
        return "temperature_humidity";
    }
    return fallback;
}

export async function setKind(id: string, kind: SensorKind): Promise<void> {
    await db.update(tuyaSensors).set({ kind }).where(eq(tuyaSensors.id, id));
}

export async function listSensors(): Promise<Sensor[]> {
    return db.select().from(tuyaSensors).orderBy(tuyaSensors.name);
}

export async function listEnabledSensors(): Promise<Sensor[]> {
    return db.select().from(tuyaSensors).where(eq(tuyaSensors.enabled, true));
}

export async function getSensor(id: string): Promise<Sensor | null> {
    const [sensor] = await db.select().from(tuyaSensors).where(eq(tuyaSensors.id, id)).limit(1);
    return sensor ?? null;
}

export async function getSensorByTuyaId(tuyaDeviceId: string): Promise<Sensor | null> {
    const [sensor] = await db
        .select()
        .from(tuyaSensors)
        .where(eq(tuyaSensors.tuyaDeviceId, tuyaDeviceId))
        .limit(1);
    return sensor ?? null;
}

export async function setSensorOnline(id: string, online: boolean): Promise<void> {
    await db.update(tuyaSensors).set({ online }).where(eq(tuyaSensors.id, id));
}

export interface SensorInput {
    tuyaDeviceId: string;
    name: string;
    kind?: SensorKind;
    category?: string | null;
    enabled?: boolean;
    hidden?: boolean;
}

/** The only way a sensor is registered now: pasting in its Tuya `deviceId` by hand. */
export async function createSensor(input: SensorInput): Promise<Sensor> {
    const [created] = await db
        .insert(tuyaSensors)
        .values({
            tuyaDeviceId: input.tuyaDeviceId,
            name: input.name,
            kind: input.kind ?? "unknown",
            category: input.category ?? null,
            enabled: input.enabled ?? true,
            hidden: input.hidden ?? false,
        })
        .returning();

    if (!created) throw new Error("Sensor not created");
    return created;
}

export async function deleteSensor(id: string): Promise<void> {
    await db.delete(tuyaSensors).where(eq(tuyaSensors.id, id));
}

export async function setEnabled(id: string, enabled: boolean): Promise<void> {
    await db.update(tuyaSensors).set({ enabled }).where(eq(tuyaSensors.id, id));
}

/** Hiding only affects the dashboard; collection carries on so the history stays unbroken. */
export async function setHidden(id: string, hidden: boolean): Promise<void> {
    await db.update(tuyaSensors).set({ hidden }).where(eq(tuyaSensors.id, id));
}

export async function listVisibleSensors(): Promise<Sensor[]> {
    return db
        .select()
        .from(tuyaSensors)
        .where(eq(tuyaSensors.hidden, false))
        .orderBy(tuyaSensors.name);
}

export async function renameSensor(id: string, name: string): Promise<void> {
    await db.update(tuyaSensors).set({ name }).where(eq(tuyaSensors.id, id));
}

export async function setLastEventAt(id: string, at: Date): Promise<void> {
    await db.update(tuyaSensors).set({ lastEventAt: at }).where(eq(tuyaSensors.id, id));
}

export interface ReadingInput {
    sensorId: string;
    code: string;
    value: string;
    recordedAt: Date;
}

export async function saveReadings(readings: ReadingInput[]): Promise<number> {
    if (readings.length === 0) return 0;
    await db.insert(tuyaSensorReadings).values(readings).onConflictDoNothing();
    return readings.length;
}

/** The newest value of every data point a sensor reports. */
export async function getLatestReadings(sensorId: string): Promise<Record<string, string>> {
    const rows = await db
        .select()
        .from(tuyaSensorReadings)
        .where(eq(tuyaSensorReadings.sensorId, sensorId))
        .orderBy(desc(tuyaSensorReadings.recordedAt))
        .limit(READINGS_PAGE_SIZE);

    const latest: Record<string, string> = {};
    for (const row of rows) latest[row.code] ??= row.value;
    return latest;
}

export async function getLatestReadingsFor(
    sensorIds: string[],
): Promise<Map<string, Record<string, string>>> {
    const out = new Map<string, Record<string, string>>();
    if (sensorIds.length === 0) return out;

    const rows = await db
        .select()
        .from(tuyaSensorReadings)
        .where(inArray(tuyaSensorReadings.sensorId, sensorIds))
        .orderBy(desc(tuyaSensorReadings.recordedAt))
        .limit(READINGS_PAGE_SIZE * sensorIds.length);

    for (const row of rows) {
        const entry = out.get(row.sensorId) ?? {};
        entry[row.code] ??= row.value;
        out.set(row.sensorId, entry);
    }
    return out;
}

export interface ReadingHistoryPage {
    readings: SensorReading[];
    hasMore: boolean;
    nextCursor: string | null;
}

export async function getReadingHistory(
    sensorId: string,
    options: { code?: string; before?: Date } = {},
): Promise<ReadingHistoryPage> {
    const filters = [eq(tuyaSensorReadings.sensorId, sensorId)];
    if (options.code) filters.push(eq(tuyaSensorReadings.code, options.code));
    if (options.before) filters.push(lt(tuyaSensorReadings.recordedAt, options.before));

    const rows = await db
        .select()
        .from(tuyaSensorReadings)
        .where(and(...filters))
        .orderBy(desc(tuyaSensorReadings.recordedAt))
        .limit(READINGS_PAGE_SIZE + 1);

    const hasMore = rows.length > READINGS_PAGE_SIZE;
    const readings = hasMore ? rows.slice(0, READINGS_PAGE_SIZE) : rows;

    return {
        readings: [...readings].reverse(),
        hasMore,
        nextCursor: hasMore ? (readings.at(-1)?.recordedAt.toISOString() ?? null) : null,
    };
}

export async function pruneReadings(olderThan: Date): Promise<void> {
    await db.delete(tuyaSensorReadings).where(lt(tuyaSensorReadings.recordedAt, olderThan));
}

export async function countReadingsSince(sensorId: string, since: Date): Promise<number> {
    const rows = await db
        .select({ id: tuyaSensorReadings.id })
        .from(tuyaSensorReadings)
        .where(
            and(
                eq(tuyaSensorReadings.sensorId, sensorId),
                gt(tuyaSensorReadings.recordedAt, since),
            ),
        );
    return rows.length;
}
