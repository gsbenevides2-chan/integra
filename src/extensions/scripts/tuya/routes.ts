import Elysia, { status } from "elysia";
import z from "zod";
import onHttp from "core/triggers/http";
import { WORK_MODES, type DeviceState, OFFLINE_STATE } from "utils/tuya/capabilities";
import {
    createDevice,
    deleteDevice,
    getDevice,
    listDevices,
    updateDevice,
    type PublicDevice,
} from "utils/tuya/devices";
import { commandDevice, readDeviceState, UNTRACED } from "utils/tuya/deviceAccess";
import { getLatestState, getStateHistory } from "utils/tuya/state";
import {
    createSensor,
    deleteSensor,
    getReadingHistory,
    getSensor,
    getLatestReadingsFor,
    listSensors,
    renameSensor,
    setEnabled,
    setHidden,
} from "utils/tuya/sensors";

const deviceBody = z.object({
    name: z.string().min(1),
    tuyaDeviceId: z.string().min(1),
    kind: z.enum(["lamp", "switch"]).optional(),
    channelCount: z.number().int().positive().nullable().optional(),
    enabled: z.boolean().optional(),
    hidden: z.boolean().optional(),
});

const deviceUpdateBody = deviceBody.partial();

const commandBody = z
    .object({
        power: z.boolean().optional(),
        brightness: z.number().min(0).max(100).optional(),
        colorTemp: z.number().min(0).max(100).optional(),
        colorHex: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb colour")
            .optional(),
        workMode: z.enum(WORK_MODES).optional(),
        channels: z.record(z.string(), z.boolean()).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, "At least one field is required");

const sensorBody = z.object({
    name: z.string().min(1),
    tuyaDeviceId: z.string().min(1),
    kind: z.enum(["temperature_humidity", "door", "motion", "unknown"]).optional(),
    category: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    hidden: z.boolean().optional(),
});

interface DeviceWithState extends PublicDevice {
    state: DeviceState;
}

export const tuyaElysiaClient = new Elysia({ prefix: "/tuya" })
    .get(
        "/devices",
        async ({ query }): Promise<DeviceWithState[]> => {
            const all = await listDevices();
            const devices = query.includeHidden === "true" ? all : all.filter((d) => !d.hidden);
            return Promise.all(
                devices.map(async (device) => ({
                    ...device,
                    state: (await getLatestState(device.id)) ?? OFFLINE_STATE,
                })),
            );
        },
        { query: z.object({ includeHidden: z.string().optional() }) },
    )
    .post("/devices", async ({ body }) => createDevice(body), { body: deviceBody })
    .put(
        "/devices/:id",
        async ({ params, body }) => {
            const updated = await updateDevice(params.id, body);
            if (!updated) return status(404, { error: "Device not found" });
            return updated;
        },
        { body: deviceUpdateBody },
    )
    .delete("/devices/:id", async ({ params }) => {
        await deleteDevice(params.id);
        return { ok: true };
    })
    .get("/devices/:id/state", async ({ params }) => {
        const device = await getDevice(params.id);
        if (!device) return status(404, { error: "Device not found" });
        try {
            return await readDeviceState(device, UNTRACED);
        } catch {
            return OFFLINE_STATE;
        }
    })
    .post(
        "/devices/:id/command",
        async ({ params, body }) => {
            const device = await getDevice(params.id);
            if (!device) return status(404, { error: "Device not found" });
            try {
                return await commandDevice(device, body, UNTRACED);
            } catch (error) {
                return status(503, {
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        },
        { body: commandBody },
    )
    .get(
        "/devices/:id/history",
        async ({ params, query }) =>
            getStateHistory(params.id, query.before ? new Date(query.before) : undefined),
        { query: z.object({ before: z.string().optional() }) },
    )
    .get(
        "/sensors",
        async ({ query }) => {
            const all = await listSensors();
            const sensors = query.includeHidden === "true" ? all : all.filter((s) => !s.hidden);
            const latest = await getLatestReadingsFor(sensors.map((sensor) => sensor.id));
            return sensors.map((sensor) => ({
                ...sensor,
                readings: latest.get(sensor.id) ?? {},
            }));
        },
        { query: z.object({ includeHidden: z.string().optional() }) },
    )
    .post("/sensors", async ({ body }) => createSensor(body), { body: sensorBody })
    .put(
        "/sensors/:id",
        async ({ params, body }) => {
            const sensor = await getSensor(params.id);
            if (!sensor) return status(404, { error: "Sensor not found" });
            if (body.name !== undefined) await renameSensor(params.id, body.name);
            if (body.enabled !== undefined) await setEnabled(params.id, body.enabled);
            if (body.hidden !== undefined) await setHidden(params.id, body.hidden);
            return getSensor(params.id);
        },
        {
            body: z.object({
                name: z.string().min(1).optional(),
                enabled: z.boolean().optional(),
                hidden: z.boolean().optional(),
            }),
        },
    )
    .delete("/sensors/:id", async ({ params }) => {
        await deleteSensor(params.id);
        return { ok: true };
    })
    .get(
        "/sensors/:id/history",
        async ({ params, query }) =>
            getReadingHistory(params.id, {
                code: query.code,
                before: query.before ? new Date(query.before) : undefined,
            }),
        { query: z.object({ code: z.string().optional(), before: z.string().optional() }) },
    );

export const tuyaRoutes = onHttp(
    {
        id: "tuya-routes",
        dontTrace: true,
    },
    tuyaElysiaClient,
);
