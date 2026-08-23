# API Reference

## API Design:

- **Auth:**
  - `POST /api/v1/auth/register`
  - `POST /api/v1/auth/login`

- **Organizations & Projects:**
  - `GET /api/v1/organizations`
  - `POST /api/v1/organizations`
  - `GET /api/v1/organizations/:organizationId/projects`
  - `POST /api/v1/organizations/:organizationId/projects`
  - `GET /api/v1/projects/:projectId`

- **Queues:**
  - `GET /api/v1/projects/:projectId/queues`
  - `POST /api/v1/projects/:projectId/queues`
  - `GET /api/v1/queues/:queueId`
  - `PATCH /api/v1/queues/:queueId`
  - `PUT /api/v1/queues/:queueId/pause`
  - `PUT /api/v1/queues/:queueId/resume`
  - `GET /api/v1/queues/:queueId/stats`

- **Schedules:**
  - `POST /api/v1/queues/:queueId/schedules`
  - `GET /api/v1/queues/:queueId/schedules`
  - `GET /api/v1/schedules/:scheduleId`
  - `PATCH /api/v1/schedules/:scheduleId`
  - `DELETE /api/v1/schedules/:scheduleId`

- **Job Management:**
  - `POST /api/v1/queues/:queueId/jobs`
  - `POST /api/v1/queues/:queueId/jobs/batch`
  - `GET /api/v1/queues/:queueId/jobs`
  - `GET /api/v1/jobs/:jobId`
  - `GET /api/v1/jobs/:jobId/executions`
  - `GET /api/v1/jobs/:jobId/logs`
  - `POST /api/v1/jobs/:jobId/retry`
  - `POST /api/v1/jobs/:jobId/cancel`

- **DLQ:**
  - `GET /api/v1/dlq`
  - `GET /api/v1/dlq/:entryId`
  - `POST /api/v1/dlq/:entryId/replay`

- **Workers & Metrics:**
  - `GET /api/v1/workers`
  - `GET /api/v1/workers/:workerId`
  - `GET /api/v1/metrics`

