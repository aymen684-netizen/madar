import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { verifyVendorAudit } from './check-vendor-audit.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'madar-vendor-audit-'));
  const files = [
    'tools/vendor-audit/shipped-bundles.json',
    'tools/vendor-audit/package.json',
    'tools/vendor-audit/package-lock.json',
    'packed/manifest.json',
    'public/vendor/satellite.min.js',
  ];
  try {
    for (const file of files) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await cp(file, path.join(root, file));
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('the audit is pinned to the four shipped bundle identities', async () => {
  await fixture(async (root) => {
    const bundles = await verifyVendorAudit({ root });
    assert.equal(bundles.length, 4);
    assert(bundles.some((bundle) => bundle.evidence === 'audit-declaration-only'));
  });
});

test('manifest-only version upgrades fail before npm audit', async () => {
  await fixture(async (root) => {
    const file = path.join(root, 'tools/vendor-audit/package.json');
    const manifest = JSON.parse(await readFile(file));
    manifest.dependencies.docx = '9.14.0';
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(verifyVendorAudit({ root }), /Audit\/version drift|Audit lock root/);
  });
});

test('packed checksum changes are rejected', async () => {
  await fixture(async (root) => {
    const file = path.join(root, 'packed/manifest.json');
    const manifest = JSON.parse(await readFile(file));
    manifest.find((entry) => entry.target === 'public/vendor/docx.js').sha256 = '0'.repeat(64);
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(verifyVendorAudit({ root }), /Packed vendor checksum/);
  });
});

test('tracked satellite bytes cannot drift silently', async () => {
  await fixture(async (root) => {
    const file = path.join(root, 'public/vendor/satellite.min.js');
    await writeFile(file, Buffer.concat([await readFile(file), Buffer.from('\n// altered')]));
    await assert.rejects(verifyVendorAudit({ root }), /Shipped vendor bytes changed/);
  });
});
