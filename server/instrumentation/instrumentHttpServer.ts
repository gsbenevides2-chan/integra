import {
  getCurrentSpan,
  opentelemetry,
  setAttributes,
} from "@elysia/opentelemetry";
import { parseKeyPairsIntoRecord } from "@opentelemetry/core";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";

import { appResource, SERVICE_NAME } from "./resource";
import { recordSpanError } from "./withSpan";

export const elysiaOtel = new Elysia({
  detail: {
    tags: ["FrontEnd Tracing"],
  },
})
  .use(
    opentelemetry({
      serviceName: SERVICE_NAME,
      resource: appResource,
      spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
      // Installs the global MeterProvider, so every meter in the app (and the
      // plugin's own http.server.request.duration) is exported.
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(),
      }),
      // Capture Request Body and Request Headers and Sent to OTEL
      recordBody: true,
      headersToSpanAttributes: { request: ["*"] },
      checkIfShouldTrace: (req) => new URL(req.url).pathname !== "/v1/traces",
    }),
  )
  // Capture Response Body and Response Headers and Send to OTEL
  // `as: "global"` is required: hooks are local by default and would not run
  // for routes of other modules; without any afterHandle hook Elysia does not
  // expose `responseValue`, so the plugin records no response body either.
  .onAfterHandle({ as: "global" }, ({ responseValue, set }) => {
    const attributes: Record<string, string> = {};
    for (const [key, value] of Object.entries(set.headers))
      attributes[`http.response.header.${key.toLowerCase()}`] = String(value);
    if (responseValue !== undefined && !(responseValue instanceof Response)) {
      const text =
        typeof responseValue === "object"
          ? JSON.stringify(responseValue)
          : String(responseValue);
      attributes["http.response.body"] = text;
      attributes["http.response.body.size"] = String(
        Buffer.byteLength(text),
      );
    }
    if (Object.keys(attributes).length) setAttributes(attributes);
  })
  .onError({ as: "global" }, ({ error }) => {
    const span = getCurrentSpan();
    if (span) recordSpanError(span, error);
  })
  // Proxy frontend spans to the real collector so its auth header never
  // reaches the browser bundle.
  .post(
    "/v1/traces",
    async ({ request, body }) => {
      const authHeaders = parseKeyPairsIntoRecord(
        process.env.OTEL_EXPORTER_OTLP_HEADERS,
      );
      try {
        const response = await fetch(
          `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
          {
            method: "POST",
            headers: {
              "content-type":
                request.headers.get("content-type") ??
                "application/x-protobuf",
              ...authHeaders,
            },
            body: body as ArrayBuffer,
            skipInstrumentation: true,
          } as RequestInit,
        );
        return new Response(null, { status: response.status });
      } catch {
        // Collector unreachable: tell the browser exporter to retry later.
        return new Response(null, { status: 502 });
      }
    },
    {
      detail: {
        summary: "Proxy Frontend Traces",
        description:
          "Forwards OTLP trace spans emitted by the frontend to the real " +
          "collector, so the collector's auth header never reaches the " +
          "browser bundle.",
      },
      parse: "arrayBuffer",
    },
  );
