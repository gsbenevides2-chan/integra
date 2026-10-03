import { SpanKind, trace } from "@opentelemetry/api";

import { cacheRequests } from "../instrumentation/metrics";
import { withSpan } from "../instrumentation/withSpan";

const tracer = trace.getTracer("redis");

export async function redisGet(key: string): Promise<string | null> {
  return withSpan(
    tracer,
    "redis.get",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system.name": "redis",
        "db.operation.name": "GET",
        "db.redis.key": key,
      },
    },
    async (span) => {
      const value = await Bun.redis.get(key);
      span.setAttribute("db.redis.value", value ?? "null");
      span.setAttribute("cache.hit", value !== null);
      cacheRequests.add(1, { result: value !== null ? "hit" : "miss" });
      return value;
    },
  );
}

export async function redisSet(key: string, value: string): Promise<void> {
  await withSpan(
    tracer,
    "redis.set",
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system.name": "redis",
        "db.operation.name": "SET",
        "db.redis.key": key,
        "db.redis.value": value,
      },
    },
    async () => {
      await Bun.redis.set(key, value);
    },
  );
}
