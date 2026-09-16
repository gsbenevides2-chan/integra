import {
    DONT_TRACE_ID,
    addTracerEvent,
    createTracerIfNotExtistsAndAppendEvent,
    serializeError,
} from "core/instrumentation";
import { getDeviceStatus, type TuyaStatusEntry } from "utils/tuya/cloud/client";
import { cloudStatusToDeviceState, cloudStatusToSwitchState } from "utils/tuya/cloud/deviceState";
import { getDeviceByTuyaId } from "utils/tuya/devices";
import {
    getLatestReadings,
    getSensorByTuyaId,
    kindForCodes,
    saveReadings,
    setKind,
    setLastEventAt,
    setSensorOnline,
} from "utils/tuya/sensors";
import { saveStateIfChanged } from "utils/tuya/state";
import { tuyaEvents } from "utils/tuya/events";

export interface PulsarMessage {
    messageId: string;
    payload: {
        data: Record<string, unknown>;
        protocol: number;
        pv: string;
        t: number;
    };
}

interface TuyaDeviceEvent {
    devId: string;
    bizCode?: "online" | "offline" | string;
    status?: TuyaStatusEntry[];
}

/**
 * Pulsar only reports the data points that actually changed, but `cloudStatusToDeviceState`
 * was written for the cloud's full-status REST response and treats a missing code as "this
 * device has no such capability" — so feeding it a one-field delta would wipe brightness,
 * colour and work mode back to null on every single toggle. This cache holds the fullest
 * status picture seen for each device and merges every incoming delta onto it, seeded once
 * from the cloud on first sight so a process restart doesn't start the picture over.
 */
const fullStatusByDevice = new Map<string, Map<string, TuyaStatusEntry>>();

async function mergedStatus(
    tuyaDeviceId: string,
    incoming: TuyaStatusEntry[],
): Promise<TuyaStatusEntry[]> {
    let known = fullStatusByDevice.get(tuyaDeviceId);
    if (!known) {
        known = new Map();
        try {
            for (const entry of await getDeviceStatus(tuyaDeviceId, DONT_TRACE_ID)) {
                known.set(entry.code, entry);
            }
        } catch {
            // Best effort: a delta-only picture is still better than none.
        }
        fullStatusByDevice.set(tuyaDeviceId, known);
    }

    for (const entry of incoming) known.set(entry.code, entry);
    return [...known.values()];
}

async function handleDeviceReport(
    tuyaDeviceId: string,
    status: TuyaStatusEntry[],
    online: boolean,
): Promise<boolean> {
    const device = await getDeviceByTuyaId(tuyaDeviceId);
    if (!device) return false;

    const full = await mergedStatus(tuyaDeviceId, status);
    const state =
        device.kind === "switch"
            ? cloudStatusToSwitchState(full, online)
            : cloudStatusToDeviceState(full, online);
    await saveStateIfChanged(device.id, state);
    return true;
}

async function handleSensorReport(
    tuyaDeviceId: string,
    status: TuyaStatusEntry[],
): Promise<boolean> {
    const sensor = await getSensorByTuyaId(tuyaDeviceId);
    if (!sensor) return false;

    const detected = kindForCodes(
        status.map((entry) => entry.code),
        sensor.kind,
    );
    if (detected !== sensor.kind) await setKind(sensor.id, detected);

    const latest = await getLatestReadings(sensor.id);
    const now = new Date();
    const readings = status
        .filter((entry) => latest[entry.code] !== String(entry.value))
        .map((entry) => ({
            sensorId: sensor.id,
            code: entry.code,
            value: String(entry.value),
            recordedAt: now,
        }));

    await saveReadings(readings);
    if (readings.length > 0) await setLastEventAt(sensor.id, now);
    for (const reading of readings) {
        tuyaEvents.emitSensorChange({
            sensor,
            code: reading.code,
            value: reading.value,
            previousValue: latest[reading.code] ?? null,
            at: now,
        });
    }
    return true;
}

async function handleOnlineChange(tuyaDeviceId: string, online: boolean): Promise<boolean> {
    const sensor = await getSensorByTuyaId(tuyaDeviceId);
    if (sensor) {
        await setSensorOnline(sensor.id, online);
        return true;
    }

    const device = await getDeviceByTuyaId(tuyaDeviceId);
    if (!device) return false;
    return handleDeviceReport(tuyaDeviceId, [], online);
}

/** Runs outside any trigger's trace, so failures get their own detached run instead of vanishing. */
async function reportDetachedError(
    eventName: string,
    deviceId: string,
    error: unknown,
): Promise<void> {
    try {
        await createTracerIfNotExtistsAndAppendEvent(
            {
                traceId: crypto.randomUUID(),
                triggerId: "tuya-pulsar",
                workflowType: "tuya-pulsar",
                inputData: { deviceId },
            },
            { eventName, eventType: "ERROR", eventData: serializeError(error) },
        );
    } catch {
        // Never let error reporting become the error.
    }
}

export async function handlePulsarMessage(message: PulsarMessage): Promise<void> {
    const event = message.payload.data as unknown as TuyaDeviceEvent;
    if (!event.devId) return;

    try {
        if (event.bizCode === "online" || event.bizCode === "offline") {
            await handleOnlineChange(event.devId, event.bizCode === "online");
            return;
        }

        if (!event.status || event.status.length === 0) return;

        const handledAsDevice = await handleDeviceReport(event.devId, event.status, true);
        if (!handledAsDevice) await handleSensorReport(event.devId, event.status);
    } catch (error) {
        await reportDetachedError("Tuya Pulsar message not processed", event.devId, error);
    }
}

let pulsarTraceId: string | null = null;

/** One long-lived trace for the whole Pulsar connection lifetime, so its events are groupable. */
async function ensurePulsarTrace(): Promise<string> {
    if (pulsarTraceId) return pulsarTraceId;
    pulsarTraceId = crypto.randomUUID();
    await createTracerIfNotExtistsAndAppendEvent(
        {
            traceId: pulsarTraceId,
            triggerId: "tuya-pulsar",
            workflowType: "tuya-pulsar",
            inputData: {},
        },
        { eventName: "Tuya Pulsar connection started", eventType: "INFO", eventData: {} },
    );
    return pulsarTraceId;
}

export async function logPulsarEvent(eventName: string, eventData: object): Promise<void> {
    await addTracerEvent({
        traceId: await ensurePulsarTrace(),
        eventName,
        eventType: "INFO",
        eventData,
    }).catch(() => {});
}
