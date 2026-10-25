import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createAssetManifest } from './fingerprint-assets.mjs';
import { fingerprintHtml, prepareHtmlPreview } from './prepare-html-preview.mjs';

test('HTML attributes receive exact hashes without changing comments, text, URLs or attribute values', () => {
  const hash = 'a'.repeat(64);
  const manifest = { assets: { 'app.js': { sha256: hash } } };
  const source = `<!-- <script src="missing.js"></script> -->
<script SRC='app.js?v=8'>const template = '<a href="missing.js">';</script>
<a title='href="missing.js"' data-href="missing.js" href="./app.js#part">link</a>
<img src=app.js?v=8><a href="https://example.test/app.js?v=2">external</a>
<a href="#part">anchor</a><a href="./">home</a><img src="data:image/png;base64,AAA">
<textarea><img src="missing.js"></textarea>`;
  const result = fingerprintHtml(source, manifest);
  assert.equal(result.references.length, 3);
  assert(result.html.includes(`SRC='app.js?v=${hash}'`));
  assert(result.html.includes(`href="./app.js?v=${hash}#part"`));
  assert(result.html.includes(`src="app.js?v=${hash}"`));
  assert.equal(fingerprintHtml(result.html, manifest).html, result.html);
  for (const text of [
    '<!-- <script src="missing.js"></script> -->',
    `const template = '<a href="missing.js">';`,
    `title='href="missing.js"' data-href="missing.js"`,
    'href="https://example.test/app.js?v=2"',
    '<textarea><img src="missing.js"></textarea>',
  ])
    assert(result.html.includes(text), text);
  for (const prefix of ['https://madar.test/', 'https://madar.test/project/']) {
    const target = new URL(result.references[0].target, prefix);
    assert.equal(target.pathname, new URL('app.js', prefix).pathname);
    assert.equal(target.searchParams.get('v'), hash);
  }
  assert.throws(() => fingerprintHtml('<script src="missing.js">', manifest), /Missing HTML asset/);
  assert.throws(
    () => fingerprintHtml('<a href="app.js?v=1&q=private">', manifest),
    /Unexpected asset query/,
  );
  assert.throws(() => fingerprintHtml('<img src="../app.js">', manifest), /outside page directory/);
  assert.throws(
    () => fingerprintHtml('<img src="%2e%2e/app.js">', manifest),
    /outside page directory/,
  );
});

test('preview is deterministic, preserves sources, follows file changes and rejects stale maps', async () => {
  const temporary = await mkdtemp(new URL('../build/html-test-', import.meta.url));
  try {
    const root = path.join(temporary, 'source'),
      output = path.join(temporary, 'preview');
    await mkdir(root);
    const html = '<link href="app.css?v=1"><script src="app.js?v=1"></script>';
    await writeFile(path.join(root, 'index.html'), html);
    await writeFile(path.join(root, 'app.css'), 'body {}');
    await writeFile(path.join(root, 'app.js'), 'new Worker("worker.js?v=1");');
    await writeFile(path.join(root, 'worker.js'), 'importScripts("app.js?v=1");');
    const manifest = await createAssetManifest(root);
    const first = await prepareHtmlPreview(root, output, manifest);
    assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), html);
    assert.deepEqual(await createAssetManifest(root), manifest);
    assert.deepEqual((await prepareHtmlPreview(root, output, manifest)).manifest, first.manifest);
    await writeFile(path.join(output, 'stale.js'), 'old');
    await writeFile(path.join(root, 'app.css'), 'body { color: red; }');
    await assert.rejects(prepareHtmlPreview(root, output, manifest), /Asset manifest is stale/);
    const updated = await prepareHtmlPreview(root, output, await createAssetManifest(root));
    assert.notEqual(updated.references[0].target, first.references[0].target);
    assert.equal(updated.references[1].target, first.references[1].target);
    assert(!Object.hasOwn(updated.manifest.assets, 'stale.js'));
    for (const name of ['app.js', 'worker.js'])
      assert.deepEqual(updated.manifest.assets[name], manifest.assets[name]);
    await assert.rejects(
      prepareHtmlPreview(root, path.join(root, 'preview'), manifest),
      /must be separate/,
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('real page references point to copied bytes with unchanged script order and no numeric versions', async () => {
  const root = path.resolve('public'),
    output = path.resolve('build/html-preview');
  const manifest = JSON.parse(await readFile('build/asset-manifest.json'));
  const result = await prepareHtmlPreview(root, output, manifest);
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  const html = await readFile(path.join(output, 'index.html'), 'utf8');
  assert(!/\?v=\d+(?:["'])/.test(html));
  const scripts = (text) => [...text.matchAll(/<script\b[^>]*\bsrc="([^"?]+)/g)].map((m) => m[1]);
  assert.deepEqual(scripts(html), scripts(source));
  assert.equal(result.references.filter((r) => /\?v=\d+$/.test(r.source)).length, 84);
  for (const reference of result.references) {
    const bytes = await readFile(path.join(output, reference.asset));
    assert.equal(
      new URL(reference.target, 'https://madar.test/').searchParams.get('v'),
      createHash('sha256').update(bytes).digest('hex'),
    );
  }
  const changed = Object.keys(manifest.assets).filter(
    (name) => manifest.assets[name].sha256 !== result.manifest.assets[name].sha256,
  );
  assert.deepEqual(changed, ['index.html']);
});
