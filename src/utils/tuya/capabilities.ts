export const WORK_MODES = ["white", "colour", "scene", "music"] as const;
export type WorkMode = (typeof WORK_MODES)[number];

/** The highest relay channel any supported switch exposes. */
export const MAX_SWITCH_CHANNELS = 6;

export interface DeviceState {
    online: boolean;
    power: boolean | null;
    /** 0-100, normalised so the UI never sees the per-type raw ranges. */
    brightness: number | null;
    /** 0-100, normalised. */
    colorTemp: number | null;
    colorHex: string | null;
    workMode: WorkMode | null;
    /** Switches only: relay state keyed by channel number. */
    channels: Record<string, boolean> | null;
}

export const OFFLINE_STATE: DeviceState = {
    online: false,
    power: null,
    brightness: null,
    colorTemp: null,
    colorHex: null,
    workMode: null,
    channels: null,
};

export function statesEqual(a: DeviceState, b: DeviceState): boolean {
    return (
        a.online === b.online &&
        a.power === b.power &&
        a.brightness === b.brightness &&
        a.colorTemp === b.colorTemp &&
        a.colorHex === b.colorHex &&
        a.workMode === b.workMode &&
        JSON.stringify(a.channels) === JSON.stringify(b.channels)
    );
}

export function percentToRaw(percent: number, min: number, max: number): number {
    const bounded = Math.min(100, Math.max(0, percent));
    return Math.round(min + (bounded / 100) * (max - min));
}
