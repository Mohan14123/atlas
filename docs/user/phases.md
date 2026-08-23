# Atlas — 3-Day Server Build Plan (Multi-Container Architecture)

> **Authoritative phase tracker for parallel frontend/backend development.**
> Update the checkbox state as work completes. Never rewrite history — only check boxes and add notes.

---

## Container Map

```
┌─────────────────────────────────────────────────────────────┐
│                     docker-compose.yml                       │
│                                                             │
│  atlas-api          atlas-scheduler     atlas-worker × N    │
│  ──────────         ───────────────     ─────────────────   │
│  src/api/           src/scheduler/      src/worker/         │
│  :4000              (no port)           (no port)           │
│                                                             │
│  atlas-frontend     postgres            redis               │
│  ──────────────     ────────            ─────               │
│  client/            :5432               :6379               │
│  :3000              (infrastructure)    (infrastructure)    │
│                                                             │
│  pgbouncer — optional, add when testing N workers           │
└─────────────────────────────────────────────────────────────┘
```

All three server services (`api`, `scheduler`, `worker`) live inside the `server/` monorepo and share:
- `src/shared/` — db pool, redis client, lib utilities, raw SQL queries, types
- `prisma/` — single schema + migrations (only `atlas-api` runs migrations)
- `package.json` — single dep tree, separate `ts-node` entry points per service

---

## Server Directory Structure (Target)

```
server/
├── prisma/
│   └── schema.prisma                   ← single source of schema truth
│
├── src/
│   ├── shared/                         ← imported by ALL three services
│   │   ├── config/
│   │   │   ├── env.ts                  ← validated env loader
│   │   │   ├── db.ts                   ← pg.Pool singleton
│   │   │   └── redis.ts                ← ioredis singleton
│   │   ├── lib/
│   │   │   ├── errors.ts               ← AppError, HttpStatus
│   │   │   ├── logger.ts               ← structured logger
│   │   │   ├── response.ts             ← sendSuccess/sendError/sendPaginated
│   │   │   ├── stateMachine.ts         ← job state transition validator
│   │   │   └── cron.ts                 ← next_run_at calculator
│   │   └── db/
│   │       └── queries/
│   │           ├── jobs.ts             ← claimNextJob() FOR UPDATE SKIP LOCKED
│   │           ├── workers.ts          ← upsertHeartbeat(), findStaleWorkers()
│   │           ├── schedules.ts        ← findDueSchedules(), updateNextRunAt()
│   │           ├── dlq.ts              ← moveToDLQ(), replayDLQEntry()
│   │           └── metrics.ts          ← aggregate stats queries
│   │
│   ├── api/                            ← atlas-api container
│   │   ├── index.ts                    ← entry point (ts-node src/api/index.ts)
│   │   ├── app.ts                      ← Express app factory
│   │   ├── middlewares/
│   │   │   ├── auth.ts
│   │   │   ├── validate.ts
│   │   │   └── error.ts
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── orgs.controller.ts
│   │   │   ├── queues.controller.ts
│   │   │   ├── schedules.controller.ts
│   │   │   ├── jobs.controller.ts
│   │   │   ├── dlq.controller.ts
│   │   │   ├── workers.controller.ts
│   │   │   └── metrics.controller.ts
│   │   └── routes/
│   │       ├── index.ts                ← mounts all routers under /api/v1
│   │       ├── auth.routes.ts
│   │       ├── orgs.routes.ts
│   │       ├── queues.routes.ts
│   │       ├── schedules.routes.ts
│   │       ├── jobs.routes.ts
│   │       ├── dlq.routes.ts
│   │       ├── workers.routes.ts
│   │       └── metrics.routes.ts
│   │
│   ├── scheduler/                      ← atlas-scheduler container
│   │   ├── index.ts                    ← entry point (ts-node src/scheduler/index.ts)
│   │   ├── scheduler.ts                ← main tick loop
│   │   ├── listen-notify.ts            ← Postgres LISTEN/NOTIFY client
│   │   └── jobs/
│   │       ├── createDueJobs.ts
│   │       ├── promoteDelayedJobs.ts
│   │       ├── retryFailedJobs.ts
│   │       ├── detectStaleWorkers.ts
│   │       ├── recoverOrphanedJobs.ts
│   │       └── reconcile.ts
│   │
│   └── worker/                         ← atlas-worker container (× N instances)
│       ├── index.ts                    ← entry point (ts-node src/worker/index.ts)
│       ├── worker.ts                   ← BullMQ consumer + claim/execute loop
│       ├── heartbeat.ts                ← periodic upsertHeartbeat()
│       ├── shutdown.ts                 ← SIGTERM/SIGINT graceful drain
│       ├── concurrency.ts              ← semaphore for concurrent slots
│       └── handlers/
│           ├── registry.ts             ← HandlerRegistry map
│           ├── noop.handler.ts
│           ├── webhook.handler.ts
│           ├── report.handler.ts
│           └── security-scan.handler.ts
│
├── Dockerfile.api
├── Dockerfile.scheduler
├── Dockerfile.worker
├── docker-compose.yml
├── package.json
└── tsconfig.json
```

