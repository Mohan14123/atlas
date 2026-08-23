# Deployment

How to run Atlas as a distributed system.

## Docker Compose

The environment consists of several interconnected containers:
- `frontend` (Dashboard)
- `api` (Control Plane APIs)
- `scheduler` (Cron & Recovery)
- `worker` (Execution layer)
- `redis` (Transport)
- `postgres` (Source of Truth)
- `pgbouncer` (Connection pooler)

### Starting the system

To launch the complete environment:
```bash
docker compose up
```

### Scaling Workers

To scale out the execution layer, run multiple instances of the worker service:
```bash
docker compose up --scale worker=3
```

## Environment Configuration
Refer to `.env.example` for required configuration values.
