# Integra — Complete Overview

**Integra** is an event-driven integration daemon built with **Bun** and **Elysia**. It connects external services and executes custom scripts in response to events, with full execution tracing to PostgreSQL.

## Project Summary

| Property | Value |
|----------|-------|
| **Name** | @gsbenevides2/integra |
| **Type** | Event-driven daemon |
| **Runtime** | Bun >= 1.3.13 |
| **HTTP Framework** | Elysia 1.4+ |
| **Database** | PostgreSQL (Drizzle ORM) |
| **Validation** | Zod v4 |
| **Version** | 1.0.37 |

## Core Services

Integra manages **6 trigger types** connecting to external services:

1. **HTTP** — Elysia server accepting webhook events
2. **MQTT** — Real-time message broker subscriptions
3. **Redis Pub/Sub** — Channel-based event streaming
4. **PostgreSQL Polling** — Scheduled database queries
5. **Email (IMAP)** — Real-time email listening via IMAP IDLE
6. **Cron** — Scheduled jobs using Bun's built-in cron

## Directory Structure

```
src/
├── index.ts                          # Entry point (registers all triggers)
├── core/
│   ├── index.ts                      # registerSettings() function
│   ├── triggers/                     # Trigger service clients
│   │   ├── index.ts                  # Trigger interface & CliSettings
│   │   ├── http/                     # Elysia HTTP server
│   │   │   ├── index.ts
│   │   │   └── types.ts              # TypedElysia helper
│   │   ├── mqtt/                     # MQTT broker clients
│   │   │   ├── index.ts
│   │   │   └── brokers.ts            # Broker instances config
│   │   ├── redis/                    # Redis Pub/Sub clients
│   │   │   ├── index.ts
│   │   │   └── instances.ts          # Redis instances config
│   │   ├── postgres/                 # PostgreSQL polling
│   │   │   ├── index.ts
│   │   │   └── instances.ts          # Database instances config
│   │   ├── email/                    # IMAP email listening
│   │   │   ├── index.ts
│   │   │   └── accounts.ts           # Email accounts config
│   │   ├── cron/                     # Bun cron jobs
│   │   ├── manual/                   # Manual test triggers
│   │   └── tuya/                     # Tuya smart home integration
│   ├── ui/                           # React UI dashboard
│   │   ├── client-bundle.tsx         # Client entry point
│   │   ├── sw.ts                     # Service worker
│   │   ├── registerServiceWorker.ts
│   │   └── components/               # React components
│   │       ├── sidebar, drawer, input, toast, confirm, etc.
│   ├── instrumentation/              # Execution tracing
│   │   ├── index.ts                  # Tracer functions
│   │   └── types.ts                  # Tracer types
│   └── db/                           # Database
│       ├── drizzle.config.ts         # Drizzle ORM config
│       ├── index.ts
│       └── schema.ts                 # Drizzle schema
├── extensions/
│   ├── scripts/                      # User-defined scripts (business logic)
│   │   ├── authentik/                # Authentik SSO integration
│   │   ├── auto-clean/               # Auto-cleanup jobs
│   │   ├── birthday/                 # Birthday notifications
│   │   ├── calendars/                # Calendar integrations
│   │   ├── execution-logs/           # Log UI & API
│   │   ├── gmail/                    # Gmail integrations
│   │   ├── google-accounts/          # Google account management
│   │   ├── platform-status/          # Platform health checks
│   │   ├── server-metrics/           # Server monitoring & speedtest
│   │   ├── sinal/                    # Signal/SMS monitoring
│   │   ├── tp-link-center/           # TP-Link router management
│   │   ├── train-status/             # Train status monitoring
│   │   ├── tuya/                     # Tuya smart home devices
│   │   └── tuya-automations/         # Tuya automation scripts
│   └── db/                           # Extension database schemas
├── utils/                            # Shared utilities
│   ├── safeEnvGet.ts                 # Safe environment variable access
│   ├── discord/                      # Discord integration
│   ├── google/                       # Google APIs (Gmail, etc.)
│   └── ...                           # Other utilities
└── input.css                         # Tailwind CSS input

dist/                                 # Built output
assets/                               # Compiled CSS and client bundles
```

## Execution Flow

```
┌─ External Event
│  (HTTP, MQTT, Redis, Postgres, Email, Cron)
│
├─ Trigger receives event
├─ Generate traceId (UUID)
├─ Start instrumentation (startTracer)
│
├─ Execute trigger handler
│  ├─ Validate request/data (Zod)
│  ├─ Execute business logic
│  ├─ Log events (addTracerEvent)
│  └─ Handle errors
│
├─ End instrumentation (endTracer)
└─ Store trace to PostgreSQL

PostgreSQL tables:
  - runs (execution records)
  - run_events (execution events)
```

## Key Concepts

### Trigger
A unit of business logic responding to an external event. Each trigger has:
- `id: string` — unique identifier (e.g., `"authentik:loginFailed"`)
- `type?: string` — trigger type (e.g., `"http"`, `"cron"`, `"mqtt"`)
- `register(): Promise<void>` — called during startup to register the trigger
- `test?(): Promise<void>` — optional test function

### Service Client
Persistent connection to an external service (MQTT broker, Redis, PostgreSQL, etc.), managed globally by `src/core/triggers/`. Each service has a `start*Clients()` function called unconditionally at startup.

