import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
const full = fs.readFileSync('public/data/satellite-metadata.json', 'utf8'),
  summaryText = fs.readFileSync('public/data/satellite-metadata-summary.json', 'utf8'),
  summary = JSON.parse(summaryText),
  compactText = fs.readFileSync('public/data/satellite-metadata-compact.json', 'utf8'),
  compact = JSON.parse(compactText),
  profiles = JSON.parse(fs.readFileSync('public/data/mission-profiles.json', 'utf8'));
assert(Buffer.byteLength(compactText) < Buffer.byteLength(summaryText) * 0.4);
assert.equal(compact.sourceSha256, summary.sourceSha256);
assert.equal(Object.keys(compact.satellites).length, Object.keys(summary.satellites).length);
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
    url.includes('-compact.json')
      ? { ok: true, json: async () => compact }
      : url.includes('mission-profiles')
        ? { ok: true, json: async () => profiles }
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
const legacyContext = { ...c, module: { exports: {} } };
vm.createContext(legacyContext);
vm.runInContext(fs.readFileSync('public/satellite-metadata.js', 'utf8'), legacyContext);
const legacy = legacyContext.module.exports;
legacy.use(summary, profiles);
for (const id of Object.keys(summary.satellites)) {
  assert.equal(JSON.stringify(api.get(id)), JSON.stringify(legacy.get(id)), 'identity ' + id);
}
assert.equal(JSON.stringify(api.owners()), JSON.stringify(legacy.owners()));
assert.equal(JSON.stringify(api.inventoryInfo()), JSON.stringify(legacy.inventoryInfo()));
// An invalid description must fail before publishing a partial catalog, and remain retryable.
let broken = true;
const invalidContext = {
  ...c,
  module: { exports: {} },
  fetch: async (url) => ({
    ok: true,
    json: async () =>
      url.includes('mission-profiles')
        ? profiles
        : broken
          ? {
              ...compact,
              satellites: { 900: { description: compact.descriptionTemplates.length } },
            }
          : compact,
  }),
};
vm.createContext(invalidContext);
vm.runInContext(fs.readFileSync('public/satellite-metadata.js', 'utf8'), invalidContext);
const invalid = invalidContext.module.exports;
await assert.rejects(invalid.load(), /invalid identity description/);
assert.equal(invalid.get(900).ownerCode, '');
broken = false;
await invalid.load();
assert.equal(invalid.get(900).ownerCode, 'US');
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
  'PASS: deduplicated startup metadata is under 40% of legacy bytes, every identity/owner/source field is unchanged, malformed templates retry safely, details remain lazy with SHA-256 verification and defensive copies',
);