---

## Legend

| Symbol | Meaning |
|--------|---------|
| `[ ]` | Not started |
| `[/]` | In progress |
| `[x]` | Complete |
| 🔴 | Blocker — must finish before next phase |
| 🟡 | Frontend-contract locked — frontend can integrate against this |
| 🐳 | Container / infra concern |

---

## Day 1 — Shared Foundation & atlas-api (Hours 0–8)

> Goal: `shared/` layer built. Prisma schema migrated. All REST endpoints return correct shaped responses. auth works. Frontend can start against real URLs.

---

### Phase 1 — Shared Infrastructure & Database Layer (Hours 0–2)

**Container:** `shared/` — consumed by api, scheduler, worker
**Deliverable:** `pg.Pool` live, schema migrated, all raw SQL helpers written.

#### 1.1 — Shared Config & Lib
- [ ] `src/shared/config/env.ts` — typed env loader; throws on missing vars (DATABASE_URL, REDIS_URL, JWT_SECRET, PORT, WORKER_CONCURRENCY, SCHEDULER_INTERVAL_MS)
- [ ] `src/shared/config/db.ts` — `pg.Pool` singleton; pool size driven by env
- [ ] `src/shared/config/redis.ts` — `ioredis` singleton for BullMQ
- [ ] `src/shared/lib/errors.ts` — `AppError(message, code, httpStatus)`, `HttpStatus` enum 🟡
- [ ] `src/shared/lib/logger.ts` — structured logger: `{ level, service, message, ts }` — `service` injected per-container
- [ ] `src/shared/lib/response.ts` — `sendSuccess`, `sendError`, `sendPaginated` — canonical shapes 🟡
- [ ] `src/shared/lib/stateMachine.ts` — `ALLOWED_TRANSITIONS` map + `validateTransition(from, to)` throws `AppError` on invalid 🔴

#### 1.2 — Prisma Schema (Full)
- [ ] All 13 models in `prisma/schema.prisma`:
  - `User`, `Organization`, `OrganizationMember`
  - `Project`, `Queue`, `RetryPolicy`
  - `JobSchedule`, `Job`, `JobExecution`
  - `JobLog`, `Worker`, `WorkerHeartbeat`, `DeadLetterQueue`
- [ ] All FK relations, `@unique`, `@index` directives
- [ ] Composite index `(queue_id, status, available_at)` — job claim query
- [ ] Index `(worker_id, heartbeat_at)` — stale worker detection
- [ ] `npx prisma migrate dev --name init` passes cleanly 🔴

#### 1.3 — Shared Raw SQL Queries
- [ ] `src/shared/db/queries/jobs.ts`
  - `claimNextJob(queueId, workerId)` — `SELECT ... FOR UPDATE SKIP LOCKED` in transaction 🔴
  - `transitionJobStatus(jobId, from, to, patch?)` — validates via stateMachine before UPDATE
