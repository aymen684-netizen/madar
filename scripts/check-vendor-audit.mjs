import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const readJson = async (root, name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function verifyVendorAudit({ root = process.cwd(), release = false } = {}) {
  const [provenance, audit, lock, packed] = await Promise.all([
    readJson(root, 'tools/vendor-audit/shipped-bundles.json'),
    readJson(root, 'tools/vendor-audit/package.json'),
    readJson(root, 'tools/vendor-audit/package-lock.json'),
    readJson(root, 'packed/manifest.json'),
  ]);
  assert.equal(provenance.schemaVersion, 1, 'Unknown vendor provenance schema');
  assert.equal(provenance.bundles.length, 4, 'Expected four audited browser bundles');
  const expected = new Set(['docx', 'satellite.js', 'globe.gl', 'globe-compat']);
  assert.deepEqual(
    new Set(provenance.bundles.map((bundle) => bundle.package)),
    expected,
    'Audited browser libraries changed without provenance review',
  );
  assert.deepEqual(
    new Set(Object.keys(audit.dependencies)),
    expected,
    'Audit manifest libraries differ from shipped bundles',
  );
  assert.deepEqual(
    lock.packages[''].dependencies,
    audit.dependencies,
    'Audit lock root dependencies are stale',
  );
  const packedAssets = new Map(packed.map((entry) => [entry.target, entry]));
  const results = [];
  for (const bundle of provenance.bundles) {
    const name = bundle.package;
    const spec =
      name === 'globe-compat' ? 'npm:globe.gl@' + bundle.declaredVersion : bundle.declaredVersion;
    assert.equal(audit.dependencies[name], spec, 'Audit/version drift: ' + name);
    const locked = lock.packages['node_modules/' + name];
    assert.equal(locked?.version, bundle.declaredVersion, 'Audit lock version drift: ' + name);
    assert.equal(locked.license, bundle.license, 'Vendor license drift: ' + name);
    assert.match(locked.integrity || '', /^sha512-/, 'Missing npm integrity: ' + name);
    assert.match(bundle.sha256, /^[a-f0-9]{64}$/, 'Missing shipped SHA-256: ' + name);
    const assetPath = 'public/' + bundle.asset;
    if (name === 'satellite.js') {
      const bytes = await readFile(path.join(root, assetPath));
      assert.equal(sha256(bytes), bundle.sha256, 'Shipped vendor bytes changed: ' + name);
    } else {
      assert.equal(
        packedAssets.get(assetPath)?.sha256,
        bundle.sha256,
        'Packed vendor checksum/version drift: ' + name,
      );
    }
    if (release) {
      const bytes = await readFile(path.join(root, 'build/release/assets/' + bundle.asset));
      assert.equal(sha256(bytes), bundle.sha256, 'Release vendor bytes changed: ' + name);
      if (bundle.versionEvidence === 'bundle-version-banner') {
        const firstLine = bytes.toString('utf8').split('\n', 1)[0];
        assert.equal(
          firstLine,
          '// Version ' +
            bundle.declaredVersion +
            ' globe.gl - https://github.com/vasturiano/globe.gl',
          'Embedded bundle version differs from audit: ' + name,
        );
      }
    }
    assert(
      ['audit-declaration-only', 'bundle-version-banner', 'upstream-byte-identical'].includes(
        bundle.versionEvidence,
      ),
      'Missing version evidence classification: ' + name,
    );
    results.push({
      name,
      version: bundle.declaredVersion,
      sha256: bundle.sha256,
      evidence: bundle.versionEvidence,
    });
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = await verifyVendorAudit({ release: process.argv.includes('--release') });
  for (const bundle of results) {
    console.log(
      'Vendor audit pinned:',
      bundle.name,
      bundle.version,
      bundle.sha256,
      '(' + bundle.evidence + ')',
    );
  }
  if (results.some((bundle) => bundle.evidence === 'audit-declaration-only'))
    console.warn('Upstream byte/version identity is still unverified for docx and satellite.js');
}
