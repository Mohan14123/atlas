# Atlas — Implementation Plan: 3-Day Server Build

## Background

Atlas is a production-grade distributed job scheduler. The server directory is currently a skeleton — empty controllers, routes, workers, and a blank Prisma schema. This plan covers building the entire `server/` to a submission-worthy state across 3 days using a **multi-container architecture**.

---

## Container Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       docker-compose.yml                        │
│                                                                 │
│  atlas-api           atlas-scheduler      atlas-worker × N      │
│  ────────────        ───────────────      ─────────────────     │
│  src/api/            src/scheduler/       src/worker/           │
│  :4000               (no port)            (no port)             │
│                                                                 │
│  atlas-frontend      postgres             redis                 │
│  ──────────────      ────────             ─────                 │
│  client/             :5432                :6379                 │
│  :3000               (infrastructure)     (infrastructure)      │
│                                                                 │
│  pgbouncer — optional (profiles: [pgbouncer])                   │
└─────────────────────────────────────────────────────────────────┘
```

All three server services share `src/shared/` — no code duplication across containers.

---

## Target Directory Structure

```
server/
├── prisma/
│   └── schema.prisma                    ← single schema for all services
├── src/
│   ├── shared/                          ← imported by api + scheduler + worker
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   ├── db.ts                    ← pg.Pool singleton
│   │   │   └── redis.ts                 ← ioredis singleton
│   │   ├── lib/
│   │   │   ├── errors.ts
│   │   │   ├── logger.ts
│   │   │   ├── response.ts
│   │   │   ├── stateMachine.ts          ← ALLOWED_TRANSITIONS + validateTransition()
│   │   │   └── cron.ts
│   │   └── db/
│   │       └── queries/
│   │           ├── jobs.ts              ← claimNextJob() FOR UPDATE SKIP LOCKED
│   │           ├── workers.ts
│   │           ├── schedules.ts
│   │           ├── dlq.ts
│   │           └── metrics.ts
│   ├── api/                             ← atlas-api container
│   │   ├── index.ts
│   │   ├── app.ts
│   │   ├── middlewares/
│   │   ├── controllers/
│   │   └── routes/
│   ├── scheduler/                       ← atlas-scheduler container
│   │   ├── index.ts
│   │   ├── scheduler.ts
│   │   ├── listen-notify.ts
│   │   └── jobs/
│   └── worker/                          ← atlas-worker container (scale × N)
│       ├── index.ts
│       ├── worker.ts
│       ├── heartbeat.ts
│       ├── shutdown.ts
│       ├── concurrency.ts
│       └── handlers/
│           ├── registry.ts
│           ├── noop.handler.ts
│           ├── webhook.handler.ts
│           ├── report.handler.ts
│           └── security-scan.handler.ts
├── Dockerfile.api
├── Dockerfile.scheduler
├── Dockerfile.worker
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

---

## 16-Phase Build Plan

### Day 1 — Shared Foundation + Full atlas-api (Phases 1–8)

---

#### Phase 1 — Shared Infrastructure & Database Layer
**Hours 0–2 | Container: `shared/`**

> Blocker for everything. Nothing else can start without this.

**1.1 — Shared Config & Lib**

| File | Purpose |
|---|---|
| `src/shared/config/env.ts` | Typed env loader — throws on missing vars |
| `src/shared/config/db.ts` | `pg.Pool` singleton |
| `src/shared/config/redis.ts` | `ioredis` singleton for BullMQ |
| `src/shared/lib/errors.ts` | `AppError(msg, code, httpStatus)`, `HttpStatus` enum |
| `src/shared/lib/logger.ts` | Structured logger: `{ level, service, message, ts }` |
| `src/shared/lib/response.ts` | `sendSuccess` / `sendError` / `sendPaginated` — canonical shapes |
| `src/shared/lib/stateMachine.ts` | `ALLOWED_TRANSITIONS` map + `validateTransition(from, to)` |

**1.2 — Prisma Schema**

All 13 models: `User`, `Organization`, `OrganizationMember`, `Project`, `Queue`, `RetryPolicy`, `JobSchedule`, `Job`, `JobExecution`, `JobLog`, `Worker`, `WorkerHeartbeat`, `DeadLetterQueue`