- [ ] `src/shared/db/queries/workers.ts`
  - `registerWorker(hostname, concurrency)` → returns workerId
  - `upsertHeartbeat(workerId, activeJobs)`
  - `findStaleWorkers(thresholdMs)` — returns workers with stale heartbeats
  - `markWorkerUnhealthy(workerId)`
- [ ] `src/shared/db/queries/schedules.ts`
  - `findDueSchedules()` — enabled schedules with `next_run_at <= NOW()`
  - `updateNextRunAt(scheduleId, nextAt, lastAt)`
- [ ] `src/shared/db/queries/dlq.ts`
  - `moveToDLQ(jobId, reason, errorMessage, attempts)`
  - `replayDLQEntry(entryId)` — creates new Job from original payload, deletes DLQ entry (transaction)
- [ ] `src/shared/db/queries/metrics.ts`
  - `getJobCountsByStatus(window)` — aggregate counts per status
  - `getQueueDepths()` — per-queue queued count
  - `getWorkerUtilization()` — active_jobs / concurrency per worker

---

### Phase 2 — atlas-api Bootstrap & Auth (Hours 2–3.5)

**Container:** `atlas-api`
**Deliverable:** `POST /auth/register` and `POST /auth/login` return JWT. All subsequent routes gated. 🟡

- [ ] `src/api/app.ts` — Express app factory: CORS, JSON body parser, mount routers, attach error handler
- [ ] `src/api/index.ts` — start server, connect pg pool, handle SIGTERM gracefully
- [ ] `src/api/middlewares/auth.ts` — JWT verify middleware, attaches `req.user = { id, email }`
- [ ] `src/api/middlewares/validate.ts` — `validate(schema)` middleware using Zod, returns 400 with field detail on failure
- [ ] `src/api/middlewares/error.ts` — global Express error handler, maps `AppError` → structured response
- [ ] `src/api/controllers/auth.controller.ts`
  - `register` — hash with bcrypt, insert User + OrganizationMember (new org created), sign JWT
  - `login` — verify bcrypt hash, sign JWT
- [ ] `src/api/routes/auth.routes.ts` — `POST /auth/register`, `POST /auth/login`
- [ ] `src/api/routes/index.ts` — mounts all routers under `/api/v1`, injects auth middleware globally (except auth routes)
- [ ] Zod schemas: `RegisterSchema`, `LoginSchema`

---

### Phase 3 — Organizations & Projects (Hours 3.5–5)

**Container:** `atlas-api`
**Deliverable:** Org/Project CRUD live. 🟡

- [ ] `src/api/controllers/orgs.controller.ts`
  - `listOrganizations` — orgs where `req.user` is a member
  - `createOrganization` — creates Org + inserts creator as `admin` member
  - `listProjects` — projects in org (auth: must be member)
  - `createProject` — creates Project (auth: admin/operator)
  - `getProject` — single project (auth: member)
- [ ] `src/api/routes/orgs.routes.ts`
- [ ] Zod: `CreateOrgSchema`, `CreateProjectSchema`
- [ ] Authorization helper: `assertOrgMember(userId, orgId, minRole?)`

---

### Phase 4 — Queues API (Hours 5–7)

**Container:** `atlas-api`
**Deliverable:** Queue CRUD, pause/resume, stats. 🟡

- [ ] `src/api/controllers/queues.controller.ts`
  - `listQueues` — paginated, includes retry_policy join
  - `createQueue` — creates Queue + RetryPolicy in transaction
  - `getQueue` — with retry_policy
  - `updateQueue` — partial PATCH (queue fields + optional retry_policy update)
  - `pauseQueue` — `SET is_paused = true`, NOTIFY `queue_changed`
  - `resumeQueue` — `SET is_paused = false`, NOTIFY `queue_changed`
  - `getQueueStats` — counts per status + worker utilization for this queue 🟡
