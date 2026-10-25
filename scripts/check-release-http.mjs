import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { SECURITY_HEADERS, STATIC_CACHE_CONTROL } from '../security/headers.js';
import { verifyRelease } from './verify-release.mjs';

await mkdir('test-results', { recursive: true });
const { manifest } = await verifyRelease(),
  log = createWriteStream('test-results/release-http-server.log'),
  child = spawn(
    process.execPath,
    ['scripts/serve-release.mjs', '--local', '--port', '8791', '--ip', '127.0.0.1'],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
    },
  ),
  base = 'http://127.0.0.1:8791',
  results = [];
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
let startupError;
child.on('error', (error) => {
  startupError = error;
});
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw Error('Wrangler exited before readiness');
    try {
      const response = await fetch(base + '/', {
        method: 'HEAD',
        signal: AbortSignal.timeout(2000),
      });
      if (response.status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert(ready, 'Local release server did not become ready');
  for (const asset of ['index.html', 'privacy.js', 'positions-worker.js', 'data/en.json']) {
    const url =
      base + (asset === 'index.html' ? '/' : '/' + asset + '?v=' + manifest.assets[asset].sha256);
    const response = await fetch(url);
    assert.equal(response.status, 200, asset);
    assert.equal(response.headers.get('cache-control'), STATIC_CACHE_CONTROL, asset);
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      assert.equal(response.headers.get(name), value, asset + ': ' + name);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      manifest.assets[asset].sha256,
      asset,
    );
    const etag = response.headers.get('etag');
    assert(etag, 'ETag missing: ' + asset);
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(head.headers.get('cache-control'), STATIC_CACHE_CONTROL);
    const conditional = await fetch(url, { headers: { 'If-None-Match': etag } });
    assert.equal(conditional.status, 304, asset + ': conditional request');
    assert.equal((await conditional.arrayBuffer()).byteLength, 0);
    results.push({
      asset,
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
      etag,
      conditionalStatus: conditional.status,
    });
  }
  const gone = await fetch(base + '/api/word.docx');
  assert.equal(gone.status, 410);
  assert.equal(gone.headers.get('cache-control'), 'no-store');
  await gone.arrayBuffer();
  const invalid = await fetch(base + '/api/orbits?id=25544');
  assert.equal(invalid.status, 400);
  await invalid.arrayBuffer();
  await verifyRelease();
  await writeFile(
    'test-results/release-http.json',
    JSON.stringify(
      {
        sourceSha: process.env.GITHUB_SHA || null,
        results,
        retiredUploadStatus: 410,
        invalidOrbitStatus: 400,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS: frozen assets and Worker via Wrangler HTTP; cache/security headers, HEAD, ETag/304, and unchanged API protections',
  );
} catch (error) {
  console.error((await readFile('test-results/release-http-server.log', 'utf8')).slice(-6000));
  throw error;
} finally {
  child.kill('SIGTERM');
  await Promise.race([new Promise((resolve) => child.once('close', resolve)), delay(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
  log.end();
}

// Observe the current deployments without comparing their bytes to an undeployed PR.
const live = [];
for (const origin of [
  'https://madar.aymen684.workers.dev/',
  'https://aymen684-netizen.github.io/madar/',
]) {
  for (const asset of ['', 'privacy.js', 'manifest.webmanifest']) {
    const url = new URL(asset, origin).href;
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
      live.push({
        url,
        status: response.status,
        finalUrl: response.url,
        headers: Object.fromEntries(
          ['cache-control', 'etag', 'age', 'last-modified', 'cf-cache-status', 'content-type'].map(
            (name) => [name, response.headers.get(name)],
          ),
        ),
      });
    } catch (error) {
      live.push({ url, error: error.message });
    }
  }
}
await writeFile(
  'test-results/hosting-headers.json',
  JSON.stringify({ observedAt: new Date().toISOString(), live }, null, 2) + '\n',
);
console.log(
  'Recorded current hosting headers:',
  live.filter((item) => item.status === 200).length,
  'successful public HEAD responses',
);
