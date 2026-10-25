import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createAssetManifest } from './fingerprint-assets.mjs';
import { javascriptAssets, prepareRuntimePreview } from './prepare-runtime-preview.mjs';

test('JavaScript parsing preserves comments, regexes, templates and external URLs', async () => {
  const source = `// new Worker('missing.js?v=1')
/* importScripts('core.js?v=2') */
const regex = /core.js/;
const html = '<script src="core.js?v=2"></script>';
const remote = 'https://example.test/core.js?v=2';
const template = \`<img src="core.js">\`;
new Worker('core.js?v=2'); importScripts('core.js');`;
  const assets = { 'core.js': {} };
  const references = await javascriptAssets(source, assets, 'main.js');
  assert.equal(references.length, 2);
  assert.deepEqual(
    references.map((r) => r.source),
    ['core.js?v=2', 'core.js'],
  );
  for (const source of [
    "fetch('missing.json?v=1')",
    "fetch('core.js?v=2&q=private')",
    "fetch('core.js?v=2&v=3')",
  ])
    await assert.rejects(javascriptAssets(source, assets, 'main.js'), /Unresolved|Unexpected/);
});

test('dependency changes propagate through workers to HTML; stale maps and cycles fail safely', async () => {
  await mkdir('build', { recursive: true });
  const temporary = await mkdtemp(path.resolve('build/runtime-test-'));
  try {
    const root = path.join(temporary, 'source'),
      output = path.join(temporary, 'preview');
    await mkdir(root);
    for (const [name, text] of Object.entries({
      'index.html': '<script src="main.js?v=1"></script>',
      'main.js': "new Worker('worker.js?v=1');",
      'worker.js': "importScripts('core.js?v=1');",
      'core.js': 'self.version = 1;',
      'other.js': 'self.unrelated = true;',
      'network-resources.js': 'globalThis.MadarNetworkResources={"files":[],"groups":[]};\n',
    }))
      await writeFile(path.join(root, name), text);
    const manifest = await createAssetManifest(root);
    const first = await prepareRuntimePreview(root, output, manifest);
    assert.deepEqual(await prepareRuntimePreview(root, output, manifest), first);
    assert.deepEqual(await createAssetManifest(root), manifest, 'sources remain unchanged');
    await writeFile(path.join(root, 'core.js'), 'self.version = 2;');
    await assert.rejects(prepareRuntimePreview(root, output, manifest), /Asset manifest is stale/);
    const second = await prepareRuntimePreview(root, output, await createAssetManifest(root));
    for (const name of ['core.js', 'worker.js', 'main.js', 'index.html'])
      assert.notEqual(
        second.manifest.assets[name].sha256,
        first.manifest.assets[name].sha256,
        name,
      );
    assert.deepEqual(second.manifest.assets['other.js'], first.manifest.assets['other.js']);
    await writeFile(path.join(root, 'core.js'), "importScripts('worker.js');");
    await assert.rejects(
      prepareRuntimePreview(root, output, await createAssetManifest(root)),
      /dependency cycle/,
    );
    assert.deepEqual(
      await createAssetManifest(output),
      second.manifest,
      'failed build preserves last valid preview',
    );
    await assert.rejects(
      prepareRuntimePreview(root, path.join(root, 'nested'), manifest),
      /must be separate/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('every real static and dynamic version matches final bytes; vendor bytes and script order survive', async () => {
  const manifest = JSON.parse(await readFile('build/asset-manifest.json'));
  const result = await prepareRuntimePreview('public', 'build/runtime-preview', manifest);
  assert.deepEqual(
    await prepareRuntimePreview('public', 'build/runtime-preview', manifest),
    result,
  );
  for (const reference of result.references) {
    const url = new URL(reference.target, 'https://madar.test/project/');
    assert.equal(
      url.searchParams.get('v'),
      result.manifest.assets[reference.asset].sha256,
      reference.from + ': ' + reference.source,
    );
    assert.equal(url.pathname, '/project/' + reference.asset);
  }
  for (const [name, hash] of Object.entries(result.dynamicVersions))
    assert.equal(hash, result.manifest.assets[name].sha256, name);
  for (const name of Object.keys(manifest.assets).filter((name) => name.startsWith('vendor/')))
    assert.deepEqual(result.manifest.assets[name], manifest.assets[name], name);
  const scripts = (text) => [...text.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].map((m) => m[1]);
  assert.deepEqual(
    scripts(await readFile('build/runtime-preview/index.html', 'utf8')),
    scripts(await readFile('public/index.html', 'utf8')),
  );
  for (const name of Object.keys(result.manifest.assets).filter(
    (name) => name.endsWith('.js') && !name.startsWith('vendor/'),
  ))
    assert(!/\?v=\d+['"`]/.test(await readFile('build/runtime-preview/' + name, 'utf8')), name);
  assert(result.references.some((r) => r.from === 'map-fleet.js' && r.asset === 'fleet-passes.js'));
  assert(
    result.references.some(
      (r) => r.from === 'program-extras.js' && r.asset === 'data/program-overview-en.json',
    ),
  );
});