- [ ] `src/api/routes/queues.routes.ts`
- [ ] Zod: `CreateQueueSchema` (with nested `retry_policy`), `UpdateQueueSchema`

---

### Phase 5 — Schedules API (Hours 7–8)

**Container:** `atlas-api`
**Deliverable:** Cron/one-time schedule CRUD. `next_run_at` correct. `NOTIFY schedule_changed` emitted. 🟡

- [x] `src/shared/lib/cron.ts` — `getNextRunAt(expr, tz): Date` using `cron-parser`; throws on invalid expr
- [x] `src/api/controllers/schedules.controller.ts`
  - `createSchedule` — validates cron, sets `next_run_at`, emits `NOTIFY schedule_changed`
  - `listSchedules` — paginated, filterable by `enabled`
  - `getSchedule` — with 5 most recent generated jobs
  - `updateSchedule` — recomputes `next_run_at` on cron change
  - `deleteSchedule` — hard delete (generated jobs remain)
- [ ] `src/api/routes/schedules.routes.ts`
- [ ] Zod: `CreateScheduleSchema`, `UpdateScheduleSchema`

---

## Day 2 — Jobs API, atlas-scheduler, atlas-worker, Reliability (Hours 9–20)

> Goal: Full job lifecycle functional. Scheduler fires cron jobs. Workers claim and execute. Heartbeats and stale-worker recovery work.

---

### Phase 6 — Jobs API (Hours 9–11)

**Container:** `atlas-api`
**Deliverable:** All 8 job endpoints live. Idempotency enforced. BullMQ dispatch working. 🟡

- [ ] `src/api/controllers/jobs.controller.ts`
  - `createJob` — validates queue not paused, resolves `status` per `job_mode` (immediate=QUEUED, delayed/scheduled=SCHEDULED), checks idempotency key (`ON CONFLICT DO NOTHING`), enqueues to BullMQ for immediate/delayed
  - `createBatchJobs` — wraps all inserts in one pg transaction, all or nothing
  - `listJobs` — paginated, filterable by `status`, `type`; excludes `payload` from list view
  - `getJob` — full detail including `payload`
  - `getJobExecutions` — ordered by `attempt_number` ASC; includes `duration_ms`
  - `getJobLogs` — paginated, filterable by `execution_id`, `level`
  - `retryJob` — only if `status = FAILED`; resets `attempt_count`, transitions → QUEUED via state machine, re-enqueues
  - `cancelJob` — only if `status IN (SCHEDULED, QUEUED)`; transitions → CANCELLED via state machine
- [ ] `src/api/routes/jobs.routes.ts`
- [ ] Zod: `CreateJobSchema` (with `job_mode` discriminated union), `BatchJobSchema`

---

### Phase 7 — DLQ API (Hours 11–12)

**Container:** `atlas-api`
**Deliverable:** DLQ list, detail, and replay. 🟡

- [ ] `src/api/controllers/dlq.controller.ts`
  - `listDLQ` — paginated; joined with Job (type, queue_id, payload preview); filterable by `queue_id`
  - `getDLQEntry` — full job + all executions + all logs
  - `replayDLQEntry` — calls `replayDLQEntry()` from shared queries (transaction: new Job created, DLQ row deleted); returns new job ID
- [ ] `src/api/routes/dlq.routes.ts`

---

### Phase 8 — Workers & Metrics API (Hours 12–13)

**Container:** `atlas-api`
**Deliverable:** Worker list/detail and system metrics. 🟡

- [ ] `src/api/controllers/workers.controller.ts`
  - `listWorkers` — filterable by `status`; includes `active_jobs`, `last_heartbeat_at`
  - `getWorker` — with current job assignments (JOIN JobExecutions WHERE status=RUNNING) + last 10 heartbeats
- [ ] `src/api/controllers/metrics.controller.ts`
  - `getMetrics` — calls `getJobCountsByStatus`, `getQueueDepths`, `getWorkerUtilization` from shared queries; accepts `?window=1h|24h|7d`
