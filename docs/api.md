# Atlas API Documentation

All endpoints are prefixed with `/api/v1`.

## Authentication

### `POST /auth/register`
- **Purpose**: Register a new user and organization.
- **Authentication**: None
- **Body**: `{ email: string, password: string, orgName: string }`
- **Success Response** (201): `{ token: string, user: { id, email }, orgId: string }`

### `POST /auth/login`
- **Purpose**: Authenticate an existing user.
- **Authentication**: None
- **Body**: `{ email: string, password: string }`
- **Success Response** (200): `{ token: string, user: { id, email } }`

---

## Organizations & Projects

### `GET /organizations/:orgId/projects`
- **Purpose**: List all projects within an organization.
- **Authentication**: Required (`Bearer <token>`)
- **Success Response** (200): `{ data: Project[] }`

### `POST /organizations/:orgId/projects`
- **Purpose**: Create a new project.
- **Authentication**: Required
- **Body**: `{ name: string, description?: string }`
- **Success Response** (201): `{ data: Project }`

---

## Queues

### `GET /organizations/:orgId/projects/:projectId/queues`
- **Purpose**: List all queues in a project.
- **Authentication**: Required
- **Success Response** (200): `{ data: Queue[] }`

### `POST /organizations/:orgId/projects/:projectId/queues`
- **Purpose**: Create a new queue.
- **Authentication**: Required
- **Body**: `{ name: string, concurrencyLimit?: number, retryStrategy?: "fixed" | "exponential", maxAttempts?: number }`
- **Success Response** (201): `{ data: Queue }`

---

## Jobs

### `POST /queues/:queueId/jobs`
- **Purpose**: Enqueue a new job.
- **Authentication**: Required
- **Body**: `{ type: string, payload: any, priority?: number, availableAt?: ISOString }`
- **Success Response** (201): `{ data: Job }`

### `POST /queues/:queueId/jobs/batch`
- **Purpose**: Enqueue multiple jobs atomically.
- **Authentication**: Required
- **Body**: `{ jobs: Array<{ type, payload, priority?, availableAt? }> }`
- **Success Response** (201): `{ data: Job[] }`

### `GET /queues/:queueId/jobs`
- **Purpose**: List jobs in a queue.
- **Authentication**: Required
- **Query Params**: `status` (string), `limit` (number), `offset` (number)
- **Success Response** (200): `{ data: Job[], meta: { total, limit, offset } }`

### `GET /queues/:queueId/jobs/:jobId`
- **Purpose**: Get a specific job's details.
- **Authentication**: Required
- **Success Response** (200): `{ data: Job }`

### `POST /queues/:queueId/jobs/:jobId/retry`
- **Purpose**: Manually retry a failed job.
- **Authentication**: Required
- **Success Response** (200): `{ data: Job }`

### `POST /queues/:queueId/jobs/:jobId/cancel`
- **Purpose**: Cancel a queued or scheduled job.
- **Authentication**: Required
- **Success Response** (200): `{ data: Job }`

---

## Executions & Logs

### `GET /jobs/:jobId/executions`
- **Purpose**: Get execution history for a job.
- **Authentication**: Required
- **Success Response** (200): `{ data: JobExecution[] }`

### `GET /jobs/:jobId/logs`
- **Purpose**: Get logs for a specific job.
- **Authentication**: Required
- **Success Response** (200): `{ data: JobLog[] }`

---

## Schedules (Recurring Jobs)

### `POST /queues/:queueId/schedules`
- **Purpose**: Create a recurring cron schedule.
- **Authentication**: Required
- **Body**: `{ name: string, cronExpression: string, jobType: string, payload: any, timezone?: string }`
- **Success Response** (201): `{ data: JobSchedule }`

---

## Workers & Metrics

### `GET /organizations/:orgId/workers`
- **Purpose**: List active workers and their status.
- **Authentication**: Required
- **Success Response** (200): `{ data: Worker[] }`

### `GET /queues/:queueId/metrics`
- **Purpose**: Get queue execution metrics (throughput, success rate).
- **Authentication**: Required
- **Query Params**: `timeRange` ('1h', '24h', '7d')
- **Success Response** (200): `{ metrics: any }`

---

## Dead Letter Queue (DLQ)

### `GET /queues/:queueId/dlq`
- **Purpose**: List failed jobs that exceeded max attempts.
- **Authentication**: Required
- **Query Params**: `limit`, `offset`
- **Success Response** (200): `{ data: DlqEntry[], meta: { total, limit, offset } }`

### `POST /dlq/:entryId/replay`
- **Purpose**: Replay a poison pill from the DLQ back into the active queue.
- **Authentication**: Required
- **Success Response** (200): `{ data: Job }`
