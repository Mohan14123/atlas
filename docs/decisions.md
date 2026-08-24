# Architecture & Design Decisions

This document tracks major architectural decisions for the Atlas project.

## Decision: PostgreSQL as source of truth
**Decision:**
PostgreSQL is the authoritative state store.

**Why:**
- transactional consistency
- relational integrity
- durable execution history
- atomic claiming

## Decision: Redis/BullMQ
**Decision:**
Redis/BullMQ is execution transport.

**Why:**
- asynchronous dispatch
- delayed jobs
- worker distribution
- fast transport

**But:**
Redis is not authoritative state.

## Decision: SKIP LOCKED
**Decision:**
Workers claim jobs using:
`SELECT ... FOR UPDATE SKIP LOCKED`

**Why:**
Multiple workers can safely compete for jobs without blocking each other. This is crucial for avoiding lock contention and deadlocks when operating a fleet of horizontal workers.