- [ ] `src/api/routes/workers.routes.ts`
- [ ] `src/api/routes/metrics.routes.ts`

---

### Phase 9 — atlas-scheduler Service (Hours 13–16)

**Container:** `atlas-scheduler` (own process, own Docker image)
**Deliverable:** Scheduler ticks on interval, handles all 6 control-plane operations, responds to LISTEN/NOTIFY, gracefully shuts down.

- [ ] `src/scheduler/index.ts` — entry point: connect pg pool, connect redis, start scheduler loop, register SIGTERM handler
- [ ] `src/scheduler/scheduler.ts` — `SchedulerLoop` class: runs all job functions in sequence each tick; catches errors per-function so one failure doesn't abort the tick; logs timing per operation
- [ ] `src/scheduler/listen-notify.ts` — separate `pg.Client` (not pool) for LISTEN; subscribes to `schedule_changed`, `queue_changed`; on notify → triggers immediate tick (debounced)
- [ ] `src/scheduler/jobs/createDueJobs.ts`
  - calls `findDueSchedules()`
  - for each: create Job row (status=QUEUED or SCHEDULED per schedule type), update `next_run_at` + `last_run_at`
  - enqueue to BullMQ immediately for QUEUED jobs
- [ ] `src/scheduler/jobs/promoteDelayedJobs.ts`
  - find Jobs where `status=SCHEDULED` AND `available_at <= NOW()`
  - transition → QUEUED via `transitionJobStatus()`
  - enqueue to BullMQ
- [ ] `src/scheduler/jobs/retryFailedJobs.ts`
  - find Jobs where `status=FAILED` AND `attempt_count < max_attempts`
  - compute next retry delay via RetryPolicy (fixed/linear/exponential + jitter)
  - set `available_at = NOW() + delay`, transition → SCHEDULED
- [ ] `src/scheduler/jobs/detectStaleWorkers.ts`
  - calls `findStaleWorkers(threshold=30s)`
  - calls `markWorkerUnhealthy(workerId)` for each
- [ ] `src/scheduler/jobs/recoverOrphanedJobs.ts`
  - find Jobs WHERE `status IN (CLAIMED, RUNNING)` AND `worker_id IN (unhealthy workers)`
  - transition → QUEUED, clear `worker_id`, `claimed_at`
  - re-enqueue to BullMQ
- [ ] `src/scheduler/jobs/reconcile.ts`
  - find Jobs WHERE `status=QUEUED` older than 60s
  - for each: check BullMQ job existence; if missing → re-enqueue
- [ ] Graceful shutdown: set `running=false`, finish current tick, close pg clients + redis 🔴

---

### Phase 10 — atlas-worker Service (Hours 16–19)

**Container:** `atlas-worker` (one image, scale × N with docker-compose `--scale`)
**Deliverable:** Worker registers, consumes from BullMQ, atomically claims in Postgres, executes handlers concurrently, sends heartbeats, gracefully shuts down.

- [ ] `src/worker/index.ts` — entry point: register worker in DB (get workerId), start heartbeat, start BullMQ consumer, register SIGTERM
- [ ] `src/worker/worker.ts` — BullMQ `Worker` consumer:
  1. `claimNextJob(queueId, workerId)` — FOR UPDATE SKIP LOCKED
  2. Create `JobExecution` row (status=RUNNING), transition Job → RUNNING
  3. Resolve handler from registry
  4. Execute with timeout (configurable per handler)
  5. **Success path:** transition Job → COMPLETED, update Execution, write INFO log
  6. **Failure path:** if `attempt_count < max_attempts` → transition Job → FAILED (scheduler retries); if exhausted → `moveToDLQ()`
