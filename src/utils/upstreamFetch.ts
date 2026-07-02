/**
 * Shared request bounds for calls to upstream Decentraland services (Places,
 * worlds-content-server, LAMBDAS).
 *
 * - `timeout`: a hung upstream must not pin in-flight requests to this service.
 * - `attempts`/`retryDelay`: the upstream calls made here are idempotent GETs, so a
 *   transient blip is retried instead of surfacing as an error (e.g. a 401 to a
 *   legitimate world owner).
 *
 * Kept in one place so the resilience posture cannot silently diverge per adapter.
 */
export const UPSTREAM_FETCH_OPTIONS = {
  timeout: 5_000,
  attempts: 3,
  retryDelay: 200
} as const