Critical indexes:
- Composite `(queue_id, status, available_at)` — job claim query
- Index `(worker_id, heartbeat_at)` — stale worker detection

> 🔴 **`npx prisma migrate dev --name init` must pass before any other phase starts.**

**1.3 — Raw SQL Queries**

| File | Key Functions |
|---|---|
| `shared/db/queries/jobs.ts` | `claimNextJob()` FOR UPDATE SKIP LOCKED, `transitionJobStatus()` |
| `shared/db/queries/workers.ts` | `registerWorker()`, `upsertHeartbeat()`, `findStaleWorkers()`, `markWorkerUnhealthy()` |
| `shared/db/queries/schedules.ts` | `findDueSchedules()`, `updateNextRunAt()` |
| `shared/db/queries/dlq.ts` | `moveToDLQ()`, `replayDLQEntry()` (transaction) |
| `shared/db/queries/metrics.ts` | `getJobCountsByStatus()`, `getQueueDepths()`, `getWorkerUtilization()` |

---

#### Phase 2 — Auth API
**Hours 2–3.5 | Container: `atlas-api`**

`POST /api/v1/auth/register` + `POST /api/v1/auth/login` → JWT returned.
All subsequent routes gated by `auth.ts` middleware.

Files: `app.ts`, `index.ts`, `middlewares/auth.ts`, `middlewares/validate.ts`, `middlewares/error.ts`, `controllers/auth.controller.ts`, `routes/auth.routes.ts`

---

#### Phase 3 — Organizations & Projects
**Hours 3.5–5 | Container: `atlas-api`**

5 endpoints: `GET/POST /organizations`, `GET/POST /organizations/:id/projects`, `GET /projects/:id`

Files: `controllers/orgs.controller.ts`, `routes/orgs.routes.ts`

---

#### Phase 4 — Queues API
**Hours 5–7 | Container: `atlas-api`**

7 endpoints including pause/resume and stats. Queue creation atomically creates RetryPolicy.

Files: `controllers/queues.controller.ts`, `routes/queues.routes.ts`

---

#### Phase 5 — Schedules API
**Hours 7–8 | Container: `atlas-api`**

5 endpoints. `next_run_at` computed via `cron-parser`. `NOTIFY schedule_changed` emitted on create/update.

Files: `shared/lib/cron.ts`, `controllers/schedules.controller.ts`, `routes/schedules.routes.ts`

---

#### Phase 6 — Jobs API
**Hours 9–11 | Container: `atlas-api`**

8 endpoints. Idempotency via `ON CONFLICT DO NOTHING`. BullMQ enqueue for immediate/delayed jobs.

Key logic:
- `createJob` — resolves status per `job_mode`: `immediate → QUEUED`, `delayed/scheduled → SCHEDULED`
- `createBatchJobs` — single pg transaction, all or nothing
- `retryJob` — only valid from `FAILED`; state machine enforced
- `cancelJob` — only valid from `SCHEDULED` or `QUEUED`

Files: `controllers/jobs.controller.ts`, `routes/jobs.routes.ts`

---

#### Phase 7 — DLQ API
**Hours 11–12 | Container: `atlas-api`**

3 endpoints. `replayDLQEntry` is a transaction: new Job created + DLQ row deleted atomically.

Files: `controllers/dlq.controller.ts`, `routes/dlq.routes.ts`

---

#### Phase 8 — Workers & Metrics API
**Hours 12–13 | Container: `atlas-api`**

`GET /workers`, `GET /workers/:id`, `GET /metrics`. All metrics derived from Postgres — no in-memory counters.

Files: `controllers/workers.controller.ts`, `controllers/metrics.controller.ts`, `routes/workers.routes.ts`, `routes/metrics.routes.ts`

---

### Day 2 — atlas-scheduler + atlas-worker + Reliability (Phases 9–11)

---

#### Phase 9 — atlas-scheduler Service
**Hours 13–16 | Container: `atlas-scheduler`**

Standalone process. Runs a tick loop every `SCHEDULER_INTERVAL_MS`. Six operations per tick:

