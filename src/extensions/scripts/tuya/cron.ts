import onCron from "core/triggers/cron";
import { reconcileDevices, runDiscovery } from "utils/tuya/sync";
import { syncCatalogue, syncSensorReadings } from "utils/tuya/sensorSync";
import onInterval from "core/triggers/interval";

export const tuyaDiscoveryCron = onCron(
    {
        cron: "*/5 * * * *", // every 5 minutes
        id: "tuya-discovery",
    },
    async (_, traceId) => {
        await runDiscovery(traceId);
    },
);

export const tuyaSyncCron = onInterval(
    {
        intervalMs: 5000, // every five secconds
        id: "tuya-sync",
    },
    async (traceId) => {
        await reconcileDevices(traceId);
    },
);

export const tuyaCatalogueCron = onCron(
    {
        cron: "7 */6 * * *", // four times a day, offset so it never lands with the readings sweep
        id: "tuya-catalogue",
    },
    async (_, traceId) => {
        await syncCatalogue(traceId);
    },
);

export const tuyaSensorReadingsCron = onInterval(
    {
        // every five secconds: a PIR holds its triggered state only briefly, so a slower sweep
        // would walk straight past a real detection.
        intervalMs: 5000, // every five secconds
        id: "tuya-sensor-readings",
    },
    async (traceId) => {
        await syncSensorReadings(traceId);
    },
);
