import fs from 'node:fs';
import { CSP, SECURITY_HEADERS, STATIC_CACHE_CONTROL } from '../security/headers.js';

const pagePath = new URL('../public/index.html', import.meta.url);
const html = fs.readFileSync(pagePath, 'utf8');
// Attribute order and line wrapping must not affect the security policy update.
const policyMeta =
  /(<meta\b(?=[^>]*\bhttp-equiv="Content-Security-Policy")[^>]*\bcontent=")[^"]*(")/i;
if (!policyMeta.test(html)) throw Error('CSP meta missing or malformed');
fs.writeFileSync(
  pagePath,
  html.replace(policyMeta, (_, before, after) => before + CSP + after),
);
fs.writeFileSync(
  new URL('../public/_headers', import.meta.url),
  '/*\n' +
    Object.entries({ ...SECURITY_HEADERS, 'Cache-Control': STATIC_CACHE_CONTROL })
      .map(([key, value]) => '  ' + key + ': ' + value)
      .join('\n') +
    '\n',
);