- [ ] `src/worker/handlers/registry.ts` — `HandlerRegistry`: `Map<string, HandlerFn>`; `resolve(type)` throws if unknown
- [ ] `src/worker/handlers/noop.handler.ts` — sleeps 100ms, returns `{ ok: true }` (testing/demo)
- [ ] `src/worker/handlers/webhook.handler.ts` — HTTP POST to `payload.url` with `payload.body`; respects `payload.timeout_ms`
- [ ] `src/worker/handlers/report.handler.ts` — stub: logs report ID, waits 500ms, returns `{ report: "generated" }`
- [ ] `src/worker/handlers/security-scan.handler.ts` — stub: logs repo + branch, waits 1s, returns `{ vulnerabilities: 0 }`
- [ ] `src/worker/heartbeat.ts` — `setInterval` every 10s: calls `upsertHeartbeat(workerId, activeJobs)`, handles DB errors without crashing
- [ ] `src/worker/concurrency.ts` — `Semaphore(n)` class: `acquire()` / `release()` — limits concurrent handler executions to `WORKER_CONCURRENCY`
- [ ] `src/worker/shutdown.ts` — SIGTERM/SIGINT: stop BullMQ consumer (no new jobs), wait for active jobs to finish (with timeout), call `markWorkerUnhealthy()`, close pg + redis 🔴

---

### Phase 11 — State Machine Enforcement + NOTIFY Wiring (Hours 19–20)

**Shared lib concern — affects all three services.**
**Deliverable:** No invalid transitions can be persisted; NOTIFY emitted on key transitions.

- [ ] `src/shared/lib/stateMachine.ts` (from Phase 1.1) — verify it covers:
  - `SCHEDULED → QUEUED` (scheduler/api)
  - `QUEUED → CLAIMED` (worker)
  - `CLAIMED → RUNNING` (worker)
  - `RUNNING → COMPLETED` (worker)
  - `RUNNING → FAILED` (worker)
  - `FAILED → QUEUED` (scheduler retry) or `FAILED → DLQ`
  - `QUEUED → CANCELLED` (api cancel)
  - All others: throw `INVALID_STATE_TRANSITION`
- [ ] `transitionJobStatus()` in `shared/db/queries/jobs.ts` calls `validateTransition()` before every UPDATE
- [ ] `JobLog` row written on every transition: `{ job_id, execution_id?, level: 'INFO', message: 'status: X → Y' }`
- [ ] `NOTIFY job_updated` emitted via pg after every transition (picked up by WebSocket layer in bonus)

---

## Day 3 — Docker, Testing, Observability, Bonus (Hours 21–30)

---

### Phase 12 — Docker & Compose Setup (Hours 21–22) 🐳

**Deliverable:** `docker-compose up` starts all services. Env vars flow through `.env`. Three separate Dockerfiles.

