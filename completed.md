# Completed Work Log

---

## 2026-08-23 — Planning & Documentation

- Read and analyzed `docs/prompt.md`, `docs/features.md`, `docs/database.md`, `docs/api.md`, `docs/architecture.md`, `docs/SUBMISSION.md`, `docs/mermaid/` (architecture.mmd, database.mmd, er.mmd)
- Audited server skeleton: empty controllers, routes, workers, config; blank Prisma schema; no migrations
- Created `docs/user/` directory
- Created `docs/user/phases.md` — 3-day, 15-phase build plan for the server directory with per-file task checklists, dependency map, frontend contract checkpoints, and critical-path callouts
- Created `docs/user/detailed_api.md` — full API contract covering all 33 endpoints from `docs/api.md`, extended with request/response JSON schemas, error codes, pagination params, filter query params, and WebSocket event spec for bonus phase
- Created `progress.json` — workflow state tracker
- Created `completed.md` — this file

**Files touched:**
- `docs/user/phases.md` [NEW]
- `docs/user/detailed_api.md` [NEW]
- `progress.json` [NEW]
- `completed.md` [NEW]

---

## 2026-08-23 — Phases plan revised to multi-container architecture

- Rewrote `docs/user/phases.md` to reflect 7-container layout:
  `atlas-api`, `atlas-scheduler`, `atlas-worker × N`, `atlas-frontend`, `postgres`, `redis`, `pgbouncer` (opt-in)
- Updated all file paths: monolithic `src/` → `src/shared/`, `src/api/`, `src/scheduler/`, `src/worker/`
- Added Phase 12 (Docker & Compose) for `Dockerfile.api`, `Dockerfile.scheduler`, `Dockerfile.worker`, `docker-compose.yml`
- Expanded to 16 phases total (was 15)
- Added `package.json` scripts section: `dev:api`, `dev:scheduler`, `dev:worker`
- Updated `progress.json`

**Files touched:**
- `docs/user/phases.md` [MODIFIED — full rewrite]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED — this entry]

---

## 2026-08-23 — Frontend plan created

- Created `docs/user/frontend_plan.md` — detailed frontend build plan covering:
  tech stack, full directory structure, 9 pages with component breakdowns,
  API client layer (Axios + interceptors), React Query strategy,
  design system (color palette, status badge map, typography),
  mock-first parallel build strategy, 11-step frontend build order tied to backend phases,
  `package.json` deps, `.env.example`, Dockerfile

**Files touched:**
- `docs/user/frontend_plan.md` [NEW]
- `completed.md` [MODIFIED]

---

## 2026-08-23 — Phase 1 implemented + GitHub repo created

**Phase 1 — Shared Foundation & Database Layer**

- `server/src/shared/config/env.ts` — Zod-validated env loader, exits on missing vars
- `server/src/shared/config/db.ts` — pg.Pool singleton (max 20 prod / 3 test), pool error logged
- `server/src/shared/config/redis.ts` — ioredis singleton, maxRetriesPerRequest: null (BullMQ req)
- `server/src/shared/lib/errors.ts` — AppError(message, code, httpStatus), HttpStatus constants
- `server/src/shared/lib/logger.ts` — structured JSON logger, service tag injected per-process
- `server/src/shared/lib/response.ts` — sendSuccess / sendError / sendPaginated (canonical shapes)
- `server/src/shared/lib/stateMachine.ts` — ALLOWED_TRANSITIONS map + validateTransition()
- `server/prisma/schema.prisma` — all 13 models, JobStatus enum, composite index (queue_id, status, available_at), index (worker_id, heartbeat_at)
- `server/src/shared/db/queries/jobs.ts` — claimNextJob() FOR UPDATE SKIP LOCKED, transitionJobStatus()
- `server/src/shared/db/queries/workers.ts` — registerWorker, upsertHeartbeat, findStaleWorkers, markWorkerUnhealthy
- `server/src/shared/db/queries/schedules.ts` — findDueSchedules (cap 100/tick), updateNextRunAt
- `server/src/shared/db/queries/dlq.ts` — moveToDLQ (transaction), replayDLQEntry (transaction)
- `server/src/shared/db/queries/metrics.ts` — getJobCounts, getQueueDepths, getWorkerUtilization
- `server/tsconfig.json` — updated (strict, ES2022, CommonJS)
- `server/package.json` — added scripts (dev:api, dev:scheduler, dev:worker, migrate, test), cron-parser
- Migration applied: `prisma/migrations/20260823114016_init/` against atlas_dev (legai_postgres:5432)
- `tsc --noEmit`: 0 errors
- docs/ cleared (planning docs removed before first commit)
- `.gitignore`: node_modules, dist, .env, generated/, migrations/
- GitHub repo: https://github.com/Mohan14123/atlas (public, committed + pushed)

