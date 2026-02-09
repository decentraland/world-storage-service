import type { IFetchComponent } from '@well-known-components/interfaces'

/**
 * Creates a fetch wrapper that bridges signedFetchFactory with localFetch.
 *
 * signedFetchFactory requires absolute URLs to parse with new URL(),
 * while localFetch only accepts relative URLs starting with '/'.
 *
 * This wrapper:
 * 1. Accepts full URLs from signedFetchFactory
 * 2. Extracts the pathname and search (query string) using new URL(url)
 * 3. Properly extracts headers from Request objects (which is how signedFetchFactory passes signed requests)
 * 4. Passes the relative path (with query string) and headers to localFetch
 */
export function createLocalFetchWrapper(localFetch: IFetchComponent): typeof fetch {
  return async (input, init) => {
    if (input instanceof Request) {
      const parsedUrl = new URL(input.url)
      const relativePath = parsedUrl.pathname + parsedUrl.search
      // Clone the request to safely read the body without consuming it
      const body = input.body ? await input.clone().text() : undefined
      return localFetch.fetch(relativePath, {
        method: input.method,
        headers: Object.fromEntries(input.headers.entries()),
        body
      }) as unknown as Response
    }
    const parsedUrl = new URL(input as string)
    const relativePath = parsedUrl.pathname + parsedUrl.search
    return localFetch.fetch(relativePath, init) as unknown as Response
  }
}
