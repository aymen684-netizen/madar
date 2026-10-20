import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { validDocx } from '../worker/docx-validation.js';
const { docxXml } = createRequire(import.meta.url)('./check-browser-inventory.cjs');
let posted = 0;
class WordWorker {
  constructor() {
    const worker = this;
    this.context = { Blob, TextEncoder, TextDecoder, URL, setTimeout, clearTimeout };
    this.context.self = this.context;
    this.context.postMessage = (message) => {
      if (!worker.stopped) queueMicrotask(() => worker.onmessage?.({ data: message }));
    };
    vm.createContext(this.context);
    this.context.importScripts = (...paths) => {
      for (const path of paths) {
        const file = path.split('?')[0];
        if (['vendor/docx.js', 'inventory-zip.js', 'report-layout.js'].includes(file))
          vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), this.context);
      }
    };
    vm.runInContext(fs.readFileSync('public/inventory-word-worker.js', 'utf8'), this.context);
  }
  postMessage(data) {
    posted++;
    this.context.onmessage({ data });
  }
  terminate() {
    this.stopped = true;
  }
}
const dictionary = JSON.parse(fs.readFileSync('public/data/en.json')),
  fake = { nodeType: 1, childNodes: [], matches: () => false, getAttribute: () => null },
  c = {
    addEventListener() {},
    Intl,
    URL,
    Blob,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    setTimeout,
    clearTimeout,
    Worker: WordWorker,
    DOMException,
    fetch: async () => ({ ok: true, json: async () => dictionary }),
    localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    CustomEvent: class {},
    Event: class {},
    document: { documentElement: fake, dispatchEvent() {} },
  };
c.window = c;
c.self = c;
vm.createContext(c);
for (const file of [
  'report-insights.js',
  'report-archive.js',
  'report-brief.js',
  'report-layout.js',
  'report-document.js',
  'observer-report.js',
  'i18n.js',
  'observer-word.js',
])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), c);
await c.MadarI18n.ready;
c.ReportLayout.brand = async () => null;
const t = Date.parse('2026-10-20T15:00:00Z'),
  count = Number(process.env.MADAR_WORD_STRESS_ROWS || 1001),
  rows = Array.from({ length: count }, (_, i) => ({
    id: 100000 + (i % 16464),
    name: 'WORD PASS ' + i,
    entry: t + i * 1000,
    exit: t + i * 1000 + 60000,
    duration: 60,
    peakTime: t + i * 1000 + 30000,
    elevation: 45,
    azimuth: 90,
    range: 1000,
    entryAzimuth: 80,
    exitAzimuth: 100,
    epoch: t,
  })),
  report = {
    observer: { name: 'QA', lat: 24.7136, lon: 46.6753, height: 0, minElevation: 10 },
    start: t,
    end: t + 86400000,
    offset: 3,
    zoneLabel: 'UTC+03:00',
    step: 10,
    scopeName: 'جميع الأقمار النشطة',
    result: {
      rows,
      total: 16768,
      unique: Math.min(count, 16464),
      invalid: 3,
      quality: {
        total: 16768,
        recent: 16768,
        aging: 0,
        old: 0,
        unknown: 0,
        fetched: 0,
        sources: {},
        snapshots: [],
      },
    },
  };
for (const language of ['ar', 'en']) {
  c.MadarI18n.setLanguage(language);
  const began = Date.now(),
    progress = [],
    result = await c.ObserverWord.start(report, (done) => progress.push(done)).promise;
  assert.equal(result.type, 'done');
  assert.equal(result.extension, 'zip');
  assert.equal(result.files, Math.ceil(count / 500));
  assert.equal(progress.at(-1), count);
  const bytes = Buffer.from(await result.blob.arrayBuffer());
  let offset = 0,
    files = 0,
    index = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const size = bytes.readUInt32LE(offset + 18),
      length = bytes.readUInt16LE(offset + 26),
      extra = bytes.readUInt16LE(offset + 28),
      name = bytes.subarray(offset + 30, offset + 30 + length).toString(),
      start = offset + 30 + length + extra,
      body = bytes.subarray(start, start + size);
    if (name.endsWith('.docx')) {
      assert(name.startsWith('madar-observer-passes-'));
      assert(validDocx(body), name);
      const xml = docxXml(body),
        tableRows = [...xml.matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].slice(1);
      assert(tableRows.length <= 500);
      assert(
        xml.includes(
          language === 'en'
            ? 'The summary covers the full observing period'
            : 'الملخص يصف كامل فترة الرصد',
        ),
      );
      assert(xml.includes(String(count)), 'summary describes the complete report');
      if (language === 'en')
        assert(!/[\u0620-\u064a]/.test(xml), 'English bundle is fully translated');
      for (const row of tableRows) {
        assert.equal([...row[0].matchAll(/<w:tc(?:\s[^>]*)?>/g)].length, 6);
        const pass = row[0].match(/WORD PASS (\d+)/);
        assert.equal(Number(pass?.[1]), index++, 'each pass appears exactly once in order');
      }
      files++;
    }
    offset = start + size;
  }
  assert.equal(files, Math.ceil(count / 500));
  assert.equal(index, count);
  console.log(
    JSON.stringify({
      language,
      passes: count,
      documents: files,
      bytes: bytes.length,
      elapsedMs: Date.now() - began,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }),
  );
}
const previous = posted,
  cancelled = c.ObserverWord.start(report);
cancelled.cancel();
await assert.rejects(cancelled.promise, { name: 'AbortError' });
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(posted, previous, 'cancellation stops preparation before posting the payload');
console.log(
  'PASS: bounded bilingual observer Word bundles preserve every pass, six columns, full-scope summaries, ZIP/DOCX structure and preparation cancellation',
);
