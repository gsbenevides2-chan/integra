# Integra

Modular event-driven integration daemon built with **Bun** and **Elysia**. Connects external services (HTTP, MQTT, Redis, PostgreSQL, Email/IMAP, Cron) and executes custom scripts in response to events — with full execution tracing to PostgreSQL.

## Features

- **6 trigger types**: HTTP (Elysia), MQTT, Redis (Pub/Sub), PostgreSQL (Polling), Email (IMAP IDLE), and Cron
- **Automatic instrumentation**: Every execution is traced and logged to PostgreSQL
- **Modular scripts**: Business logic lives in `src/extensions/scripts/`, cleanly separated from infrastructure
- **React dashboard**: Web UI for viewing execution logs and managing integrations
- **Tuya smart home**: Built-in support for Tuya IoT devices
- **Discord & Gmail**: Built-in utilities for Discord messages and Gmail integration
- **Zod validation**: Request bodies validated at runtime
- **Debug & filter**: CLI flags for debug logging and trigger filtering
- **Full TypeScript**: Type-safe end-to-end with Zod validation

## Quick Start

```bash
# Install
bun install

# Configure
cp .env .env.local
# Edit .env.local with your credentials

# Run (development)
bun run dev

# Run (production)
bun run start

# Run with only specific triggers
bun run start --only-run=authentik:loginFailed --debug
```

## Documentation

See the [`docs/`](./docs/) folder for detailed documentation:

- **[Overview](./docs/overview.md)** — Complete project structure and concepts
- **[Architecture](./docs/architecture.md)** — System design and data flow
- **[Triggers](./docs/triggers.md)** — Trigger types and factory functions
- **[Scripts](./docs/scripts.md)** — Creating business logic scripts
- **[Instrumentation](./docs/instrumentation.md)** — Execution tracing and PostgreSQL schema
- **[Configuration](./docs/configuration.md)** — Environment variables and CLI arguments
- **[Environment](./docs/environment.md)** — Setup and code quality tools
- **[Utilities](./docs/utils.md)** — Helper functions

## Scripts

| Command | Description |
|---------|-------------|
| `bun run start` | Start in production mode |
| `bun run dev` | Start with file watching (HMR) |
| `bun run lint` | Lint code with ESLint |
| `bun run lint:fix` | Lint and auto-fix |
| `bun run format` | Check formatting with Prettier |
| `bun run format:fix` | Format and write |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) >= 1.3.13
- **HTTP**: [Elysia](https://elysiajs.com) 1.4+
- **Validation**: [Zod](https://zod.dev) v4
- **Database ORM**: [Drizzle ORM](https://orm.drizzle.team) with PostgreSQL
- **UI Framework**: [React](https://react.dev) 19 + [Tailwind CSS](https://tailwindcss.com) 4
- **Database**: PostgreSQL (via Drizzle), Redis (Bun RedisClient), MQTT broker
- **Messaging**: MQTT.js, Discord webhooks, Gmail API
- **Email**: node-imap + mailparser
- **Code Quality**: ESLint + TypeScript ESLint, Prettier
- **Build**: Bun build tool

## License

[MIT](./LICENSE)