import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { orbitResponse } from '../worker/orbits.js';
import worker from '../worker/index.js';
const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  text = JSON.stringify([fixture]);
let wall = Date.now(),
  calls = 0,
  upstreamStatus = 200,
  invalid = false;
const saved = new Map(),
  cache = {
    match: async (k) => saved.get(k.url)?.clone(),
    put: async (k, r) => {
      const bytes = await r.arrayBuffer();
      saved.set(k.url, new Response(bytes, { status: r.status, headers: r.headers }));
    },
  },
  env = { ORBIT_LIMITER: { limit: async () => ({ success: true }) } };
const deps = {
  cache,
  now: () => wall,
  fetcher: async (url, options) => {
    calls++;
    assert.equal(new URL(url).hostname, 'celestrak.org');
    assert.equal(options.redirect, 'manual');
    return new Response(invalid ? 'not json' : text, { status: upstreamStatus });
  },
};
const request = (q) => new Request('https://madar.test/api/orbits?' + q);
for (const q of [
  'group=made-up',
  'url=https://evil.test',
  'group=active&group=stations',
  'id=0',
  'id=25544',
  'group=active&query=private',
  'id=1&group=active',
  'group=intelligence',
])
  assert.equal((await orbitResponse(request(q), env, deps)).status, 400);
assert.equal(
  (
    await orbitResponse(
      new Request('https://madar.test/api/orbits?group=active', { method: 'POST' }),
      env,
      deps,
    )
  ).status,
  405,
);
assert.equal(
  (
    await orbitResponse(
      new Request('https://madar.test/api/orbits?group=active', {
        headers: { origin: 'https://evil.test' },
      }),
      env,
      deps,
    )
  ).status,
  403,
);
assert.equal(calls, 0);
const first = await orbitResponse(request('group=active'), env, deps);
assert.equal(first.status, 200);
assert.equal(first.headers.get('X-Madar-Fetched-At'), String(wall));
assert.deepEqual(await first.json(), [fixture]);
wall += 1000;
const hit = await orbitResponse(request('group=active'), env, deps);
assert.equal(hit.headers.get('X-Madar-Connection'), 'edge-cache');
assert.equal(hit.headers.get('X-Madar-Fetched-At'), String(wall - 1000));
assert.equal(calls, 1);
assert.equal(hit.headers.get('Cache-Control'), 'no-store');
assert.equal(
  (
    await orbitResponse(
      request('group=weather'),
      { ORBIT_LIMITER: { limit: async () => ({ success: false }) } },
      deps,
    )
  ).status,
  429,
);
assert.equal(calls, 1);
wall += 7200000;
upstreamStatus = 403;
const blocked = await orbitResponse(request('group=active'), env, deps);
assert.equal(blocked.status, 503);
assert.equal(blocked.headers.get('X-Madar-Upstream-Status'), '403');
await orbitResponse(request('group=weather'), env, deps);
assert.equal(calls, 2, 'source denial stops all other upstream groups');
saved.clear();
upstreamStatus = 200;
invalid = true;
assert.equal((await orbitResponse(request('group=active'), env, deps)).status, 502);
saved.clear();
invalid = false;
const tooLarge = {
  ...deps,
  fetcher: async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(15000001));
          c.close();
        },
      }),
    ),
};
assert.equal((await orbitResponse(request('group=active'), env, tooLarge)).status, 502);
assert.equal((await worker.fetch(request('group=active'), {})).status, 503);
// Browser uses the same-origin relay, preserves the server timestamp, and never switches to direct requests after a denial.
let browserCalls = [],
  apiStatus = 200,
  edge = 'upstream';
const browserStore = new Map(),
  persist = new Map();
class Clock extends Date {
  static now() {
    return wall;
  }
}
const c = {
  Date: Clock,
  AbortSignal,
  location: { protocol: 'https:', hostname: 'madar.aymen684.workers.dev' },
  StateStore: {
    get: async (k) => browserStore.get(k),
    put: async (k, v) => browserStore.set(k, v),
  },
  Privacy: { localGet: (k) => persist.get(k), localSet: (k, v) => persist.set(k, v) },
  fetch: async (url) => {
    browserCalls.push(url);
    return new Response(text, {
      status: apiStatus,
      headers: {
        'X-Madar-Fetched-At': String(wall - 30000),
        'X-Madar-Connection': edge,
        'X-Madar-Upstream-Status': apiStatus === 503 ? '403' : '',
        'Retry-After': '7200',
      },
    });
  },
};
browserStore.set('orbit-catalog-v2:active', {
  version: 2,
  text: 'old',
  fetchedAt: wall,
  group: 'active',
});
persist.set(
  'orbit-cache-service-stop',
  JSON.stringify({ until: wall + 7200000, note: 'legacy direct error' }),
);
vm.createContext(c);
for (const p of ['orbit-data.js', 'orbit-service.js'])
  vm.runInContext(fs.readFileSync('public/' + p, 'utf8'), c);
