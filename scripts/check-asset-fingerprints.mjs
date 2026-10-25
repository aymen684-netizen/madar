import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createAssetManifest } from './fingerprint-assets.mjs';

test('fingerprints follow file bytes, additions and deletions, independent of timestamps', async () => {
  const temporary = await mkdtemp(new URL('../build/fingerprint-test-', import.meta.url));
  try {
    await mkdir(path.join(temporary, 'workers'));
    await writeFile(path.join(temporary, 'z.css'), 'body {}');
    await writeFile(path.join(temporary, 'workers/worker.js'), 'importScripts("../core.js");');
    await writeFile(path.join(temporary, 'core.js'), Buffer.from([0, 1, 255]));
    await writeFile(path.join(temporary, 'empty'), '');
    const first = await createAssetManifest(temporary);
    assert.deepEqual(Object.keys(first.assets), ['core.js', 'empty', 'workers/worker.js', 'z.css']);
    assert.equal(
      first.assets.empty.sha256,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    assert.equal(first.assets['core.js'].bytes, 3);
    await utimes(path.join(temporary, 'core.js'), new Date(0), new Date(0));
    assert.equal(JSON.stringify(await createAssetManifest(temporary)), JSON.stringify(first));
    await writeFile(path.join(temporary, 'core.js'), Buffer.from([0, 2, 255]));
    const changed = await createAssetManifest(temporary);
    assert.notEqual(changed.assets['core.js'].sha256, first.assets['core.js'].sha256);
    assert.equal(changed.assets['core.js'].bytes, first.assets['core.js'].bytes);
    for (const name of ['empty', 'workers/worker.js', 'z.css'])
      assert.deepEqual(changed.assets[name], first.assets[name]);
    await writeFile(path.join(temporary, 'added.json'), '{}');
    await rm(path.join(temporary, 'z.css'));
    const updated = await createAssetManifest(temporary);
    assert(updated.assets['added.json']);
    assert(!Object.hasOwn(updated.assets, 'z.css'));
    await symlink(path.join(temporary, 'core.js'), path.join(temporary, 'linked.js'));
    await assert.rejects(createAssetManifest(temporary), /Unsupported public asset: linked.js/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('build manifest matches every prepared public file, including generated assets and workers', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../build/asset-manifest.json', import.meta.url)),
  );
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.algorithm, 'sha256');
  const actual = await createAssetManifest(new URL('../public/', import.meta.url));
  assert.deepEqual(manifest, actual);
  for (const name of [
    'index.html',
    'network-resources.js',
    'data/mission-profiles.json',
    'data/satellite-metadata-compact.json',
    'vendor/globe.min.js',
    'analysis-worker.js',
    'assets/earth-detail.jpg',
  ])
    assert(Object.hasOwn(manifest.assets, name), name);
  for (const [name, entry] of Object.entries(manifest.assets)) {
    const bytes = await readFile(new URL('../public/' + name, import.meta.url));
    assert.equal(entry.bytes, bytes.length, name);
    assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'), name);
  }
});
