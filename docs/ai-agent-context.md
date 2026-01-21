# AI Agent Context

**Service Purpose:**

The World Storage Service is a standalone service that provides secure, isolated storage and environment variable access for Decentraland worlds. It acts as an API gateway for persistent storage and secrets management, used by Authoritative Servers running server-side scene code. The service enforces world isolation through cryptographic validation of signed fetch requests, ensuring that only authorized authoritative servers can access their world's data.

**Key Capabilities:**

- **Signed Fetch Validation**: Receives and validates signed fetch requests from authoritative servers using Decentraland's ADR-44 specification. Only requests signed by valid authoritative servers with proper private keys are accepted.
- **World Isolation Enforcement**: Extracts world name (e.g., "worldname.dcl.eth") from signed payload metadata (`serverName` or `realmName`), never from user-provided query parameters or request body. This ensures cryptographic proof of world ownership.
- **Key-Value Storage API**: Provides persistent storage with two namespaces:
  - **World storage**: Global key-value storage scoped to a world (`/values/:key`)
  - **Player storage**: Per-player key-value storage scoped to both world and player address (`/players/:player_address/values/:key`)
- **Environment Variables Management**: Serves encrypted environment variables (secrets, API keys, config) configured at deploy time (`/env/:key`). Values are encrypted at rest and only accessible to the authoritative server for that world.
- **Bulk Delete Operations**: Supports clearing all values in a storage namespace. These operations require a confirmation header (`X-Confirm-Delete-All`) to prevent accidental data loss.

**Communication Pattern:**

HTTP REST API using signed fetch authentication. The service exposes REST endpoints that accept signed fetch requests with authentication headers (`X-Identity-Auth-Chain-*`). The world name is extracted from the cryptographic signature metadata, ensuring security and isolation. All requests must be signed by the authoritative server's private key tied to its world deployment.

**Technology Stack:**

- Runtime: Node.js (v24.x or higher)
- Language: TypeScript
- HTTP Framework: Well-Known Components HTTP Server (`@well-known-components/http-server`)
- Database: PostgreSQL with JSONB support for storing key-value pairs
- Authentication: Signed fetch validation (Decentraland ADR-44 specification)
- Logging: Well-Known Components Logger (`@well-known-components/logger`)
- Metrics: Prometheus-compatible metrics via Well-Known Components Metrics (`@well-known-components/metrics`)
- Tracing: Well-Known Components Tracer (`@well-known-components/tracer-component`)

**External Dependencies:**

- **PostgreSQL Database**: Stores world storage, player storage, and encrypted environment variables. Uses JSONB columns for flexible value storage. The database schema includes:
  - `world_storage` table: Stores world-scoped key-value pairs (world_name, key, value)
  - `player_storage` table: Stores player-scoped key-value pairs (world_name, player_addr, key, value)
  - `env_variables` table: Stores encrypted environment variables (world_name, key, value_enc)

**Key Concepts:**

- **Signed Fetch**: All requests from authoritative servers must be signed using their private key. The signature includes metadata with the `serverName` (world name), which is cryptographically verified before processing any request. This ensures that only the authorized server can access its world's data.
- **World Isolation**: The world name is extracted exclusively from the signed fetch metadata, never from URL parameters or request body. This prevents world name spoofing and ensures data isolation between different worlds.
- **Storage Namespaces**: Two distinct storage namespaces exist - world storage (global to the world) and player storage (scoped per player address). Both are further isolated by world name extracted from the signature.
- **Environment Variables**: Secrets and configuration values are stored encrypted at rest and are only accessible to the authoritative server for the specific world. These are set at deployment time via Creator Hub UI or CLI, not at runtime.
- **Stateless Service**: The service itself is stateless - all state is stored in PostgreSQL. This allows for horizontal scaling and independent scaling from scene execution.
- **Request Flow**: Authoritative Server → Signed Fetch Request → World Storage Service → Signature Validation → World Name Extraction → Database Query (with world_name from signature) → Response

**Database notes:**

- **World Storage Table**: `world_storage` with composite primary key (world_name, key). The `world_name` comes from the signed fetch metadata, ensuring isolation.
- **Player Storage Table**: `player_storage` with composite primary key (world_name, player_addr, key). Both world_name and player_addr are used for scoping.
- **Environment Variables Table**: `env_variables` with composite primary key (world_name, key). Values are stored encrypted (BYTEA type) for security.
- **Isolation Guarantee**: All database queries MUST use `world_name` extracted from the signed fetch signature, never from request parameters. This is a critical security requirement.
- **JSONB Storage**: Storage values use JSONB type for flexible JSON storage with PostgreSQL's JSON querying capabilities.
