# Instrumentation

The instrumentation layer automatically traces every trigger execution and stores it in PostgreSQL.

## How It Works

Each trigger execution receives a `traceId` (UUID). The instrumentation system records:

1. **Start**: When execution begins (input data, trigger ID, workflow type)
2. **Events**: Named events during execution (errors, custom info)
3. **End**: When execution finishes (output data, SUCCESS/ERROR status)

## PostgreSQL Schema (Drizzle ORM, `src/core/db/schema.ts`)

### `runs` table

```ts
{
    id: text,                    // UUID PK
    traceId: text,               // UUID unique index
    triggerId: text,             // e.g. "authentik:loginFailed", indexed
    startTime: timestamptz,      // indexed (dashboard range filter, sort)
    endTime?: timestamptz,
    workflowType: text,          // "http", "mqtt", "redis", "postgres", "email", "cron", indexed
    inputData: jsonb,
    outputData?: jsonb,
    status?: "SUCCESS" | "ERROR", // indexed
}
```

### `run_events` table

```ts
{
    id: text,                    // UUID PK
    runId: text,                 // FK -> runs.id, indexed, cascades on delete
    eventName: text,
    eventData: jsonb,
    eventType: "INFO" | "ERROR",
    dateTime: timestamptz,
}
```

Events are stored in their own table (rather than embedded) for normalization and query efficiency. Run `bun run db:sync` after schema changes to push the schema to PostgreSQL.

## Functions

### `startTracer(params)`
Records the beginning of a trace.

### `endTracer(params, createTracer?)`
Marks a trace as complete. If the trace doesn't exist and `createTracer` is provided, it creates one (for edge cases like HTTP error handlers).

### `addTracerEvent(params)`
Appends an event to an existing trace.

### `createTracerIfNotExtistsAndAppendEvent(params, event)`
Creates a trace if it doesn't exist, then appends an event. Used in HTTP error handlers.

### `instumentableFetch(traceId, input, init?)`
A wrapper around `fetch()` that logs the request and response as a trace event. Automatically handles `Headers` objects and `Request` objects.
