import { SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import { Gaxios, GaxiosOptions, GaxiosPromise } from "gaxios";

import { recordSpanError } from "./withSpan";

/** Whether we've already patched Gaxios.prototype.request to avoid double-wrap. */
let patched = false;

/**
 * Substitute `(Gaxios.prototype.request)` so that every HTTP call made
 * through `gaxios` (the transport used by `googleapis`) produces an
 * OpenTelemetry {@link SpanKind.CLIENT span} with URL, method, and
 * response status — exactly mirroring what {@code instrumentFetch} does
 * for {@code globalThis.fetch}-based calls.
 *
 * Call this <b>once</b> during server startup, after the tracer has been
 * initialised but before any googleapis client is created.
 */
export function instrumentGaxios(): void {
  if (patched) return;
  patched = true;

  const tracer = trace.getTracer("googleapis");
  const original = Gaxios.prototype.request.bind(Gaxios.prototype);

  // Gaxios.prototype.request<T>(opts?: GaxiosOptions): GaxiosPromise<T>
  Gaxios.prototype.request = function request(
    this: Gaxios,
    opts: GaxiosOptions = {},
  ): GaxiosPromise<unknown> {
    const method = (opts.method ?? "GET").toUpperCase();
    const rawUrl = opts.url?.toString() ?? "unknown";
    let hostname = "unknown";
    try {
      hostname = new URL(rawUrl).hostname;
    } catch {
      // use the default fallback
    }

    return tracer.startActiveSpan(
      `${method} ${hostname}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "http.request.method": method,
          "url.full": rawUrl,
          "server.address": hostname,
          "service_name": hostname,
          "peer.service": "google-api",
        },
      },
      async (span) => {
        try {
          const result = await original(opts);

          span.setAttribute(
            "http.response.status_code",
            result.status,
          );
          if (!result.ok) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: `HTTP ${result.status}`,
            });
          }

          return result;
        } catch (error: unknown) {
          recordSpanError(span, error);
          throw error;
        } finally {
          span.end();
        }
      },
    ) as GaxiosPromise<unknown>;
  };
}