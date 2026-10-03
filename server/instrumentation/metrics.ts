import { metrics } from "@opentelemetry/api";

// Instruments are created against the global MeterProvider, which the Elysia
// plugin's NodeSDK installs (see instrumentHttpServer.ts). Created lazily-bound,
// so import order doesn't matter.
const meter = metrics.getMeter("integra");

export const cronRuns = meter.createCounter("cron.job.runs", {
  description: "Cron job executions by outcome.",
});
export const cronDuration = meter.createHistogram("cron.job.duration", {
  description: "Cron job duration.",
  unit: "ms",
});
export const cacheRequests = meter.createCounter("cache.requests", {
  description: "Cache lookups by result (hit/miss).",
});
export const httpClientDuration = meter.createHistogram(
  "http.client.request.duration",
  { description: "Outgoing HTTP request duration.", unit: "ms" },
);
export const dbDuration = meter.createHistogram("db.client.operation.duration", {
  description: "Database query duration.",
  unit: "ms",
});
export const pulsarEvents = meter.createCounter("pulsar.events", {
  description: "Tuya Pulsar connection events and messages by type.",
});

export { meter };