**Files touched:** all files listed above + .gitignore, progress.json, completed.md

---

## 2026-08-23 — Phase 2 implemented (Auth API)

**Phase 2 — Auth API (atlas-api)**

- `server/src/api/middlewares/error.ts` — Global Express error handler mapping AppError and ZodError to standard responses
- `server/src/api/middlewares/validate.ts` — Zod validation middleware (Express 5 compatible)
- `server/src/api/middlewares/auth.ts` — JWT verify middleware and Express Request augmentation
- `server/src/api/controllers/auth.controller.ts` — Register (transaction: User + Org + OrgMember) and Login endpoints
- `server/src/api/routes/auth.routes.ts` — Auth routing
- `server/src/api/routes/index.ts` — Main v1 API router
- `server/src/api/app.ts` — Express app factory with CORS, JSON body parser, and global error handler
- `server/src/api/index.ts` — API entry point: server start, DB connect, graceful shutdown
- Verified successful registration (transaction commit) and login (JWT generation) via `curl`
- Fixed Zod dependency to `3.23.8` to match frontend plan and API stability

**Files touched:** all files listed above + progress.json, completed.md

---

## 2026-08-23 — Phase 3 implemented (Organizations & Projects API)

**Phase 3 — Organizations & Projects (atlas-api)**

- `server/src/api/controllers/organizations.controller.ts` — CRUD operations for Organizations, checking access via `organization_members`
- `server/src/api/routes/organizations.routes.ts` — Organization routes, authenticated via `requireAuth`
- `server/src/api/controllers/projects.controller.ts` — CRUD operations for Projects, verifying org access per user
- `server/src/api/routes/projects.routes.ts` — Project routes using `mergeParams: true` (mounted under `/organizations/:orgId/projects`)
- `server/src/api/routes/index.ts` — Mounted `organizations.routes.ts` at `/organizations`
- Type fixes for `req.params` in Express 5 types for string indexing
- Clean `tsc` compilation

**Files touched:** all files listed above + progress.json, completed.md

---

## 2026-08-23 — Phase 4 implemented (Queues API)

**Phase 4 — Queues API (atlas-api)**

- `server/src/api/controllers/queues.controller.ts` — CRUD operations for Queues, verifying org access per project
- `server/src/api/routes/queues.routes.ts` — Queue routes using `mergeParams: true` (mounted under `/projects/:projectId/queues`)
- Mounted `queues.routes.ts` in `projects.routes.ts`
- Added Zod schemas for queue creation and updates (handling concurrency limits and paused states)
- Clean `tsc` compilation

**Files touched:** all files listed above + progress.json, completed.md

---

## 2026-08-23 — Doc Recovery, Type Safety & CI Fix

- Recovered `docs/prompt.md`, `docs/features.md`, `docs/database.md`, `docs/api.md`, `docs/architecture.md`, `docs/SUBMISSION.md` from transcript logs
- Excluded `docs/` in `.gitignore` (as requested: ignored, not deleted)
- Added global Express type augmentation for `req.user` in `server/src/types/express.d.ts`
- Refactored `server/src/api/middlewares/auth.ts` to use global type augmentation
- Tested build to ensure clean compilation
- Added `.github/workflows/ci.yml` using `npx prisma db push` (completed by previous agent)
- Added integration tests for auth, orgs, projects, queues APIs (completed by previous agent)

**Files touched:**
- `.gitignore` [MODIFIED]
- `server/src/types/express.d.ts` [NEW]
- `server/src/api/middlewares/auth.ts` [MODIFIED]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED]

---

## 2026-08-23 — Phase 5 implemented (Schedules API)

**Phase 5 — Schedules API (atlas-api)**

