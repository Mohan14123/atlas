# Atlas Database Schema and Strategy

Atlas uses PostgreSQL as the absolute authoritative source of truth. The database is strictly normalized, enforces isolation through foreign keys, and leverages specific locking primitives for safe concurrent access.

## Entity Responsibilities

- **User**: Represents a human or system identity.
- **Organization**: Top-level tenant container.
- **OrganizationMember**: Maps Users to Organizations.
- **Project**: A logical grouping within an Organization.
- **Queue**: Defines processing rules (concurrency, retry logic) for a specific workload.
- **Job**: The authoritative state of a specific task.
- **JobExecution**: A historical record of a single worker's attempt to process a Job.
- **WorkerHeartbeat**: Tracks active worker processes for stale-worker detection.
- **JobSchedule**: Defines recurring (cron) templates that generate Jobs.
- **DlqEntry**: Stores poison-pill jobs that exceeded their `max_attempts`.
- **JobLog**: Raw textual logs emitted during a job's execution.

## Concurrency and Locking Strategy

Atlas guarantees that multiple workers cannot execute the same job by using PostgreSQL's **row-level pessimistic locking**.

### The Claim Query
When a worker receives a `jobId` from BullMQ, it attempts to claim it in Postgres:

```sql
UPDATE jobs
SET status = 'CLAIMED', worker_id = $1, updated_at = NOW()
WHERE id = (
  SELECT id FROM jobs
  WHERE id = $2 AND status = 'QUEUED'
  FOR UPDATE SKIP LOCKED
)
AND (
  SELECT count(*) FROM jobs 
  WHERE queue_id = $3 AND status = 'RUNNING'
) < $4
RETURNING *;
```

### Why this is safe:
1. **`FOR UPDATE SKIP LOCKED`**: Obtains an exclusive write lock on the job row. If another worker is already evaluating this job, the DB instantly skips the row rather than blocking/deadlocking, resulting in a safe `null` claim.
2. **State Gate (`status = 'QUEUED'`)**: Prevents TOCTOU bugs. The job can only be locked if it is strictly `QUEUED`.
3. **Concurrency Gate (`count(*) < limit`)**: Enforces queue-level concurrency globally across all workers in a single atomic database operation. Postgres can safely determine claim permission because it holds the true state of every job across the distributed system.

## Performance and Indexing

To support high-throughput operations, specific composite indexes are applied:

1. **`jobs_queue_id_status_idx`**: 
   Accelerates the concurrency check (`COUNT(*) WHERE queue_id = X AND status = Y`) and API listing queries.
2. **`jobs_status_available_at_idx`**:
   Accelerates the scheduler's `promoteDelayedJobs` query (`WHERE status = 'SCHEDULED' AND available_at <= NOW()`).
3. **`worker_heartbeats_last_heartbeat_at_idx`**:
   Accelerates the scheduler's `recoverOrphanedJobs` query to quickly identify stale workers.

## Normalization and Cascading

- **ON DELETE CASCADE**: Organizations cascading to Projects cascading to Queues cascading to Jobs. This ensures complete data cleanup when a tenant is deleted.
- **Isolation**: Jobs are heavily isolated via `queue_id`, preventing a backlog in Queue A from impacting the lookup performance of Queue B (especially when partitioning is applied in the future).
- **Execution History vs State**: The `jobs` table maintains the *current* authoritative state, while `job_executions` acts as an append-only ledger for attempts. This prevents row-bloat on the critical `jobs` table.