const fallback = async () => ({ data: [], derived: false });
const a = await c.OrbitService.fetchGroup('active', null, fallback, {});
assert.equal(browserCalls[0], '/api/orbits?group=active');
assert.equal(a.data[0].provenance.transport, 'server');
assert.equal(a.fetchedAt, wall - 30000);
edge = 'edge-cache';
wall += 1000;
const b = await c.OrbitService.fetchGroup('active', null, fallback, {}, { force: true });
assert.equal(browserCalls.length, 2);
assert.equal(b.source, 'cache');
wall += 7200000;
apiStatus = 503;
const stale = await c.OrbitService.fetchGroup('active', null, fallback, {});
assert.equal(stale.fetchedAt, b.fetchedAt);
await c.OrbitService.fetchGroup('weather', null, fallback, {});
assert.equal(browserCalls.length, 3);
assert.equal(c.OrbitService.connection('active').state, 'blocked');
assert(browserCalls.every((u) => u.startsWith('/api/orbits?')));
// Static hosting without this API retains direct support, and does not bypass its source cache.
let direct = 0;
const staticContext = {
  Date: Clock,
  AbortSignal,
  location: { protocol: 'https:', hostname: 'aymen684-netizen.github.io' },
  fetch: async (url) => {
    direct++;
    return new Response(url.startsWith('/api/') ? '' : text, {
      status: url.startsWith('/api/') ? 404 : 200,
    });
  },
};
vm.createContext(staticContext);
for (const p of ['orbit-data.js', 'orbit-service.js'])
  vm.runInContext(fs.readFileSync('public/' + p, 'utf8'), staticContext);
await staticContext.OrbitService.fetchGroup('active', null, fallback, {});
await staticContext.OrbitService.fetchGroup('active', null, fallback, {}, { force: true });
assert.equal(direct, 1, 'GitHub Pages skips the relay and retains the source cache');
console.log(
  'PASS: safe same-origin orbital relay, shared cache and original timestamps, rate/stream-size/JSON framing limits, global HTTP-stop, browser migration/recheck and static hosting compatibility',
);

// A relay network timeout may use the same official endpoint; HTTP refusals above never do.
let networkCalls = [];
const networkContext = {
  Date: Clock,
  AbortSignal,
  location: { protocol: 'https:', hostname: 'madar.aymen684.workers.dev' },
  fetch: async (url) => {
    networkCalls.push(url);
    return url.startsWith('/api/')
      ? new Response('{}', { status: 502, headers: { 'X-Madar-Error': 'network' } })
      : new Response(text);
  },
};
vm.createContext(networkContext);
for (const p of ['orbit-data.js', 'orbit-service.js'])
  vm.runInContext(fs.readFileSync('public/' + p, 'utf8'), networkContext);
const networkData = await networkContext.OrbitService.fetchGroup('active', null, fallback, {});
assert.equal(networkData.source, 'live');
assert.equal(networkData.data[0].provenance.transport, 'direct');
assert.equal(networkCalls.length, 2);
assert.equal(new URL(networkCalls[1]).hostname, 'celestrak.org');

networkContext.fetch = async (url) => {
  networkCalls.push(url);
  if (url.startsWith('/api/')) throw new TypeError('network failure');
  return new Response(text);
};
wall += 7200000;
const thrown = await networkContext.OrbitService.fetchGroup('weather', null, fallback, {});
assert.equal(thrown.data[0].provenance.transport, 'direct');

const beforeNetworkRetry = networkCalls.length;
await networkContext.OrbitService.fetchGroup('weather', null, fallback, {}, { force: true });
assert.equal(
  networkCalls.length,
  beforeNetworkRetry + 1,
  'a relay timeout must retain a fresh direct cache without repeating the source request',
);