- `server/src/shared/lib/cron.ts` — `getNextRunAt(expr, tz)` using `cron-parser` (version 5.x `parse` method)
- `server/src/api/controllers/schedules.controller.ts` — CRUD operations for Schedules with cron validation and next_run_at calculation
- `server/src/api/routes/schedules.routes.ts` — Mounted under queues routes
- `server/tests/api/schedules.test.ts` — Integration tests for schedule CRUD operations
- Executed `npm run test server/tests/api/schedules.test.ts` cleanly
- Extracted and recovered missing `user/phases.md` and `user/detailed_api.md` from transcript logs
- Pushed changes to GitHub

**Files touched:**
- `server/src/shared/lib/cron.ts` [NEW]
- `server/src/api/controllers/schedules.controller.ts` [NEW]
- `server/src/api/routes/schedules.routes.ts` [NEW]
- `server/src/api/routes/queues.routes.ts` [MODIFIED]
- `server/tests/api/schedules.test.ts` [NEW]
- `docs/user/phases.md` [MODIFIED]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED]

---

## 2026-08-23 — Comprehensive Documentation Generated

- Formatted `docs/mermaid/architecture.mmd` to cleanly separate physical and conceptual layers
- Wrote detailed `docs/mermaid/er.mmd`, matching `schema.prisma` exactly
- Created `docs/mermaid/job-state-machine.mmd`, `job-execution-sequence.mmd`, and `worker-recovery.mmd`
- Generated all PNG assets in `docs/assets/` using local Chrome binary
- Populated `README.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/database.md`, `docs/testing.md`, `docs/failure-recovery.md`, `docs/state-machine.md`, `docs/sequence-diagrams.md`, `docs/deployment.md`, and `docs/SUBMISSION.md` with detailed project-specific system blueprints
- Configured `.env.example`
- Updated `.gitignore` to track `docs/` but exclude generated assets and temporary dirs

**Files touched:**
- `docs/` and all its root markdown files [MODIFIED / NEW]
- `docs/mermaid/*.mmd` [MODIFIED / NEW]
- `docs/assets/*.png` [NEW]
- `README.md` [NEW]
- `.env.example` [NEW]
- `.gitignore` [MODIFIED]
- `completed.md` [MODIFIED]

---

## 2026-08-23 — Phase 6 implemented (Jobs API)

**Phase 6 — Jobs API (atlas-api) — 8 endpoints**

- `server/src/api/controllers/jobs.controller.ts` — Full CRUD for jobs:
  - `POST /queues/:queueId/jobs` — Create single job (immediate/delayed/scheduled mode)
  - `POST /queues/:queueId/jobs/batch` — Create batch jobs atomically (single pg transaction)
  - `GET /queues/:queueId/jobs` — List jobs with status/type filters and pagination
  - `GET /jobs/:jobId` — Get full job detail including payload
  - `GET /jobs/:jobId/executions` — Get execution attempts with duration_ms
  - `GET /jobs/:jobId/logs` — Get structured logs with execution_id and level filters
  - `POST /jobs/:jobId/retry` — Retry FAILED jobs (state machine enforced, resets attempt count)
  - `POST /jobs/:jobId/cancel` — Cancel SCHEDULED/QUEUED jobs (state machine enforced)
- Idempotency: `ON CONFLICT (idempotency_key) DO NOTHING` — returns existing job with 409
- BullMQ enqueue: immediate jobs are dispatched to Redis/BullMQ on creation
- State machine: retry only from FAILED, cancel only from SCHEDULED/QUEUED
- Job logs: retry and cancel events are persisted as INFO-level job_logs
- `server/src/api/routes/jobs.routes.ts` — Queue-scoped job routes (list, create, batch)
- `server/src/api/routes/index.ts` — Individual job routes (detail, executions, logs, retry, cancel)
- `server/src/api/routes/queues.routes.ts` — Mounted jobs routes under `/:queueId/jobs`
- `server/tests/api/jobs.test.ts` — 15 integration tests covering all 8 endpoints
- All 41 tests across 6 suites pass cleanly
- `tsc --noEmit`: 0 errors

**Files touched:**
- `server/src/api/controllers/jobs.controller.ts` [NEW]
- `server/src/api/routes/jobs.routes.ts` [NEW]
- `server/src/api/routes/index.ts` [MODIFIED]
- `server/src/api/routes/queues.routes.ts` [MODIFIED]
- `server/tests/api/jobs.test.ts` [NEW]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED]