### Instrumentation
Tracing and logging layer recording every trigger execution:
- **startTracer** — records execution start (input, trigger ID, type)
- **addTracerEvent** — logs named events during execution
- **endTracer** — marks execution complete (output, status)
- **instrumentableFetch** — wraps `fetch()` to log HTTP calls

### Trace ID
A `crypto.randomUUID()` assigned per execution, propagated through all events and logs for end-to-end tracing.

## Script Organization

Scripts live in `src/extensions/scripts/<service>/<name>/` and typically include:
- `index.ts` — trigger definition
- `types.ts` — Zod validation schemas
- `utils.ts` or `handlers.ts` — business logic
- `routes.ts` — Elysia route(s) (for HTTP triggers)
- `cron.ts` — cron job definition

Example: `src/extensions/scripts/authentik/loginFailed/`
1. Authentik sends POST to `/authentik-login-failed`
2. Zod validates the request body
3. `generateMessage()` formats a Discord message
4. `sendDiscordMessage()` sends it via Discord webhook
5. Events are logged to PostgreSQL

## CLI Flags

```bash
bun run src/index.ts [flags]
```

| Flag | Description |
|------|-------------|
| `--only-run=<id>` | Register only triggers matching this ID (repeatable) |
| `--debug` | Enable `console.debug` output |
| `--test=<id>` | Test a specific trigger's test function |
| `--disableCrons` | Skip cron triggers during startup |

## Environment Variables

Core configuration (see `docs/configuration.md` for full list):

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | HTTP server port | `3000` |
| `MONGO_LOGS` | **DEPRECATED** — MongoDB connection (now PostgreSQL) | — |
| `POSTGRES_DEFAULT_URL` | PostgreSQL connection string | `none` |
| `MQTT_DEFAULT_BROKER_URL` | MQTT broker URL | `mqtt://192.168.0.3:1883` |
| `REDIS_URL` | Redis connection | `none` |
| `EMAIL_DEFAULT_HOST` | IMAP server host | `none` |
| `DISCORD_DEFAULT_PUBLIC_KEY` | Discord bot token | — |

## Development Commands

| Command | Action |
|---------|--------|
| `bun run dev` | Start with Tailwind watch, Elysia HMR, and React build watch |
| `bun run start` | Start production daemon |
| `bun run lint` | ESLint check |
| `bun run lint:fix` | ESLint fix + format |
| `bun run format` | Prettier check |
| `bun run format:fix` | Prettier write |
| `bun run db:sync` | Push Drizzle schema to PostgreSQL |
| `bun run db:studio` | Open Drizzle Studio UI |

## Architecture Highlights

1. **Modular Triggers** — Each trigger type is isolated in `src/core/triggers/`
2. **Service Clients** — HTTP, MQTT, Redis, Postgres, Email clients start unconditionally
3. **Instrumentation** — Every execution traced to PostgreSQL with start, events, and end records
4. **CLI Filtering** — `--only-run` and `--debug` for development and testing
5. **React UI** — Dashboard for viewing execution logs and managing extensions
6. **Extensions** — Business logic organized by service in `src/extensions/scripts/`

## Conventions

- **Imports**: Bare specifiers with `baseUrl: "src"` in tsconfig
- **HTTP Triggers**: Must use `TypedElysia()` from `triggers/http/types` (adds `traceId` and `triggerId` decorators)
- **Validation**: Zod v4 for all request bodies
- **Formatting**: tabWidth 4, singleQuote false, trailingComma all, printWidth 100
- **Logging**: `addTracerEvent()` for structured logging (never `console.log` for data)
- **Environment**: `safeEnvGet()` throws at import if variable missing (fail-fast)

## Database Schema

PostgreSQL (via Drizzle ORM) stores execution traces:

### `runs` table
```ts
{
    id: text,                    // UUID PK
    traceId: text,               // UUID unique index
    triggerId: text,             // Indexed
    startTime: timestamptz,      // Indexed
    endTime?: timestamptz,
    workflowType: text,          // "http", "mqtt", "redis", etc.
    inputData: jsonb,
    outputData?: jsonb,
    status?: "SUCCESS" | "ERROR",
}
```

### `run_events` table
```ts
{
    id: text,                    // UUID PK
    runId: text,                 // FK -> runs.id
    eventName: text,
    eventData: jsonb,
    eventType: "INFO" | "ERROR",
    dateTime: timestamptz,
}
```

## Security & Secrets

- `.env` is gitignored; use `.env.local` locally
- `safeEnvGet()` throws at module import if a variable is missing
- Secrets stored in environment variables only (never hardcoded)
- PostgreSQL connection string should use SSL/TLS in production

## Features

✅ **5 trigger types** — HTTP, MQTT, Redis, PostgreSQL, Email  
✅ **Cron jobs** — Bun's built-in cron for scheduled tasks  
✅ **Full instrumentation** — Every execution traced to PostgreSQL  
✅ **React dashboard** — View logs, manage settings  
✅ **Modular scripts** — Business logic separated from infrastructure  
✅ **Type-safe** — TypeScript + Zod validation  
✅ **Discord integration** — Built-in Discord webhook support  
✅ **Dev tools** — HMR, file watching, debug logging
