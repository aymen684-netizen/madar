export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://celestrak.org/NORAD/elements/gp.php; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'";
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP + "; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000',
  'Cross-Origin-Resource-Policy': 'same-origin',
};
export function secure(response) {
  const result = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) result.headers.set(key, value);
  return result;
}