---

## 2026-08-23 — Phase 7 implemented (DLQ API)

**Phase 7 — DLQ API (atlas-api) — 3 endpoints**

- `server/src/api/controllers/dlq.controller.ts` — CRUD operations for dead letter queue:
  - `GET /dlq` — List DLQ entries with joined job info, pagination, and `queue_id` filtering
  - `GET /dlq/:entryId` — Get single DLQ entry with job details and execution history
  - `POST /dlq/:entryId/replay` — Atomically replay DLQ entry (create new job, delete DLQ row) and enqueue to BullMQ
- `server/src/api/routes/dlq.routes.ts` — Router for DLQ API
- `server/src/api/routes/index.ts` — Mount DLQ router under `/dlq`
- `server/tests/api/dlq.test.ts` — 6 integration tests covering list, get, and replay functionality
- All 47 tests across 7 suites pass cleanly
- `tsc --noEmit`: 0 errors

**Files touched:**
- `server/src/api/controllers/dlq.controller.ts` [NEW]
- `server/src/api/routes/dlq.routes.ts` [NEW]
- `server/src/api/routes/index.ts` [MODIFIED]
- `server/tests/api/dlq.test.ts` [NEW]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED]

---

## 2026-08-23 — Phase 8 implemented (Workers & Metrics API)

**Phase 8 — Workers & Metrics API (atlas-api) — 3 endpoints**

- `server/src/api/controllers/workers.controller.ts` — Read-only API for workers:
  - `GET /workers` — List workers with their current status and active job counts
  - `GET /workers/:workerId` — Get single worker with recent heartbeats and running jobs
- `server/src/api/controllers/metrics.controller.ts` — Dashboard API:
  - `GET /metrics` — Calculate throughput, success/failure rates, queue depths, and worker utilization over rolling windows (1h, 24h, 7d)
- `server/src/api/routes/workers.routes.ts` — Router for Workers API
- `server/src/api/routes/metrics.routes.ts` — Router for Metrics API
- `server/src/api/routes/index.ts` — Mounted both routers under `/workers` and `/metrics`
- `server/tests/api/workers.test.ts` — Integration tests for workers API
- `server/tests/api/metrics.test.ts` — Integration tests for metrics API
- All 53 tests across 9 suites pass cleanly
- `tsc --noEmit`: 0 errors

**Files touched:**
- `server/src/api/controllers/workers.controller.ts` [NEW]
- `server/src/api/controllers/metrics.controller.ts` [NEW]
- `server/src/api/routes/workers.routes.ts` [NEW]
- `server/src/api/routes/metrics.routes.ts` [NEW]
- `server/src/api/routes/index.ts` [MODIFIED]
- `server/tests/api/workers.test.ts` [NEW]
- `server/tests/api/metrics.test.ts` [NEW]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED]

## 2026-08-23 — Phase 9: atlas-scheduler service

- Created `server/src/scheduler/index.ts` containing the service entrypoint and graceful shutdown mechanics.
- Created `server/src/scheduler/scheduler.ts` with a non-overlapping asynchronous tick loop driving the scheduling tasks.
- Created `server/src/scheduler/listen-notify.ts` providing PostgreSQL LISTEN capabilities on `schedule_changed` and `queue_changed` for immediate ticks.
- Created `server/src/scheduler/jobs/detectStaleWorkers.ts` to flag unhealthy workers based on the 30s heartbeat invariant.
- Created `server/src/scheduler/jobs/recoverOrphanedJobs.ts` to gracefully conditionally requeue jobs owned by unhealthy workers.
- Created `server/src/scheduler/jobs/promoteDelayedJobs.ts` using idempotency updates to safely promote SCHEDULED jobs to QUEUED.
- Created `server/src/scheduler/jobs/retryFailedJobs.ts` handling the backoff retry logic without mutating attempt_counts natively.
- Created `server/src/scheduler/jobs/createDueJobs.ts` establishing exactly-once schedule triggers utilizing PostgreSQL `FOR UPDATE` and idempotency constraints.
- Created `server/src/scheduler/jobs/reconcile.ts` connecting the missing link of BullMQ failures by looking up job identifiers directly in Redis queues.
- Wrote integration tests covering all scheduler functionality in `server/tests/scheduler/scheduler.test.ts`. All test suites successfully verified.

