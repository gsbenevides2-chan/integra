# Triggers

Triggers are the core abstraction in Integra. A **Trigger** is an object with:
- `id: string` — unique identifier
- `type?: string` — trigger type (e.g., `"http"`, `"cron"`, `"mqtt"`)
- `register(): Promise<void>` — called during startup to wire the trigger to its service
- `test?(): Promise<void>` — optional test function

## Creating a Trigger

Each trigger type has a factory function:

```ts
import onHttp from "core/triggers/http";
import { TypedElysia } from "core/triggers/http/types";

const trigger = onHttp(
    { id: "my:httpTrigger" },
    TypedElysia().get("/hello", () => "Hello!"),
);
```

## Available Trigger Types

### HTTP (Elysia)

File: `src/core/triggers/http/index.ts`

Creates an Elysia route. Supports full Elysia API (params, query, body validation via Zod, etc.).

```ts
onHttp({ id: "my:endpoint" }, elysiaApp);
```

Triggers are registered into a global Elysia server that starts on configurable `PORT` (default 3000).

### MQTT

File: `src/core/triggers/mqtt/index.ts`

Subscribes to a topic on an MQTT broker.

```ts
onMqtt({ id: "my:mqtt", broker: "default", topic: "home/temp" }, async (message, topic, traceId) => {
    console.log(message.toString());
});
```

- `qos`: 0, 1, or 2 (default 0)
- Instances defined in `src/core/triggers/mqtt/brokers.ts`

### Redis (Pub/Sub)

File: `src/core/triggers/redis/index.ts`

Subscribes to a Redis channel.

```ts
onRedis({ id: "my:redis", instance: "default", channel: "notifications" }, async (message, channel, traceId) => { ... });
```

- Uses Bun's built-in `RedisClient`
- Instances defined in `src/core/triggers/redis/instances.ts`

### PostgreSQL (Polling)

File: `src/core/triggers/postgres/index.ts`

Polls a PostgreSQL database at a fixed interval.

```ts
onPostgres(
    { id: "my:pg", instance: "default", query: "SELECT * FROM events WHERE processed = false", intervalMs: 5000 },
    async (rows, traceId) => { ... },
);
```

- `intervalMs`: polling interval in milliseconds
- Uses Bun's built-in `SQL` client
- Instances defined in `src/core/triggers/postgres/instances.ts`

### Email (IMAP)

File: `src/core/triggers/email/index.ts`

Listens for new emails via IMAP IDLE.

```ts
onEmail(
    { id: "my:email", account: "default", mailbox: "INBOX", searchCriteria: ["UNSEEN"], markSeen: true },
    async (email, traceId) => { ... },
);
```

- Uses `imap` and `mailparser` packages
- Accounts defined in `src/core/triggers/email/accounts.ts`

### Cron

File: `src/core/triggers/cron/index.ts`

Runs on a schedule using Bun's built-in cron.

```ts
onCron(
    { id: "my:cron", cron: "*/5 * * * *" },
    async (cronJob, traceId) => { ... },
);
```

## Trigger Registry (CLI)

`src/core/index.ts` handles registration and CLI arguments via `registerSettings()`

| Flag | Description |
|------|-------------|
| `--only-run=id` | Only register triggers matching this id (repeatable) |
| `--debug` | Enable debug logging |

```bash
bun run src/index.ts --only-run=authentik:loginFailed --debug
```