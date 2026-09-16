import { asc, eq } from "drizzle-orm";
import { db } from "core/db";
import { tuyaDevices } from "core/db/schema";

export type Device = typeof tuyaDevices.$inferSelect;
export type PublicDevice = Device;

export interface DeviceInput {
    name: string;
    tuyaDeviceId: string;
    kind?: Device["kind"];
    channelCount?: number | null;
    enabled?: boolean;
    hidden?: boolean;
}

export async function listDevices(): Promise<PublicDevice[]> {
    return db.select().from(tuyaDevices).orderBy(asc(tuyaDevices.id));
}

export async function listEnabledDevices(): Promise<Device[]> {
    return db.select().from(tuyaDevices).where(eq(tuyaDevices.enabled, true));
}

export async function getDevice(id: string): Promise<Device | null> {
    const [device] = await db.select().from(tuyaDevices).where(eq(tuyaDevices.id, id)).limit(1);
    return device ?? null;
}

export async function getDeviceOrThrow(id: string): Promise<Device> {
    const device = await getDevice(id);
    if (!device) throw new Error(`Device ${id} not found`);
    return device;
}

export async function getDeviceByTuyaId(tuyaDeviceId: string): Promise<Device | null> {
    const [device] = await db
        .select()
        .from(tuyaDevices)
        .where(eq(tuyaDevices.tuyaDeviceId, tuyaDeviceId))
        .limit(1);
    return device ?? null;
}

/** The only way a device is registered now: pasting in its Tuya `deviceId` by hand. */
export async function createDevice(input: DeviceInput): Promise<PublicDevice> {
    const [created] = await db
        .insert(tuyaDevices)
        .values({
            name: input.name,
            tuyaDeviceId: input.tuyaDeviceId,
            kind: input.kind ?? "lamp",
            channelCount: input.channelCount ?? null,
            enabled: input.enabled ?? true,
        })
        .returning();

    if (!created) throw new Error("Device not created");
    return created;
}

export async function updateDevice(
    id: string,
    input: Partial<DeviceInput>,
): Promise<PublicDevice | null> {
    const changes: Partial<typeof tuyaDevices.$inferInsert> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.tuyaDeviceId !== undefined) changes.tuyaDeviceId = input.tuyaDeviceId;
    if (input.kind !== undefined) changes.kind = input.kind;
    if (input.channelCount !== undefined) changes.channelCount = input.channelCount;
    if (input.enabled !== undefined) changes.enabled = input.enabled;
    if (input.hidden !== undefined) changes.hidden = input.hidden;

    if (Object.keys(changes).length === 0) return getDevice(id);

    const [updated] = await db
        .update(tuyaDevices)
        .set(changes)
        .where(eq(tuyaDevices.id, id))
        .returning();

    return updated ?? null;
}

export async function deleteDevice(id: string): Promise<void> {
    await db.delete(tuyaDevices).where(eq(tuyaDevices.id, id));
}