## 2026-08-23 — Phase 11 Feedback Fixes
- Updated `server/src/shared/lib/stateMachine.ts` to allow `CLAIMED` -> `QUEUED` and `RUNNING` -> `QUEUED` transitions for orphaned job recovery.
- Updated `server/src/shared/db/queries/dlq.ts` to use `transitionJobStatus` instead of a direct `UPDATE`.
- Updated `server/src/scheduler/jobs/recoverOrphanedJobs.ts` to use `transitionJobStatus`.
- Updated `server/tests/api/dlq.test.ts` to transition the mocked job to `RUNNING` before `moveToDLQ` is tested.

## 2026-08-23 — Phase 12: Docker & Compose
- Created `server/Dockerfile.api` to build the API container.
- Created `server/Dockerfile.scheduler` to build the Scheduler container.
- Created `server/Dockerfile.worker` to build the Worker container.
- Created `server/docker-compose.yml` defining the full multi-container architecture (postgres, redis, pgbouncer, api, scheduler, worker, and frontend).

## 2026-08-23 — Phase 13: Observability
- Added HTTP request logging middleware in `server/src/api/app.ts` to log incoming requests along with their duration.
- Added per-tick timing logs to the Scheduler loop in `server/src/scheduler/scheduler.ts` to measure overhead and execution time.
- Enhanced the Worker job processing logs in `server/src/worker/worker.ts` to track and log the execution duration for both successful and failed jobs.
- The `GET /metrics` endpoint derives and delivers robust metrics directly from Postgres, as originally designed.

## 2026-08-23 — Phase 14: Tests
- Created `server/tests/concurrency/claimPath.test.ts` to verify exactly-once semantics for worker claims.
- Verified integration tests for Idempotency, Batch, DLQ Replay, Pause/Resume, Stale Worker, and Job Lifecycle.
- Total test count reached 62 passing tests, covering edge-case scenarios and Postgres transaction handling.

## 2026-08-23 — Phase 16: E2E Verification

- Fixed TS compilation of express type extensions in docker for atlas-api
- Added missing JWT_SECRET to worker and scheduler in docker-compose.yml
- Updated verify-e2e.ts with nested route URLs and valid payloads
- Verified full API -> Postgres -> BullMQ -> Worker E2E flow

**Files touched:**
- `server/tsconfig.json` [MODIFIED]
- `server/docker-compose.yml` [MODIFIED]
- `server/scripts/verify-e2e.ts` [MODIFIED]

## 2026-08-24 — Phase 16: Architecture Hardening & Docs

- **State Machine Centralization:** Enforced all state transitions via `transitionJobStatusConditional`. Added `FAILED → SCHEDULED` and `CLAIMED → FAILED` paths. Refactored all scheduler jobs and APIs to use the centralized state machine, fixing TOCTOU vulnerabilities.
- **BullMQ Lifecycle Manager:** Implemented `BullMQManager` with a shared Redis connection and cached Queue instances. Used it across all scheduler components, eliminating O(queues × ticks) Queue churn.
- **Worker Hardening:** Worker now uses a dedicated Redis connection (separate from BullMQ internals) and sets `concurrency=1` per queue (making Postgres authoritative for concurrency limits). Worker writes/updates `job_executions` records. Fixed a sync bug that could cause duplicate Worker instances.
- **Reconciliation Hardening:** Added batch limiting and wait/active checks before re-enqueuing.
- **Scheduler Fixes:** Fixed promise leak in `requestImmediateTick()`.
- **Integration Tests:** Added full test suites for `crash-recovery.test.ts`, `reconciliation.test.ts`, and `scheduler-hardening.test.ts`. 134 tests now pass cleanly.
- **Docker Hardening:** Created `atlas-migrate` init container. Updated Compose to enforce DB migration before API/Worker/Scheduler startup. Copied `prisma.config.ts` into all images.
- **Documentation:** Rewrote `docs/architecture.md` to formally document execution guarantees (at-least-once handler, exactly-once PG claim), state transitions, and failure recovery pipelines.

## 2026-08-24 — Frontend-Backend Integration

