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

/**
 * Releases the body of a response that is about to be discarded on an error path.
 *
 * The fetcher cancels the bodies of *retried* responses itself, but the final response it
 * returns is the caller's to consume. An unconsumed undici body pins its socket and buffers
 * the received bytes until GC, so on a non-OK response we throw/return away, that leaks a
 * connection and heap — most relevant under the sustained upstream failures the retry config
 * anticipates. Cancelling releases both immediately; errors are ignored (nothing left to do).
 *
 * @param response - The response whose body will not be read
 */
export async function discardResponseBody(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}