| Operation | File | What it does |
|---|---|---|
| Create due jobs | `jobs/createDueJobs.ts` | Evaluates `next_run_at <= NOW()`, creates Job rows, enqueues |
| Promote delayed | `jobs/promoteDelayedJobs.ts` | `SCHEDULED` past `available_at` → `QUEUED`, enqueues |
| Retry failed | `jobs/retryFailedJobs.ts` | `FAILED` with attempts remaining → compute backoff delay → `SCHEDULED` |
| Detect stale workers | `jobs/detectStaleWorkers.ts` | Heartbeat threshold exceeded → `markWorkerUnhealthy()` |
| Recover orphaned jobs | `jobs/recoverOrphanedJobs.ts` | `CLAIMED/RUNNING` from dead workers → `QUEUED` |
| Reconcile | `jobs/reconcile.ts` | `QUEUED` jobs missing from BullMQ → re-enqueue |

LISTEN/NOTIFY: separate `pg.Client` (not pool) subscribes to `schedule_changed`, `queue_changed` → triggers immediate tick (debounced).

Graceful shutdown: set `running=false`, finish current tick, close pg + redis.

---

#### Phase 10 — atlas-worker Service
**Hours 16–19 | Container: `atlas-worker` × N**

BullMQ `Worker` consumer. Per-job execution flow:

```
BullMQ delivers job
  → claimNextJob() [FOR UPDATE SKIP LOCKED in pg transaction]
  → Create JobExecution row (status=RUNNING)
  → transition Job → RUNNING
  → resolve handler from HandlerRegistry
  → execute with timeout
  → Success: Job → COMPLETED, Execution → COMPLETED, write INFO log
  → Failure: if attempts remaining → Job → FAILED (scheduler reschedules)
             if exhausted → moveToDLQ()
```

Handlers: `noop`, `webhook`, `report`, `security-scan`

Heartbeat: `setInterval` every 10s, never crashes the process on DB error.

Graceful shutdown: stop consumer → wait in-flight (with timeout) → `markWorkerUnhealthy()` → close connections.

> 🔴 `shutdown.ts` must handle SIGTERM correctly — this is what makes the concurrency tests reliable.

---

#### Phase 11 — State Machine Enforcement
**Hours 19–20 | Container: `shared/`**

`ALLOWED_TRANSITIONS` map covers all valid moves. `transitionJobStatus()` calls `validateTransition()` before every `UPDATE`. Invalid transitions throw `AppError(INVALID_STATE_TRANSITION, 422)`.

Every transition writes a `JobLog` row. `NOTIFY job_updated` emitted after each (consumed by WebSocket layer in Phase 15).

---

### Day 3 — Docker, Observability, Tests, Bonus (Phases 12–16)

---

#### Phase 12 — Docker & Compose
**Hours 21–22 | 🐳 Infrastructure**

Three Dockerfiles (`Dockerfile.api`, `Dockerfile.scheduler`, `Dockerfile.worker`).

`docker-compose.yml` services:
- `postgres:16` with health check
- `redis:7-alpine` with health check
- `atlas-api` — depends_on (healthy) postgres + redis
- `atlas-scheduler` — depends_on (healthy) postgres + redis
- `atlas-worker` — same deps, `scale: 1` default (bump for concurrency tests)
- `atlas-frontend` — depends_on atlas-api

PgBouncer behind `profiles: [pgbouncer]` — opt-in only.

---

#### Phase 13 — Observability
**Hours 22–23 | All containers**

Structured logging with `service:` tag per process. HTTP request log middleware on api. Per-tick timing logs on scheduler. Per-job outcome log on worker.

`GET /metrics` derives all values from Postgres — survives restarts.

---

#### Phase 14 — Tests
**Hours 23–27 | `tests/`**

> 🔴 Required by rubric (15 marks). Must pass cleanly before submission.

| Test | File | Proves |
|---|---|---|
| Concurrency | `concurrency/claimPath.test.ts` | N workers, M jobs → each claimed exactly once |
| Auth | `integration/auth.test.ts` | JWT flow end to end |
| Job lifecycle | `integration/jobLifecycle.test.ts` | Full SCHEDULED → COMPLETED |
| Retry + DLQ | `integration/retryPolicy.test.ts` | Backoff + DLQ after exhaustion |
| Stale worker | `integration/staleWorker.test.ts` | Recovery after dead worker |
| Idempotency | `integration/idempotency.test.ts` | Same key twice → one job |
| Batch | `integration/batchJobs.test.ts` | Atomic create / rollback |
| DLQ replay | `integration/dlqReplay.test.ts` | Replay → new job, DLQ cleared |
| Pause/resume | `integration/pauseResume.test.ts` | Paused queue not dispatched |