- [ ] `server/Dockerfile.api`
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --omit=dev
  COPY . .
  RUN npx prisma generate
  CMD ["node", "-r", "ts-node/register", "src/api/index.ts"]
  ```
- [ ] `server/Dockerfile.scheduler`
  ```
  CMD ["node", "-r", "ts-node/register", "src/scheduler/index.ts"]
  ```
- [ ] `server/Dockerfile.worker`
  ```
  CMD ["node", "-r", "ts-node/register", "src/worker/index.ts"]
  ```
- [ ] `docker-compose.yml` — services:
  - `postgres` — image `postgres:16`, volume for data, `POSTGRES_DB/USER/PASSWORD`
  - `redis` — image `redis:7-alpine`
  - `atlas-api` — build `Dockerfile.api`, depends_on: postgres + redis, exposes `:4000`
  - `atlas-scheduler` — build `Dockerfile.scheduler`, depends_on: postgres + redis
  - `atlas-worker` — build `Dockerfile.worker`, depends_on: postgres + redis; `scale: 1` (bump to 3+ for concurrency tests)
  - `atlas-frontend` — build `client/Dockerfile`, depends_on: atlas-api, exposes `:3000`
- [ ] `server/.env.example` — all required vars documented
- [ ] PgBouncer left as `profiles: [pgbouncer]` — opt-in only when testing heavy concurrency 🐳
- [ ] Health checks on postgres + redis before api/scheduler/worker start (`depends_on: condition: service_healthy`)

---

### Phase 13 — Observability & Structured Logging (Hours 22–23)

- [ ] All three services use `src/shared/lib/logger.ts` with `service: 'api' | 'scheduler' | 'worker'`
- [ ] `atlas-api`: HTTP request log (method, path, status, duration_ms) via middleware
- [ ] `atlas-scheduler`: per-tick log with operation name + count of affected rows + duration_ms
- [ ] `atlas-worker`: per-job log with job_id, handler type, duration_ms, outcome
- [ ] Execution duration recorded: `completed_at - started_at` stored in `JobExecution`
- [ ] `GET /metrics` derives all values from Postgres — no in-memory counters that die on restart

---

### Phase 14 — Concurrency & Integration Tests (Hours 23–27)

> **Required by rubric (15 marks). Must pass cleanly.** 🔴

- [ ] `tests/concurrency/claimPath.test.ts`
  - Spin up N concurrent workers (real DB, real concurrency)
  - Submit M jobs to a queue
  - Assert each job claimed exactly once (check `worker_id` uniqueness + `attempt_count = 1` per job)
  - Assert total executions = M
- [ ] `tests/integration/auth.test.ts` — register → login → JWT → protected route returns 200; no-JWT returns 401
- [ ] `tests/integration/jobLifecycle.test.ts` — full: create queue → submit job → scheduler promotes → worker claims → COMPLETED; check all transition logs exist
- [ ] `tests/integration/retryPolicy.test.ts` — failing handler → exponential backoff delays → DLQ after max_attempts; check DLQ row exists
- [ ] `tests/integration/staleWorker.test.ts` — register worker → stop heartbeat → fast-forward threshold → scheduler detects stale → orphaned jobs returned to QUEUED
- [ ] `tests/integration/idempotency.test.ts` — submit same idempotency_key twice → exactly one Job row; second call returns 200 (not 500)
- [ ] `tests/integration/batchJobs.test.ts` — batch submit N jobs → N rows in DB; if one payload invalid → 0 rows (rollback)
- [ ] `tests/integration/dlqReplay.test.ts` — DLQ entry → replay → new Job row created; DLQ row deleted
- [ ] `tests/integration/pauseResume.test.ts` — pause queue → submit job → confirm NOT dispatched to BullMQ; resume → confirm dispatched
- [ ] Jest config: `ts-jest`, separate test DB (env `TEST_DATABASE_URL`), `globalSetup` runs migrations, `afterEach` truncates tables

---

### Phase 15 — Bonus Features (Hours 27–29)

- [ ] **WebSocket live updates (Socket.io)**
  - `src/api/lib/socket.ts` — Socket.io server attached to Express HTTP server
  - Emits: `job:updated`, `worker:heartbeat`, `queue:stats`, `dlq:entry_added`, `scheduler:tick`
  - Worker calls API WebSocket emit after each state transition (via shared event bus or direct socket.io client)
- [ ] **Rate limiting** — `src/api/middlewares/rateLimit.ts` — Redis-backed, per-user, 100 req/min
- [ ] **AI DLQ summaries** — `src/shared/lib/ai.ts` — Gemini/OpenAI call on DLQ entry fetch; appends `ai_summary` field

---

### Phase 16 — Final Hardening & Documentation (Hours 29–30)

- [ ] All API endpoints return consistent shapes (audit: run through `detailed_api.md` checklist)
- [ ] All list endpoints support `limit` + `offset` + return `meta.total`
- [ ] Zod validation errors surface field names in `details[]`
- [ ] `server/README.md` — local dev setup, env vars table, `npm run dev:api / dev:scheduler / dev:worker`, `docker-compose up`
- [ ] `docs/testing.md` — test suite overview, how to run, what each test proves
- [ ] `docs/deployment.md` — docker-compose reference, env var table, PgBouncer opt-in instructions
- [ ] `docs/state-machine.md` — final transition map matching `ALLOWED_TRANSITIONS` in code
- [ ] `docs/sequence-diagrams.md` — job create → scheduler tick → worker claim → complete flow
- [ ] `docs/failure-recovery.md` — stale worker recovery, Redis loss, missed NOTIFY, DLQ replay

---

## Dependency Map

```
Phase 1 (shared/ + DB) ─────────────────────────────────────────────────────────────────┐
  └─→ Phase 2 (api: auth) ─→ Phase 3 (api: orgs) ─→ Phase 4 (api: queues)              │
                                                           └─→ Phase 5 (api: schedules)  │
                                                           └─→ Phase 6 (api: jobs)       │
                                                                └─→ Phase 7 (api: dlq)   │
                                                                └─→ Phase 8 (api: metrics/workers)
