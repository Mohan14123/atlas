# Atlas Job Queue

Atlas is a hybrid, production-ready background job processing system combining the persistent, transactional safety of PostgreSQL with the low-latency execution transport of Redis and BullMQ. 

## Key Capabilities

- **Strict Multi-tenancy**: Organization-scoped projects and queues with isolated access via JWT authentication.
- **Dynamic Queue Topology**: One BullMQ queue per Atlas queue, dynamically managed by workers using a synchronized `BullMQManager`.
- **Advanced Scheduling**: Supports immediate, delayed, and recurring (cron) jobs natively.
- **Authoritative Concurrency**: Queue concurrency limits are strictly enforced by PostgreSQL using `FOR UPDATE SKIP LOCKED`.
- **Failure Recovery**: Includes automated stale worker detection, orphaned job recovery, and a resilient dead letter queue (DLQ) with replay functionality.
- **High Observability**: Built-in metrics tracking throughput, success/failure rates, queue depths, and worker utilization.

## Architecture Overview

Atlas uses a unique hybrid architecture where **PostgreSQL is the absolute authoritative source of truth**, and **BullMQ is strictly an execution transport layer**. 
- **PostgreSQL**: Stores job state, payload, retry metadata, and enforces state machine transitions and concurrency limits.
- **Redis / BullMQ**: Only stores a tiny payload (`{ jobId }`). BullMQ delivers the job ID to a worker quickly. The worker then atomically claims the full job data from PostgreSQL.

For full architectural details, see the [Architecture Document](docs/architecture.md) and [Design Decisions](docs/design-decisions.md).

## Technology Stack

- **API & Core**: Node.js, Express, TypeScript, Zod (validation)
- **Database**: PostgreSQL 16, Prisma ORM
- **Transport**: Redis 7, BullMQ
- **Infrastructure**: Docker, Docker Compose, PgBouncer

## Repository Structure

```text
├── server/
│   ├── src/
│   │   ├── api/            # REST API (Express controllers, routes, middlewares)
│   │   ├── scheduler/      # Background loops (Cron, retry, recovery, reconciliation)
│   │   ├── worker/         # Job execution (BullMQ consumers, handlers)
│   │   ├── shared/         # Database, Redis, configuration, and state machine
│   ├── prisma/             # Database schema and migrations
│   ├── tests/              # Unit, API, and Integration test suites
│   ├── Dockerfile.*        # Container definitions for API, Scheduler, Worker
│   └── docker-compose.yml  # Local stack orchestration
├── docs/                   # Full system documentation
```

## Prerequisites

- Node.js (v20+)
- Docker and Docker Compose
- `npm` or `yarn`

## Environment Variables

Copy the `.env.example` file to `.env` in the `server/` directory:

```bash
cd server
cp .env.example .env
```

Ensure the following variables are set:
```env
DATABASE_URL="postgresql://atlas:atlas_password@localhost:5433/atlas_db?schema=public"
REDIS_URL="redis://localhost:6380"
JWT_SECRET="super_secret_dev_key_that_is_long_enough"
PORT=4000
SCHEDULER_INTERVAL_MS=5000
```

## Docker Setup (Recommended)

The easiest way to run the entire stack (PostgreSQL, Redis, Migrations, API, Scheduler, Worker) is using Docker Compose.

```bash
cd server
# Ensure no previous conflicting containers exist
docker compose down -v

# Build and start the stack in detached mode
docker compose up --build -d
```

The stack includes an `atlas-migrate` init container that automatically runs Prisma migrations before starting the application services.

## Local Development Setup

If you prefer to run the Node.js services directly on your host machine:

### 1. Start Infrastructure
```bash
cd server
# Start only Postgres and Redis
docker compose up -d postgres redis
```

### 2. Database Migrations
```bash
npm install
npx prisma generate
npx prisma migrate deploy
```

### 3. Start Services
Open three separate terminal tabs in the `server/` directory and run:

```bash
# Tab 1: Start the REST API
npm run dev:api

# Tab 2: Start the Scheduler
npm run dev:scheduler

# Tab 3: Start the Worker
npm run dev:worker
```

## Testing

Atlas features a comprehensive test suite (134+ tests).

**Run all tests (Unit, API, Integration, Concurrency):**
```bash
cd server
npm test
```

**Run specifically concurrency tests:**
```bash
cd server
npm run test:concurrency
```

## Example API Workflow

Here is a quick `curl` workflow to register, create a queue, and enqueue a job.

### 1. Register & Authenticate
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@atlas.com", "password": "password123", "orgName": "Atlas Corp"}'
```
*Extract the `token`, `user.id`, and `orgId` from the response.*

### 2. Create a Project
```bash
curl -X POST http://localhost:4000/api/v1/organizations/<ORG_ID>/projects \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Default Project"}'
```
*Extract the `projectId` from the response.*

### 3. Create a Queue
```bash
curl -X POST http://localhost:4000/api/v1/organizations/<ORG_ID>/projects/<PROJECT_ID>/queues \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Emails", "concurrencyLimit": 10, "retryStrategy": "exponential", "maxAttempts": 3}'
```
*Extract the `queueId` from the response.*

### 4. Enqueue a Job
```bash
curl -X POST http://localhost:4000/api/v1/queues/<QUEUE_ID>/jobs \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"type": "send-email", "payload": {"to": "user@test.com", "body": "Hello!"}}'
```

## Execution Guarantees & Failure Behavior

Atlas strictly defines the following guarantees:

1. **PostgreSQL is Authoritative**: Job claiming, concurrency, and state transitions happen atomically in PostgreSQL.
2. **Exactly-once PostgreSQL State Transition**: A job transitions from `QUEUED` to `RUNNING` exactly once per execution attempt, protected by `SKIP LOCKED` and strict state machine `WHERE` clauses.
3. **At-least-once Handler Invocation**: If a worker crashes *after* successfully executing a job handler but *before* committing the `COMPLETED` state to PostgreSQL, the scheduler's stale worker recovery will eventually transition the job back to `QUEUED`. The job will be delivered and executed again. Therefore, **job handlers must be idempotent**.
4. **Resilience to Desync**: If a job is committed as `QUEUED` in Postgres but fails to reach BullMQ (e.g., a Redis outage), a periodic `reconcile` loop will detect the drift and idempotently re-enqueue it.

## Documentation Reference

- **[Architecture Document](docs/architecture.md)**
- **[API Documentation](docs/api.md)**
- **[Design Decisions](docs/design-decisions.md)**
- **[Database & Schema](docs/database.md)**
- **[ER Diagram](docs/er-diagram.mmd)**
- **[Security](docs/security.md)**
- **[Testing Strategy](docs/testing.md)**
- **[Setup & Operations](docs/setup.md)**
- **[Submission Checklist](docs/submission-checklist.md)**

## Known Limitations

- **At-least-once Handlers**: Because network failures can occur between a worker completing a task and updating PostgreSQL, global exactly-once execution is not mathematically possible without distributed two-phase commits. Handlers must safely handle duplicate invocations.
- **Redis Requirement**: While PostgreSQL is authoritative, Redis is strictly required for the BullMQ pub/sub and low-latency task delivery mechanisms.