Jest config: `ts-jest`, separate `TEST_DATABASE_URL`, `globalSetup` runs migrations, `afterEach` truncates tables.

---

#### Phase 15 — Bonus Features
**Hours 27–29 | Optional**

- **WebSocket** — Socket.io on api; emits `job:updated`, `worker:heartbeat`, `queue:stats`, `dlq:entry_added`, `scheduler:tick`
- **Rate limiting** — Redis-backed, per-user, 100 req/min middleware
- **AI DLQ summaries** — LLM call on DLQ entry fetch; appends `ai_summary` field

---

#### Phase 16 — Final Polish & Documentation
**Hours 29–30 | All**

- Audit all 33 endpoints against `detailed_api.md` response shapes
- Ensure `limit`/`offset`/`total` on all list endpoints
- Complete `docs/testing.md`, `docs/deployment.md`, `docs/state-machine.md`, `docs/sequence-diagrams.md`, `docs/failure-recovery.md`

---

## Dependency Map

```
Phase 1 (shared/ + DB) ─────────────────────────────────────────────────────────┐
  └─→ Phase 2 (auth) → Phase 3 (orgs) → Phase 4 (queues) → Phase 5 (schedules)  │
                                                └──────────→ Phase 6 (jobs)       │
                                                              └→ Phase 7 (dlq)    │
                                                              └→ Phase 8 (metrics)│
Phase 1 ─→ Phase 9 (atlas-scheduler)                                             │
Phase 1 ─→ Phase 10 (atlas-worker)                                               │
Phase 11 (state machine) ─→ enforced in shared/db — affects all phases           │
Phases 1-11 ─→ Phase 12 (Docker)                                                 │
Phases 1-12 ─→ Phase 13 (observability)                                          │
Phases 1-13 ─→ Phase 14 (tests) 🔴                                               │
Phase 14 ──→ Phase 15 (bonus, optional)                                           │
Phase 14 ──→ Phase 16 (final polish)                                              │
```

---

## Critical Path (5 hard blockers)

1. **Phase 1.2** — `npx prisma migrate dev` green
2. **Phase 1.3** — `claimNextJob()` with `FOR UPDATE SKIP LOCKED`
3. **Phase 11** — State machine wired before any service writes job status
4. **Phase 12** — Docker Compose for real multi-worker concurrency tests
5. **Phase 14** — Tests pass (15 rubric marks)

---

## Package Scripts

```json
{
  "dev:api":          "ts-node src/api/index.ts",
  "dev:scheduler":    "ts-node src/scheduler/index.ts",
  "dev:worker":       "ts-node src/worker/index.ts",
  "migrate":          "prisma migrate dev",
  "generate":         "prisma generate",
  "test":             "jest --runInBand",
  "test:concurrency": "jest tests/concurrency --runInBand"
}
```

---

## Frontend Contract Checkpoints

| Frontend Feature | Backend Phase |
|---|---|
| Login / Register | 2 |
| Org / Project pages | 3 |
| Queue management | 4 |
| Schedule management | 5 |
| Job submission + detail + logs | 6 |
| DLQ inspector | 7 |
| Worker status + metrics | 8 |
| Full local stack (`docker-compose up`) | 12 |
| Live WebSocket updates | 15 (bonus) |

---

## Tracking Files

- **Phase tracker:** [`docs/user/phases.md`](file:///home/mohan/Documents/Codity/docs/user/phases.md) — per-file task checklists
- **API contract:** [`docs/user/detailed_api.md`](file:///home/mohan/Documents/Codity/docs/user/detailed_api.md) — full request/response schemas for all 33 endpoints
- **Progress:** [`progress.json`](file:///home/mohan/Documents/Codity/progress.json)
- **Work log:** [`completed.md`](file:///home/mohan/Documents/Codity/completed.md)
