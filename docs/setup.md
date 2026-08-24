# Atlas Setup and Operations

This document provides instructions for running Atlas in local development environments and via Docker Compose.

## 1. Environment Variables

Atlas uses a centralized configuration mechanism relying on Zod to validate all required environment variables at boot. The process will intentionally crash if these are not set.

Create a `.env` file in the `server/` directory:
```env
# Database (Must include schema=public for Prisma)
DATABASE_URL="postgresql://atlas:atlas_password@localhost:5433/atlas_db?schema=public"

# Redis (BullMQ requires this for execution transport)
REDIS_URL="redis://localhost:6380"

# Application Settings
PORT=4000
JWT_SECRET="super_secret_dev_key_that_is_long_enough"

# Scheduler (How often the scheduler loops to check for due jobs/orphans)
SCHEDULER_INTERVAL_MS=5000
```

## 2. Docker Compose Strategy (Recommended)

The easiest way to boot the full architecture (Postgres, Redis, PgBouncer, Migrations, API, Scheduler, Worker) is using Docker Compose.

### Clean Startup

To guarantee a clean environment (no old data or cached states):
```bash
cd server
docker compose down -v
docker compose up --build -d
```

### The Migration Lifecycle
The `docker-compose.yml` file contains a dedicated init container named `atlas-migrate`. 
1. `atlas-migrate` starts and waits for `postgres` to be healthy.
2. `atlas-migrate` runs `npx prisma migrate deploy`.
3. `atlas-api`, `atlas-scheduler`, and `atlas-worker` all have a `depends_on` condition for `atlas-migrate: service_completed_successfully`.
4. This ensures the schema is strictly enforced before any application code executes.

### Service Dependencies
- **PostgreSQL**: Foundational authoritative store.
- **Redis**: Foundational execution transport.
- **atlas-migrate**: Depends on Postgres.
- **atlas-api**: Depends on Postgres, Redis, atlas-migrate.
- **atlas-scheduler**: Depends on Postgres, Redis, atlas-migrate.
- **atlas-worker**: Depends on Postgres, Redis, atlas-migrate.

## 3. Local Development

To run the Node.js applications directly on your host machine (for debugging or active development):

### A. Start Infrastructure Only
```bash
cd server
docker compose up -d postgres redis
```

### B. Run Database Migrations
```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

### C. Run the Services
You must run all three services concurrently for the system to function. Open three terminal windows:
```bash
# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:scheduler

# Terminal 3
npm run dev:worker
```

## 4. Troubleshooting

**Worker keeps saying "Marked worker unhealthy"**
- Ensure your worker container has network access to PostgreSQL. The scheduler is detecting that the worker hasn't successfully updated its heartbeat row in `worker_heartbeats`.

**Jobs are stuck in `QUEUED`**
- Ensure `atlas-worker` is running.
- Ensure the specific queue the job belongs to is not paused (`is_paused = false`).
- Ensure the queue has not hit its concurrency limit. Check running jobs via the API.

**Jobs are stuck in `SCHEDULED`**
- Ensure `atlas-scheduler` is running. The scheduler is responsible for polling `available_at` and moving jobs to `QUEUED`.

**Prisma Client Error (Invalid DB URL)**
- If running in Docker, verify that `prisma.config.ts` exists inside the container. This file is explicitly copied in the Dockerfiles to resolve `DATABASE_URL` during the `prisma generate` step at runtime.
