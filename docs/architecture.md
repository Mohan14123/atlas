# Architecture Overview

## API

Responsible for:
- authentication
- validation
- job creation
- queue management
- control plane management

## Scheduler

Responsible for:
- evaluating schedules
- creating job instances
- retry scheduling
- stale worker recovery
- reconciliation

## Workers

Responsible for:
- claiming jobs
- executing handlers
- heartbeats
- execution results

## Data Flow

Schedule Definition
        ↓
Scheduler
        ↓
Job Instance
        ↓
Redis/BullMQ
        ↓
Worker
        ↓
PostgreSQL

## Diagram Reference
See `architecture.mmd` and `assets/architecture.png` for the visual architecture diagram.
