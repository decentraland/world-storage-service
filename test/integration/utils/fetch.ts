import type { IFetchComponent } from '@well-known-components/interfaces'

interface LocalFetchWrapperOptions {
  /**
   * Automatically add Content-Type: application/json header when there's a body
   * and no Content-Type is already set. Defaults to true.
   */
  json?: boolean
}

function hasContentTypeHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')
}

/**
 * Creates a fetch wrapper that bridges signedFetchFactory with localFetch.
 *
 * signedFetchFactory requires absolute URLs to parse with new URL(),
 * while localFetch only accepts relative URLs starting with '/'.
 *
 * This wrapper:
 * 1. Accepts full URLs from signedFetchFactory
 * 2. Extracts the pathname using new URL(url).pathname
 * 3. Properly extracts headers from Request objects (which is how signedFetchFactory passes signed requests)
 * 4. Passes the relative path with headers to localFetch
 * 5. Optionally adds Content-Type: application/json header when there's a body (default: true)
 */
export function createLocalFetchWrapper(
  localFetch: IFetchComponent,
  options: LocalFetchWrapperOptions = {}
): typeof fetch {
  const { json = true } = options

  return async (input, init) => {
    if (input instanceof Request) {
      const relativePath = new URL(input.url).pathname
      // Clone the request to safely read the body without consuming it
      const body = input.body ? await input.clone().text() : undefined
      const headers: Record<string, string> = Object.fromEntries(input.headers.entries())

      // Add Content-Type: application/json if body exists, json option is true, and header not set
      if (json && body !== undefined && !hasContentTypeHeader(headers)) {
        headers['Content-Type'] = 'application/json'
      }

      return localFetch.fetch(relativePath, {
        method: input.method,
        headers,
        body
      }) as unknown as Response
    }

    // Handle string URL input (when signedFetchFactory passes through without identity)
    const relativePath = new URL(input as string).pathname
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }

    // Add Content-Type: application/json if body exists, json option is true, and header not set
    if (json && init?.body && !hasContentTypeHeader(headers)) {
      headers['Content-Type'] = 'application/json'
    }

    return localFetch.fetch(relativePath, {
      ...init,
      headers
    }) as unknown as Response
  }
}
