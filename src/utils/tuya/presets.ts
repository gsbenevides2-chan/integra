import { asc, eq } from "drizzle-orm";
import { db } from "core/db";
import { tuyaPresets } from "core/db/schema";
import { commandDevice } from "utils/tuya/deviceAccess";
import { getDeviceOrThrow } from "utils/tuya/devices";
import type { DeviceCommand } from "utils/tuya/commandTypes";

export type Preset = typeof tuyaPresets.$inferSelect;

export interface PresetInput {
    name: string;
    power?: boolean;
    brightness?: number | null;
    colorTemp?: number | null;
    colorHex?: string | null;
    workMode?: string | null;
}

export async function listPresets(): Promise<Preset[]> {
    return db.select().from(tuyaPresets).orderBy(asc(tuyaPresets.name));
}

export async function getPreset(id: string): Promise<Preset | null> {
    const [preset] = await db.select().from(tuyaPresets).where(eq(tuyaPresets.id, id)).limit(1);
    return preset ?? null;
}

export async function getPresetOrThrow(id: string): Promise<Preset> {
    const preset = await getPreset(id);
    if (!preset) throw new Error(`Preset ${id} not found`);
    return preset;
}

export async function createPreset(input: PresetInput): Promise<Preset> {
    const [created] = await db
        .insert(tuyaPresets)
        .values({
            name: input.name,
            power: input.power ?? true,
            brightness: input.brightness ?? null,
            colorTemp: input.colorTemp ?? null,
            colorHex: input.colorHex ?? null,
            workMode: input.workMode ?? null,
        })
        .returning();

    if (!created) throw new Error("Preset not created");
    return created;
}

export async function updatePreset(
    id: string,
    input: Partial<PresetInput>,
): Promise<Preset | null> {
    const changes: Partial<typeof tuyaPresets.$inferInsert> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.power !== undefined) changes.power = input.power;
    if (input.brightness !== undefined) changes.brightness = input.brightness;
    if (input.colorTemp !== undefined) changes.colorTemp = input.colorTemp;
    if (input.colorHex !== undefined) changes.colorHex = input.colorHex;
    if (input.workMode !== undefined) changes.workMode = input.workMode;

    if (Object.keys(changes).length === 0) return getPreset(id);

    const [updated] = await db
        .update(tuyaPresets)
        .set(changes)
        .where(eq(tuyaPresets.id, id))
        .returning();

    return updated ?? null;
}

export async function deletePreset(id: string): Promise<void> {
    await db.delete(tuyaPresets).where(eq(tuyaPresets.id, id));
}

/**
 * In colour mode the hue/saturation/brightness all live in `colour_data`, so sending a plain
 * `brightness`/`colorTemp` alongside it would target a data point the lamp isn't using.
 */
function presetToCommand(preset: Preset): DeviceCommand {
    const command: DeviceCommand = { power: preset.power };
    if (preset.workMode === "colour" && preset.colorHex !== null) {
        command.colorHex = preset.colorHex;
        return command;
    }
    if (preset.colorTemp !== null) command.colorTemp = preset.colorTemp;
    if (preset.brightness !== null) command.brightness = preset.brightness;
    return command;
}

export async function applyPreset(presetId: string, deviceId: string, traceId: string) {
    const preset = await getPresetOrThrow(presetId);
    const device = await getDeviceOrThrow(deviceId);
    return commandDevice(device, presetToCommand(preset), traceId);
}
