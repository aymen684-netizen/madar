import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const full = fs.readFileSync('public/data/satellite-metadata.json', 'utf8'),
  summaryText = fs.readFileSync('public/data/satellite-metadata-summary.json', 'utf8'),
  summary = JSON.parse(summaryText);
assert(
  summaryText.length < full.length * 0.4,
  'startup identities should exclude the expanded source catalog',
);
assert.equal(
  Object.keys(summary.satellites).length,
  Object.keys(JSON.parse(full).satellites).length,
);
assert(Object.values(summary.satellites).every((r) => !r.catalog));
let fullCalls = 0,
  tamper = false;
const c = {
  Intl,
  URL,
  crypto: webcrypto,
  TextEncoder,
  module: { exports: {} },
  fetch: async (url) =>
    url.includes('-summary.json')
      ? { ok: true, json: async () => summary }
      : url.includes('mission-profiles')
        ? { ok: true, json: async () => ({ satellites: {}, programs: {} }) }
        : {
            ok: true,
            text: async () => {
              fullCalls++;
              return tamper ? full + ' ' : full;
            },
          },
};
vm.createContext(c);
vm.runInContext(fs.readFileSync('public/satellite-metadata.js', 'utf8'), c);
const api = c.module.exports;
await api.load();
assert.equal(fullCalls, 0);
assert.equal(api.get(900).catalog, null);
assert.equal(api.get(900).ownerCode, 'US');
await Promise.all([api.loadDetails(), api.loadDetails()]);
assert.equal(fullCalls, 1, 'concurrent details requests share one fetch');
assert.equal(api.get(900).catalog.NORAD_CAT_ID, '900');
const copy = api.get(900).catalog;
copy.OWNER = 'bad';
assert.equal(api.get(900).catalog.OWNER, 'US');
const d = { ...c, module: { exports: {} } };
vm.createContext(d);
vm.runInContext(fs.readFileSync('public/satellite-metadata.js', 'utf8'), d);
const retry = d.module.exports;
await retry.load();
tamper = true;
await assert.rejects(retry.loadDetails(), /snapshot mismatch/);
assert.equal(
  retry.get(900).catalog,
  null,
  'reject mismatched source fields while retaining identity data',
);
assert.equal(retry.get(900).ownerCode, 'US');
tamper = false;
await retry.loadDetails();
assert.equal(retry.get(900).catalog.NORAD_CAT_ID, '900');
console.log(
  'PASS: compact startup metadata, on-demand source fields, coalesced requests, exact SHA-256 snapshot verification, defensive copies and retry after mismatch',
);