Phase 1 (shared/ + DB) ─→ Phase 9 (atlas-scheduler)
Phase 1 (shared/ + DB) ─→ Phase 10 (atlas-worker)
Phase 11 (state machine) ─→ all phases (enforced in shared/db/queries/jobs.ts)
Phases 1-11 ─────────────→ Phase 12 (docker-compose) 🐳
Phases 1-12 ─────────────→ Phase 13 (observability)
Phases 1-13 ─────────────→ Phase 14 (tests) 🔴 must pass
Phase 14 ────────────────→ Phase 15 (bonus, optional)
Phase 14 ────────────────→ Phase 16 (final polish)
```

---

## Critical Path

1. **Phase 1.2** — Prisma schema migrated (`npx prisma migrate dev` green) 🔴
2. **Phase 1.3** — `claimNextJob()` with `FOR UPDATE SKIP LOCKED` 🔴
3. **Phase 11** — State machine in shared — must be wired before any service writes job state 🔴
4. **Phase 12** — Docker Compose — needed for true multi-worker concurrency test 🔴
5. **Phase 14** — Concurrency tests — rubric requirement 🔴

---

## Package Scripts (to add to `server/package.json`)

```json
{
  "scripts": {
    "dev:api":       "ts-node src/api/index.ts",
    "dev:scheduler": "ts-node src/scheduler/index.ts",
    "dev:worker":    "ts-node src/worker/index.ts",
    "migrate":       "prisma migrate dev",
    "generate":      "prisma generate",
    "test":          "jest --runInBand",
    "test:concurrency": "jest tests/concurrency --runInBand"
  }
}
```

---

## Frontend Contract Checkpoints

| Frontend Feature | Backend Ready After Phase |
|---|---|
| Login / Register | 2 |
| Org / Project pages | 3 |
| Queue management | 4 |
| Schedule management | 5 |
| Job submission + detail | 6 |
| DLQ inspector | 7 |
| Worker status + metrics dashboard | 8 |
| Full local stack (docker-compose up) | 12 |
| Live dashboard updates | 15 (bonus) |

---

## Progress Summary

| Phase | Container | Status |
|---|---|---|
| Phase 1 — Shared Foundation & DB | `shared/` | [ ] |
| Phase 2 — Auth API | `atlas-api` | [ ] |
| Phase 3 — Orgs & Projects | `atlas-api` | [ ] |
| Phase 4 — Queues | `atlas-api` | [ ] |
| Phase 5 — Schedules | `atlas-api` | [x] |
| Phase 6 — Jobs | `atlas-api` | [ ] |
| Phase 7 — DLQ | `atlas-api` | [ ] |
| Phase 8 — Workers & Metrics | `atlas-api` | [ ] |
| Phase 9 — Scheduler Engine | `atlas-scheduler` | [ ] |
| Phase 10 — Worker Engine | `atlas-worker` | [ ] |
| Phase 11 — State Machine Enforcement | `shared/` | [ ] |
| Phase 12 — Docker & Compose | 🐳 infra | [ ] |
| Phase 13 — Observability | all | [ ] |
| Phase 14 — Tests | `tests/` | [ ] |
| Phase 15 — Bonus Features | `atlas-api` | [ ] |
| Phase 16 — Final Polish & Docs | all | [ ] |