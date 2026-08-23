# Database Design

This document explains why the database is designed the way it is.

## jobs

**Purpose:**
Represents one logical job instance.

**Important fields:**
- `status`: Tracks the lifecycle state of the job.
- `priority`: Determines execution order within a queue.
- `attempt_count`: Used to enforce retry policy limits.
- `available_at`: When the job is eligible for claiming.
- `worker_id`: Nullable; tracks which worker has claimed the job.

**Indexes:**
- `(queue_id, status, priority)`
- `(queue_id, available_at)`
- `(worker_id)`

**Why:**
The worker claim query frequently searches for eligible jobs in a queue ordered by priority and availability time. Fast lookups are essential for throughput.

## queues

**Purpose:**
Provides logical partitioning of jobs and applies specific processing configurations.

**Important fields:**
- `concurrency_limit`: Controls how many jobs can run at once.
- `retry_policy_id`: Defines the default retry behavior for jobs in this queue.

**Why:**
Queues map business domains (e.g. "email-sending", "image-processing") to their respective compute resources.

## job_schedules

**Purpose:**
Defines the pattern or time when jobs should be generated.

**Important fields:**
- `cron_expression`: e.g. `* * * * *`
- `next_run_at`: Driven by cron logic or fixed delays.

**Why:**
Separating schedules from jobs allows us to maintain a clean history of generated `jobs` without losing the original recurrence definition.

## Concurrency & Transactions

- **SKIP LOCKED:** We heavily utilize PostgreSQL's `SELECT ... FOR UPDATE SKIP LOCKED` for atomic claiming. This guarantees that multiple concurrent workers never pick up the same job, and they do not block each other while searching the queue.
- **Normalization:** Core entities (Users, Organizations, Projects) are heavily normalized. Job state is flattened to optimize for rapid polling and updates.
- **Foreign Keys:** Cascading deletes are avoided in favor of explicit soft-deletion or controlled cleanup to prevent accidental bulk data loss in execution history.
