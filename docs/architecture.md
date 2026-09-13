# Architecture

Integra is a modular event-driven integration platform built with **Bun** and **Elysia**. It connects various external services (MQTT, Redis, PostgreSQL, Email/IMAP, HTTP) and executes user-defined scripts (triggers) in response to events from those services.

## High-Level Flow

```
External Services
  ├─ HTTP (Elysia server)
  ├─ MQTT Broker
  ├─ Redis (Pub/Sub)
  ├─ PostgreSQL (Polling)
  └─ Email (IMAP IDLE)
       │
       ▼
  ┌─────────────────────────────┐
  │      Trigger Registry       │
  │  (src/triggers/index.ts)    │
  │                             │
  │  - Registers user scripts   │
  │  - Starts service clients   │
  └──────────┬──────────────────┘
             │
             ▼
  ┌─────────────────────────────┐
  │     Instrumentation         │
  │  (src/instrumentation/)     │
  │                             │
  │  - Traces every execution   │
  │  - Logs to MongoDB          │
  │  - Wraps fetch() calls      │
  └─────────────────────────────┘
             │
             ▼
  ┌─────────────────────────────┐
  │    User Scripts (Triggers)  │
  │  (src/scripts/)             │
  │                             │
  │  - Business logic           │
  │  - Can call utils           │
  │  - Can send Discord msgs    │
  └─────────────────────────────┘
```

## Key Concepts

- **Trigger**: A unit of business logic (a script) that responds to an event from an external service.
- **Service Client**: A persistent connection to an external service (MQTT broker, Redis, etc.), managed globally.
- **Instrumentation**: A tracing/logging layer that records every trigger execution into PostgreSQL for audit/debug.
- **Trace ID**: A `crypto.randomUUID()` assigned per execution, propagated through all events and logs.

## Directory Structure

```
src/
├── index.ts                    # Entry point (registers all triggers)
├── core/
│   ├── index.ts                # registerSettings() & CLI parser
│   ├── triggers/
│   │   ├── index.ts            # Trigger interface & CliSettings
│   │   ├── http/               # Elysia HTTP server
│   │   ├── mqtt/               # MQTT client(s)
│   │   ├── redis/              # Redis Pub/Sub client(s)
│   │   ├── postgres/           # PostgreSQL polling
│   │   ├── email/              # IMAP email listening
│   │   ├── cron/               # Bun cron jobs
│   │   ├── manual/             # Manual test triggers
│   │   └── tuya/               # Tuya smart home integration
│   ├── ui/                     # React dashboard
│   ├── instrumentation/        # Execution tracing
│   │   ├── index.ts            # Tracer functions
│   │   └── types.ts            # Tracer types
│   └── db/                     # Drizzle ORM
│       ├── drizzle.config.ts   # ORM config
│       └── schema.ts           # Database schema
├── extensions/
│   ├── scripts/                # User-defined trigger scripts
│   │   ├── authentik/          # Authentik SSO integration
│   │   ├── calendars/          # Calendar integrations
│   │   ├── gmail/              # Gmail integration
│   │   ├── tuya/               # Tuya smart home
│   │   └── ...                 # Other integrations
│   └── db/                     # Extension database schemas
├── utils/
│   ├── safeEnvGet.ts           # Safe env var access
│   ├── discord/                # Discord utilities
│   ├── google/                 # Google API utilities
│   └── ...                     # Other utilities
└── input.css                   # Tailwind CSS input
```
