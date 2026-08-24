# Atlas Submission Checklist

This document maps all assignment requirements to the actual implemented source code, documentation, and tests.

| Requirement | Status | Implementation | Documentation | Test / Evidence |
|---|---|---|---|---|
| Authentication | IMPLEMENTED | `src/api/middlewares/auth.ts`, `auth.controller.ts` | `docs/api.md`, `docs/security.md` | `tests/api/auth.test.ts` |
| Project management | IMPLEMENTED | `src/api/controllers/projects.controller.ts` | `docs/api.md` | `tests/api/projects.test.ts` |
| Multiple queues | IMPLEMENTED | `src/api/controllers/queues.controller.ts` | `docs/api.md`, `docs/design-decisions.md` | `tests/api/queues.test.ts` |
| Priority | IMPLEMENTED | `src/api/controllers/jobs.controller.ts` (BullMQ opts) | `docs/api.md` | Implemented in `createJob` payload |
| Concurrency limits | IMPLEMENTED | `src/shared/db/queries/jobs.ts` (`claimSpecificJob`) | `docs/database.md`, `docs/architecture.md` | `tests/concurrency/claimPath.test.ts` |
| Retry policy | IMPLEMENTED | `src/scheduler/jobs/retryFailedJobs.ts` | `docs/architecture.md`, `docs/design-decisions.md` | `tests/unit/stateMachine.test.ts` |
| Pause/resume | IMPLEMENTED | `src/api/controllers/queues.controller.ts` | `docs/api.md` | `tests/integration/scheduler-hardening.test.ts` |
| Statistics | IMPLEMENTED | `src/shared/db/queries/metrics.ts` | `docs/api.md` | `tests/api/metrics.test.ts` |
| Immediate jobs | IMPLEMENTED | `src/api/controllers/jobs.controller.ts` | `docs/architecture.md` (LISTEN/NOTIFY) | `tests/api/jobs.test.ts` |
| Delayed jobs | IMPLEMENTED | `src/scheduler/jobs/promoteDelayedJobs.ts` | `docs/architecture.md` | `tests/unit/stateMachine.test.ts` |
| Scheduled jobs | IMPLEMENTED | `src/scheduler/jobs/evaluateSchedules.ts` | `docs/api.md` | `tests/api/schedules.test.ts` |
| Recurring cron jobs | IMPLEMENTED | `src/scheduler/jobs/evaluateSchedules.ts` | `docs/api.md` | `tests/api/schedules.test.ts` |
| Batch jobs | IMPLEMENTED | `src/api/controllers/jobs.controller.ts` | `docs/api.md` | `tests/api/jobs.test.ts` |
| Worker service | IMPLEMENTED | `src/worker/worker.ts` | `docs/architecture.md`, `docs/setup.md` | `tests/integration/crash-recovery.test.ts` |
| Atomic claims | IMPLEMENTED | `src/shared/db/queries/jobs.ts` (`SKIP LOCKED`) | `docs/database.md` | `tests/concurrency/claimPath.test.ts` |
| Concurrent execution | IMPLEMENTED | `src/worker/worker.ts` | `docs/architecture.md` | `tests/concurrency/claimPath.test.ts` |
| Heartbeats | IMPLEMENTED | `src/worker/heartbeat.ts` | `docs/architecture.md` | `tests/integration/crash-recovery.test.ts` |
| Graceful shutdown | IMPLEMENTED | `src/api/index.ts`, `scheduler/index.ts`, `worker/index.ts` | `docs/design-decisions.md` | Manually tested via `SIGTERM` |
| Complete lifecycle | IMPLEMENTED | `src/shared/lib/stateMachine.ts` | `docs/architecture.md` | `tests/unit/stateMachine.test.ts` |
| Retries | IMPLEMENTED | `src/scheduler/jobs/retryFailedJobs.ts` | `docs/architecture.md` | `tests/unit/stateMachine.test.ts` |
| DLQ | IMPLEMENTED | `src/shared/db/queries/dlq.ts`, `src/worker/worker.ts` | `docs/architecture.md` | `tests/api/dlq.test.ts` |
| Execution logs | IMPLEMENTED | `src/worker/worker.ts` (`job_executions` insert) | `docs/database.md` | `tests/api/jobs.test.ts` |
| Retry history | IMPLEMENTED | `src/worker/worker.ts` (`attempts` count) | `docs/database.md` | `tests/api/jobs.test.ts` |
| Worker assignment | IMPLEMENTED | `src/shared/db/queries/jobs.ts` (`worker_id` mapping) | `docs/database.md` | `tests/concurrency/claimPath.test.ts` |
| Timestamps | IMPLEMENTED | `prisma/schema.prisma` (`created_at`, `updated_at`) | `docs/database.md` | Included in all schemas |
| Execution metrics | IMPLEMENTED | `src/shared/db/queries/metrics.ts` | `docs/api.md` | `tests/api/metrics.test.ts` |
| Dashboard | NOT IMPLEMENTED | Frontend is built but dashboard views omitted. | N/A | N/A |
| Queue health | NOT IMPLEMENTED | Omitted for MVP. | N/A | N/A |
| Worker status | IMPLEMENTED | `src/api/controllers/workers.controller.ts` | `docs/api.md` | `tests/api/workers.test.ts` |
| Job explorer | NOT IMPLEMENTED | Frontend omitted. | N/A | N/A |
| Execution logs | IMPLEMENTED | API `GET /jobs/:jobId/logs` | `docs/api.md` | `tests/api/jobs.test.ts` |
| Queue configuration | IMPLEMENTED | `src/api/controllers/queues.controller.ts` | `docs/api.md` | `tests/api/queues.test.ts` |
| Metrics | IMPLEMENTED | `src/shared/db/queries/metrics.ts` | `docs/api.md` | `tests/api/metrics.test.ts` |
| Database schema | IMPLEMENTED | `prisma/schema.prisma` | `docs/database.md`, `docs/er-diagram.mmd` | N/A |
| REST APIs | IMPLEMENTED | `src/api/routes/` | `docs/api.md` | `tests/api/` |
| Validation | IMPLEMENTED | `src/api/middlewares/validate.ts` (Zod) | `docs/security.md` | Validated in all API tests |
| Authentication | IMPLEMENTED | `src/api/middlewares/auth.ts` (JWT) | `docs/security.md`, `docs/api.md` | `tests/api/auth.test.ts` |
| Pagination | IMPLEMENTED | All list endpoints support `limit`/`offset` | `docs/api.md` | `tests/api/jobs.test.ts` |
| Filtering | IMPLEMENTED | Supported on Job listings (by `status`) | `docs/api.md` | `tests/api/jobs.test.ts` |
| Structured errors | IMPLEMENTED | `src/shared/lib/errors.ts` (`AppError`) | `docs/api.md` | Evaluated in all test suites |
| Logging | IMPLEMENTED | `src/shared/lib/logger.ts` (Winston JSON) | `docs/architecture.md` | Verifiable in Docker logs |
| Architecture diagram| IMPLEMENTED | `docs/architecture-diagram.mmd` | `docs/architecture.md` | N/A |
| ER diagram | IMPLEMENTED | `docs/er-diagram.mmd` | `docs/database.md` | N/A |
| API documentation | IMPLEMENTED | `docs/api.md` | `docs/api.md` | N/A |
| Design decisions | IMPLEMENTED | `docs/design-decisions.md` | `docs/design-decisions.md` | N/A |
| Automated tests | IMPLEMENTED | `tests/` directory (134 passing tests) | `docs/testing.md` | `npm test` |
