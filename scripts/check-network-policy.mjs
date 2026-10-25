import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const calls = [],
  stored = new Map();
const c = {
  URL,
  Event,
  Request,
  location: { href: 'https://madar.test/' },
  navigator: {
    sendBeacon: () => {
      throw Error('must not send');
    },
  },
  XMLHttpRequest: function () {
    this.open = () => {};
    this.send = () => {};
    this.setRequestHeader = () => {};
  },
  WebSocket: function () {},
  EventSource: function () {},
  localStorage: { getItem: (k) => stored.get(k) || null, setItem: (k, v) => stored.set(k, v) },
  document: { dispatchEvent() {} },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return new Response('[]');
  },
};
c.window = c;
vm.createContext(c);
for (const p of ['network-resources.js', 'network-policy.js'])
  vm.runInContext(fs.readFileSync('public/' + p, 'utf8'), c);
const privateText = 'PRIVATE_TEST_COORDINATES_24.7136';
for (const url of [
  'https://evil.test/?q=' + privateText,
  '/api/word.docx',
  '/api/orbits?id=25544',
  '/api/orbits?group=active&q=' + privateText,
  '/data/countries.json?q=' + privateText,
  'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=json',
])
  await assert.rejects(c.fetch(url));
await assert.rejects(c.fetch('/data/countries.json', { method: 'POST', body: privateText }));
assert.equal(c.navigator.sendBeacon('https://evil.test', privateText), false);
assert.throws(() => new c.WebSocket('wss://evil.test'));
assert.throws(() => new c.XMLHttpRequest().open('GET', 'https://evil.test'));
const xhr = new c.XMLHttpRequest();
assert.throws(() => xhr.open('GET', 'data/countries.json', true, privateText, 'password'));
xhr.open('GET', 'data/countries.json');
assert.throws(() => xhr.send(privateText));
assert.throws(() => xhr.setRequestHeader('X-Private', privateText));
xhr.send();
assert.equal(xhr.withCredentials, false);
assert.equal(calls.length, 0);
await c.fetch('/api/orbits?group=active', {
  headers: { 'X-Private': privateText },
  credentials: 'include',
  referrer: 'https://madar.test/?q=' + privateText,
});
await c.fetch('data/countries.json');
assert.equal(calls.length, 2);
assert.equal(calls[0].options.credentials, 'omit');
assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
assert.equal(calls[0].options.headers, undefined);
assert(!JSON.stringify(calls).includes(privateText));
c.NetworkPolicy.setUpdatesEnabled(false);
await assert.rejects(c.fetch('/api/orbits?group=stations'));
await assert.rejects(
  c.fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json'),
);
await c.fetch('data/active-omm.json?v=41');
const hash = 'ab'.repeat(32);
for (const prefix of ['https://madar.test/', 'https://madar.test/project/']) {
  c.location.href = prefix + 'positions-worker.js?v=' + hash;
  vm.runInContext(fs.readFileSync('public/network-resources.js', 'utf8'), c);
  c.MadarNetworkResources.versions = { 'data/countries.json': hash };
  vm.runInContext(fs.readFileSync('public/network-policy.js', 'utf8'), c);
  assert(c.NetworkPolicy.allowed('data/countries.json?v=' + hash));
  assert(
    c.NetworkPolicy.allowed('data/countries.json?v=41'),
    'cached numeric clients remain supported',
  );
  assert.equal(
    c.NetworkPolicy.assetUrl('data/countries.json'),
    prefix + 'data/countries.json?v=' + hash,
  );
  for (const url of [
    'data/countries.json?v=' + hash + '&v=' + hash,
    'data/countries.json?v=' + hash + '&q=private',
    'data/countries.json?v=' + hash.toUpperCase(),
    'data/countries.json?v=' + hash.slice(1),
    'data/countries.json?v=' + hash + 'a',
    'data/countries.json?v=' + 'cd'.repeat(32),
    'missing.json?v=' + hash,
    'https://evil.test/data/countries.json?v=' + hash,
    'data/countries.json?v=' + hash + '#private',
  ]) {
    assert(!c.NetworkPolicy.allowed(url), url);
    assert.equal(c.NetworkPolicy.assetUrl(url), url, 'resolver must not sanitize blocked inputs');
  }
}
assert.equal(stored.get('madar-public-updates'), 'false');
console.log(
  'PASS: exact public URL/method policy, no upload/body/identifier queries, no beacon/socket/unsafe XHR, stripped credentials/referrer/headers and cached-data-only update control',
);
