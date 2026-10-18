import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const nodes = new Map();
for (const kind of ['report', 'analysis', 'observer'])
  for (const suffix of ['status', 'download', 'share'])
    nodes.set(kind + '-' + suffix, {
      textContent: 'unchanged',
      href: 'blob:test',
      click() {
        this.clicks = (this.clicks || 0) + 1;
      },
    });
const root = {
  Blob,
  File,
  btoa,
  navigator: {},
  document: { getElementById: (id) => nodes.get(id) || null },
  StateStore: { put: async () => {}, remove: async () => {} },
  location: { hostname: 'test' },
};
root.window = root;
vm.runInNewContext(fs.readFileSync('public/word-delivery.js', 'utf8'), root);
for (const kind of ['report', 'analysis', 'observer']) {
  await root.WordDelivery.attach(kind, new Blob(['test']), 'test.docx');
  await root.WordDelivery.share(kind);
  assert.match(nodes.get(kind + '-status').textContent, /غير مدعومة/);
  assert.equal(nodes.get(kind + '-download').clicks, 1);
  for (const other of ['report', 'analysis', 'observer'].filter((k) => k !== kind))
    assert.equal(nodes.get(other + '-status').textContent, 'unchanged');
  nodes.get(kind + '-status').textContent = 'unchanged';
  root.navigator.canShare = () => true;
  root.navigator.share = async () => {};
  await root.WordDelivery.share(kind);
  assert.match(nodes.get(kind + '-status').textContent, /تم فتح/);
  root.navigator.share = async () => {
    throw Object.assign(Error(), { name: 'AbortError' });
  };
  await root.WordDelivery.share(kind);
  assert.match(nodes.get(kind + '-status').textContent, /أُغلقت/);
  root.navigator.share = async () => {
    throw Error('unavailable');
  };
  await root.WordDelivery.share(kind);
  assert.match(nodes.get(kind + '-status').textContent, /تعذّر/);
  let finish;
  root.navigator.share = () => new Promise((resolve) => (finish = resolve));
  const pending = root.WordDelivery.share(kind);
  root.WordDelivery.clear(kind);
  nodes.get(kind + '-status').textContent = 'cancelled';
  finish();
  await pending;
  assert.equal(nodes.get(kind + '-status').textContent, 'cancelled');
  nodes.get(kind + '-status').textContent = 'unchanged';
  root.navigator = {};
}
console.log(
  'PASS: report-specific sharing status, native sharing, fallback download, cancellation, errors and no stale status after clearing',
);

const privateBlob = new Blob(['private report']);
privateBlob.arrayBuffer = () => {
  throw Error('local delivery must not encode or copy the report for upload');
};
await root.WordDelivery.attach('report', privateBlob, 'private.docx');
let scripts = [];
root.document.createElement = () => ({ remove() {} });
root.document.head = { append: (s) => scripts.push(s) };
root.setTimeout = setTimeout;
root.clearTimeout = clearTimeout;
const one = root.WordDelivery.library(),
  two = root.WordDelivery.library();
assert.equal(scripts.length, 1);
assert.equal(one, two);
root.docx = { Packer: {} };
scripts[0].onload();
assert.equal(await one, root.docx);
console.log('PASS: local Word attachment avoids upload encoding and lazy Word library loads once');

let cached = {
    blob: new Blob(['old']),
    filename: 'old.docx',
    edition: '48',
    language: 'en',
    detail: 'brief',
  },
  restoredMode = 'full';
root.ReportBrief = { VERSION: '49' };
root.MadarI18n = { language: 'en' };
root.ReportLayout = {
  mode: () => restoredMode,
  setMode: (_kind, v) => (restoredMode = v === 'brief' ? 'brief' : 'full'),
};
root.StateStore.get = async () => cached;
root.StateStore.put = async (_key, value) => {
  cached = value;
};
assert.equal(await root.WordDelivery.restore('report'), null, 'old-format Word is regenerated');
cached.edition = '49';
cached.language = 'ar';
assert.equal(
  await root.WordDelivery.restore('report'),
  null,
  'a Word file in another language is regenerated',
);
cached.language = 'en';
await root.WordDelivery.restore('report');
assert.equal(restoredMode, 'brief');
assert.equal(cached.detail, 'brief');
assert.equal(cached.edition, '49');
console.log(
  'PASS: cached Word restores its content mode and rejects older editions or another language',
);

// Use the shipped edition against a pre-translation-review saved file, not a mock version.
vm.runInNewContext(fs.readFileSync('public/report-brief.js', 'utf8'), root);
for (const language of ['ar', 'en']) {
  root.MadarI18n.language = language;
  for (const kind of ['report', 'analysis']) {
    cached = {
      blob: new Blob(['pre-review Word']),
      filename: 'saved.docx',
      edition: '52',
      language,
      detail: 'brief',
    };
    root.WordDelivery.clear(kind);
    assert.equal(await root.WordDelivery.restore(kind), null);
    assert.equal(nodes.get(kind + '-share').hidden, true);
    cached.edition = root.ReportBrief.VERSION;
    assert(await root.WordDelivery.restore(kind));
    assert.equal(nodes.get(kind + '-share').hidden, false);
    assert.equal(cached.detail, 'brief');
  }
}
console.log(
  'PASS: shipped Word edition invalidates pre-review Arabic/English report and analysis files',
);
