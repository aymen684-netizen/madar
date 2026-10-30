// Shared, fail-closed retry policy for public GitHub review API requests.
// Only identified rate limits and temporary server errors may be retried.
export async function githubReviewRetryMs(response, failures, nowMs = Date.now()) {
  const status = response.status;
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const resetAt = response.headers.get('x-ratelimit-reset');
  let rateLimited = remaining === '0' || retryAfter !== null;
  if (status === 403 && !rateLimited) {
    try {
      const error = await response.json();
      rateLimited = /(?:secondary )?rate limit/i.test(String(error?.message || ''));
    } catch {
      // Unknown forbidden responses are not retried.
    }
  }
  const retryable =
    status === 429 || (status === 403 && rateLimited) || (status >= 500 && status < 600);
  if (!retryable) return null;
  let waitMs = (status >= 500 ? 5000 : 60000) * 2 ** Math.min(failures, 3);
  if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter))
    waitMs = Math.max(waitMs, Math.ceil(Number(retryAfter) * 1000));
  if (remaining === '0' && resetAt && /^\d+$/.test(resetAt))
    waitMs = Math.max(waitMs, Number(resetAt) * 1000 - nowMs + 1000);
  return Math.max(0, waitMs);
}

// Never log response bodies, authorization values or unbounded provider headers.
export function githubReviewDiagnostics(response) {
  const header = (name) =>
    String(response.headers.get(name) || 'unknown')
      .replace(/[^a-zA-Z0-9.-]/g, '')
      .slice(0, 72);
  return (
    'HTTP ' +
    response.status +
    ', remaining=' +
    header('x-ratelimit-remaining') +
    ', reset=' +
    header('x-ratelimit-reset') +
    ', retry-after=' +
    header('retry-after') +
    ', request=' +
    header('x-github-request-id')
  );
}
