# Atlas Architecture Overview

Atlas is a hybrid job queue system designed for reliability and observability, combining the persistent transactional guarantees of PostgreSQL with the low-latency execution transport of Redis/BullMQ.

## 1. System Overview
Atlas relies on three primary services (`atlas-api`, `atlas-scheduler`, `atlas-worker`), connected to two infrastructure data stores (`postgres`, `redis`).
The system is multi-tenant by design, segregating workloads by Organizations and Projects.

## 2. Component Architecture

### REST API (`atlas-api`)
Handles user-facing traffic. Responsible for:
- Authentication & Authorization
- Creating and managing Projects, Queues, Schedules, and Jobs
- Querying job execution logs and metrics
- Managing the Dead Letter Queue (DLQ)

### Scheduler (`atlas-scheduler`)
A periodic background loop responsible for:
- Promoting delayed jobs to queued state
- Retrying failed jobs with exponential/fixed backoff
- Stale worker detection & orphaned job recovery
- PG→BullMQ reconciliation
- Evaluating recurring cron schedules

### Workers (`atlas-worker`)
Responsible for:
- Dynamically managing BullMQ consumers per active queue (`BullMQManager`)
- Atomically claiming jobs in PostgreSQL
- Transitioning jobs through `CLAIMED` → `RUNNING` → `COMPLETED` / `FAILED`
- Executing user-defined handlers
- Emitting periodic health heartbeats

## 3. Data Ownership
**PostgreSQL is the absolute authoritative source of state.**
It stores: configurations, queue states, job states, retry logic, concurrency limits, and execution logs.
**Redis / BullMQ is strictly an execution transport layer.**
It stores: transient routing topologies (`atlas_<queue_id>`) and a minimal payload (`{ jobId }`).

## 4. Request Lifecycle
1. User authenticates via API (JWT).
2. User submits a job payload to a specific Queue via REST API.
3. API inserts job into PostgreSQL as `QUEUED`.
4. API enqueues the job ID into Redis/BullMQ.

## 5. Job Lifecycle
1. Worker receives `{ jobId }` from BullMQ.
2. Worker queries Postgres to claim the job (`FOR UPDATE SKIP LOCKED`).
3. If successful, state becomes `RUNNING`.
4. Handler executes.
5. Worker transitions job to `COMPLETED` or `FAILED`.
6. Execution records (`job_executions`) are updated accordingly.

## 6. BullMQ Architecture
For every Atlas Queue created (e.g., ID `q123`), a corresponding BullMQ queue named `atlas_q123` is utilized.
The payload delivered to BullMQ is intentionally minimal:
```json
{ "jobId": "uuid-here" }
```
This forces the worker to read the true, authoritative job payload directly from PostgreSQL during the claim step.

## 7. State Machine
All state transitions are centrally validated in PostgreSQL.
```text
SCHEDULED → QUEUED      (scheduler: promoteDelayedJobs, retryFailedJobs)
SCHEDULED → CANCELLED   (API: cancelJob)
QUEUED    → CLAIMED     (worker: claimSpecificJob)
QUEUED    → CANCELLED   (API: cancelJob)
CLAIMED   → RUNNING     (worker: processJob)
CLAIMED   → QUEUED      (scheduler: recoverOrphanedJobs)
CLAIMED   → FAILED      (worker: unhandled job type error)
RUNNING   → COMPLETED   (worker: processJob)
RUNNING   → FAILED      (worker: processJob)
RUNNING   → QUEUED      (scheduler: recoverOrphanedJobs)
FAILED    → QUEUED      (scheduler: retryFailedJobs, API: retryJob)
FAILED    → SCHEDULED   (scheduler: retryFailedJobs with backoff)
COMPLETED → (terminal)
CANCELLED → (terminal)
```

## 8. Concurrency Model
Queue concurrency limits are authoritative in PostgreSQL.
During the atomic claim process, Postgres verifies:
`SELECT count(*) FROM jobs WHERE status = 'RUNNING'` is less than `queues.concurrency_limit`.
BullMQ concurrency is strictly set to `1` per queue locally on the worker, feeding jobs one at a time into the Postgres gauntlet.

## 9. Execution Guarantees
- **Exactly-once State Transition**: A job transitions from `QUEUED` to `RUNNING` exactly once per attempt, enforced by the PG row lock and `status` WHERE clause.
- **At-least-once Handler Invocation**: If a worker crashes after successfully executing a job handler but before committing the `COMPLETED` state to PostgreSQL, the job will be detected as an orphan, transitioned back to `QUEUED`, and executed again. Handlers **must** be idempotent.
Mathematical exactly-once handler execution is fundamentally impossible in this architecture without distributed 2-phase commits across network boundaries.

## 10. Failure Recovery
### Worker Crash (Heartbeats)
Workers emit heartbeats every 15s. If a heartbeat is >30s old, the scheduler marks the worker `unhealthy` and transitions its `CLAIMED`/`RUNNING` jobs back to `QUEUED`.

### Desync (Reconciliation)
If the API successfully commits a job as `QUEUED` to Postgres, but fails to reach Redis (or crashes immediately), the scheduler's reconciliation loop detects the `QUEUED` job missing from BullMQ and idempotently re-enqueues it.

### PostgreSQL / Redis Failures
The system uses automated reconnect logic. If Postgres drops, the scheduler's `LISTEN/NOTIFY` client traps the error and attempts reconnection every 5s. `ioredis` automatically buffers commands if Redis drops.

## 11. Graceful Shutdown
All services trap `SIGINT`/`SIGTERM` to allow active queries, pending HTTP requests, and currently executing job handlers to complete before severing the DB connections.

## 12. Dead Letter Queue
If a job exceeds its `max_attempts`, the worker moves the job to the `dlq_entries` table. This prevents poison pills from bloat the main `jobs` table while preserving the payload for manual review and replay via the API.