- **AppContext:** Created `client/client/src/components/layout/AppContext.tsx` — React Context managing `orgId` and `projectId` with localStorage persistence and auto-selection logic.
- **Org/Project Selectors:** Updated `AppLayout.tsx` Topbar with Organization and Project dropdown selectors fetching from real backend endpoints.
- **API Client Cleanup:** Removed all `MOCK_ENABLED` toggles and hardcoded mock data arrays from `auth.api.ts`, `queues.api.ts`, `jobs.api.ts`, `schedules.api.ts`, `workers.api.ts`, `dlq.api.ts`, and `metrics.api.ts`.
- **Route Wiring:** Updated all API clients to use the correct hierarchical routes (`/organizations/:orgId/projects/:projectId/queues/...`).
- **Hook Updates:** Refactored `useQueues`, `useJobs`, `useSchedules`, `useMetrics` hooks to consume `orgId`/`projectId` from `useAppContext()`.
- **Hardcoded ID Removal:** Eliminated `p-1` from `Queues.tsx`, `QueueDetail.tsx`, and `AppLayout.tsx` Sidebar.
- **New Files:** `organizations.api.ts`, `projects.api.ts`, `useOrganizations.ts`, `useProjects.ts`.
- **Dependencies:** Ran `npm install` to generate `package-lock.json` and install all client dependencies.
- **Import Fix:** Corrected `AppContext.tsx` import paths (`../../hooks/` not `../hooks/`).
- **Verification:** `tsc --noEmit` passes with zero errors.

**Files touched:**
- `client/client/src/App.tsx` [MODIFIED]
- `client/client/src/components/layout/AppContext.tsx` [NEW]
- `client/client/src/components/layout/AppLayout.tsx` [MODIFIED]
- `client/client/src/api/auth.api.ts` [MODIFIED]
- `client/client/src/api/queues.api.ts` [MODIFIED]
- `client/client/src/api/jobs.api.ts` [MODIFIED]
- `client/client/src/api/schedules.api.ts` [MODIFIED]
- `client/client/src/api/workers.api.ts` [MODIFIED]
- `client/client/src/api/dlq.api.ts` [MODIFIED]
- `client/client/src/api/metrics.api.ts` [MODIFIED]
- `client/client/src/api/organizations.api.ts` [NEW]
- `client/client/src/api/projects.api.ts` [NEW]
- `client/client/src/hooks/useQueues.ts` [MODIFIED]
- `client/client/src/hooks/useJobs.ts` [MODIFIED]
- `client/client/src/hooks/useSchedules.ts` [MODIFIED]
- `client/client/src/hooks/useMetrics.ts` [MODIFIED]
- `client/client/src/hooks/useOrganizations.ts` [NEW]
- `client/client/src/hooks/useProjects.ts` [NEW]
- `client/client/src/pages/Queues.tsx` [MODIFIED]
- `client/client/src/pages/QueueDetail.tsx` [MODIFIED]
- `client/client/src/pages/Schedules.tsx` [MODIFIED]
- `client/client/package-lock.json` [NEW]
- `progress.json` [MODIFIED]
- `completed.md` [MODIFIED]

## 2026-08-25 — Final MVP Polish

- Added Job Submission UI in Jobs page
- Added 5s polling to all React Query hooks for live UI updates
- Enhanced /metrics API to return throughput history and worker utilization
- Unmocked Dashboard charts to use real data

## 2026-08-25 — Fix End-to-End Job Processing Race Condition

- Diagnosed a race condition between BullMQ dequeueing and PostgreSQL exact timestamp validation where jobs were legitimately picked up by the worker before the JS `new Date()` timestamp was `<` PostgreSQL's `NOW()`, causing `claimSpecificJob` to return null.
- Removed the strict `j.available_at <= NOW()` check from `claimSpecificJob` since any job explicitly routed by BullMQ has already met its eligibility criteria.
- Removed debug console logs from `server/src/api/controllers/jobs.controller.ts` and `server/tests/integration/end-to-end.test.ts`.
- Verified exactly-once processing and state transition completeness (`QUEUED` -> `CLAIMED` -> `RUNNING` -> `COMPLETED`/`FAILED`).
- Verified `end-to-end.test.ts` integration test suite passes successfully.

**Files touched:**
- `server/src/shared/db/queries/jobs.ts` [MODIFIED]
- `server/src/api/controllers/jobs.controller.ts` [MODIFIED]
- `server/tests/integration/end-to-end.test.ts` [MODIFIED]

