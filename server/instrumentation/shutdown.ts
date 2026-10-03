import { metrics, trace } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";

type Flushable = { forceFlush?: () => Promise<void> };

/** Proxy providers wrap the real one; unwrap when possible. */
function real(provider: unknown): Flushable {
  const p = provider as { getDelegate?: () => unknown };
  return (p.getDelegate?.() ?? provider) as Flushable;
}

/** Flushes pending spans, logs and metrics so the last batch isn't lost on restart. */
export async function flushTelemetry(): Promise<void> {
  await Promise.allSettled([
    real(trace.getTracerProvider()).forceFlush?.(),
    real(logs.getLoggerProvider()).forceFlush?.(),
    real(metrics.getMeterProvider()).forceFlush?.(),
  ]);
}

export function flushTelemetryOnExit(): void {
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void flushTelemetry().finally(() => process.exit(0));
    });
  }
}
