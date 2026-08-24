# Atlas Security Model

Atlas implements multiple layers of security spanning authentication, database isolation, request validation, and secret management.

## 1. Authentication (JWT)
- **Mechanism**: The REST API secures endpoints using JSON Web Tokens (JWT).
- **Implementation**: The `requireAuth` middleware verifies the `Authorization: Bearer <token>` header against the `JWT_SECRET`.
- **Payload**: Tokens contain the user's `id` and `email`.

## 2. Authorization and Organization Ownership
- **Multi-tenancy**: All resources (Projects, Queues, Jobs) are strictly scoped to an Organization.
- **Enforcement**: Access is verified structurally. The API ensures the authenticated User has a corresponding record in the `organization_members` table for the target Organization before allowing read or write operations to any descendant resource (Project/Queue/Job).
- *(Note: Granular RBAC / Role-Based Access Control such as Admin vs Viewer is not currently implemented. All members have full access within their organization).*

## 3. Input Validation (Zod)
- **Mechanism**: All incoming HTTP requests are validated via Zod schemas before reaching the controller logic.
- **Protection**: This prevents NoSQL/SQL injection patterns by strictly parsing and dropping unknown payload properties, and returning detailed `400 Bad Request` structural errors for malformed requests.

## 4. Environment Secrets
- **Management**: Secrets like `JWT_SECRET`, `DATABASE_URL`, and `REDIS_URL` are strictly injected via environment variables.
- **Failsafe**: The `env.ts` configuration utilizes Zod to strictly validate the environment at boot. The API, Scheduler, and Worker will intentionally crash on boot if secrets are missing or malformed, preventing insecure defaults.

## 5. Database and Infrastructure Access
- **PostgreSQL**: Protected by password authentication. Direct network access should be restricted via VPC/Docker networking.
- **Redis**: Currently configured without auth for development (`redis://redis:6379`). In production, Redis ACLs and passwords should be enforced, especially since it acts as the execution transport mechanism.
- **Data Isolation**: Queue concurrency limits and state transitions are enforced securely at the database level (`transitionJobStatusConditional`). A compromised worker cannot transition a job from `COMPLETED` back to `RUNNING` because the central state matrix strictly forbids it.
