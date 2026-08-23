# Architecture & Design Decisions

This document tracks major architectural decisions for the Atlas project.

## 1. Database and ORM
- **Decision:** Use PostgreSQL with Prisma ORM.
- **Reason:** Strongly typed schema, built-in migration system, and excellent Node.js support.

## 2. Job Queue Strategy
- **Decision:** Row-level locking in PostgreSQL (`FOR UPDATE SKIP LOCKED`).
- **Reason:** Provides robust transactional safety and simplifies infrastructure by avoiding a separate message broker initially.

## 3. Worker Architecture
- **Decision:** Stateless, horizontally scalable workers using long-polling.
- **Reason:** Ensures reliable execution and easy scalability across multiple containers.
