// Read-only provenance and compatibility probe for docx@9.14.0.
// It replaces only a generated/ignored file in the ephemeral CI checkout.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { validDocx } from '../worker/docx-validation.js';

const require = createRequire(import.meta.url);
const { docxXml } = require('./check-browser-inventory.cjs');
const expectedIntegrity =
  'sha512-3QGcC5CUBvyYZsFPpuKy9Mv1j4BOoKjH9angjjDzrqx2GnnXH6ogt/CUVQ3gexN46yKDsl8gcOFNl0jjvlDxhg==';
const audit = JSON.parse(fs.readFileSync('tools/vendor-audit/shipped-bundles.json', 'utf8'));
const pinned = audit.bundles.find((bundle) => bundle.package === 'docx');
assert.equal(pinned?.declaredVersion, '9.5.1', 'Unexpected shipped Word baseline');
const currentFile = 'public/vendor/docx.js';
const baseline = fs.readFileSync(currentFile);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(baseline), pinned.sha256, 'The shipped Word baseline was modified');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'madar-docx-9-14-probe-'));
const outputDir = 'test-results';
fs.mkdirSync(outputDir, { recursive: true });
const packed = JSON.parse(
  execFileSync(
    'npm',
    ['pack', 'docx@9.14.0', '--json', '--pack-destination', work, '--ignore-scripts', '--no-audit', '--no-fund'],
    { encoding: 'utf8', timeout: 180000 },
  ),
)[0];
assert.equal(packed.name, 'docx');
assert.equal(packed.version, '9.14.0');
const tarball = fs.readFileSync(path.join(work, packed.filename));
const actualIntegrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64');
assert.equal(actualIntegrity, expectedIntegrity, 'The npm tarball does not match the locked registry integrity');
execFileSync('tar', ['-xzf', path.join(work, packed.filename), '-C', work], {
  timeout: 30000,
});
const packageRoot = path.join(work, 'package');
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
assert.equal(manifest.version, '9.14.0');
assert.ok(Number.parseInt(process.versions.node, 10) >= 16);
const candidateFile = path.join(packageRoot, 'dist/index.umd.cjs');
assert.ok(fs.existsSync(candidateFile), 'Version 9.14.0 has no classic-script UMD entry');
const candidate = fs.readFileSync(candidateFile);

async function probe(bytes, version) {
  const root = { Blob, TextEncoder, TextDecoder, Uint8Array, URL, setTimeout, clearTimeout };
  root.self = root;
  root.window = root;
  vm.createContext(root);
  vm.runInContext(bytes.toString('utf8'), root, { filename: version + '.umd.cjs', timeout: 30000 });
  const D = root.docx;
  assert.ok(D && typeof D === 'object', 'UMD bundle did not create the docx global: ' + version);
  for (const symbol of [
    'Document', 'Paragraph', 'TextRun', 'Table', 'TableRow', 'TableCell',
    'ImageRun', 'ExternalHyperlink', 'Footer', 'PageNumber',
    'AlignmentType', 'WidthType', 'PageOrientation', 'Packer',
  ])
    assert.ok(D[symbol], 'Missing public Word API ' + symbol + ' in ' + version);
  assert.equal(typeof D.Packer.toBlob, 'function');

  // Madar's English translation extends three docx constructors.
  for (const name of ['Paragraph', 'TextRun', 'Table']) {
    const Subclass = class extends D[name] {};
    assert.equal(Object.getPrototypeOf(Subclass), D[name]);
  }

  const results = [];
  for (const language of ['ar', 'en']) {
    const rtl = language === 'ar';
    const label = rtl ? 'مدار تقرير تجريبي' : 'Madar Word compatibility test';
    const start = Date.now();
    const cells = [label, 'NORAD 100001'].map((word) =>
      new D.TableCell({
        children: [
          new D.Paragraph({
            bidirectional: rtl,
            children: [new D.TextRun({ text: word, rightToLeft: rtl })],
          }),
        ],
      }),
    );
    const word = new D.Document({
      creator: 'Madar',
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 12240,
                height: 15840,
                orientation: D.PageOrientation.LANDSCAPE,
              },
            },
          },
          footers: {
            default: new D.Footer({
              children: [
                new D.Paragraph({
                  children: [new D.TextRun({ children: [D.PageNumber.CURRENT] })],
                }),
              ],
            }),
          },
          children: [
            new D.Paragraph({ bidirectional: rtl, children: [new D.TextRun({ text: label, rightToLeft: rtl })] }),
            new D.Table({
              visuallyRightToLeft: rtl,
              width: { size: 8000, type: D.WidthType.DXA },
              columnWidths: [4000, 4000],
              rows: [new D.TableRow({ tableHeader: true, children: cells })],
            }),
            new D.Paragraph({
              children: [
                new D.ExternalHyperlink({
                  link: 'https://example.com/report',
                  children: [new D.TextRun({ text: 'Source' })],
                }),
              ],
            }),
          ],
        },
      ],
    });
    const blob = await D.Packer.toBlob(word);
    const output = Buffer.from(await blob.arrayBuffer());
    assert.ok(validDocx(output), 'Invalid or unsafe DOCX: ' + version + ' ' + language);
    const xml = docxXml(output);
    assert.ok(xml.includes(label), 'Missing report text: ' + version + ' ' + language);
    assert.ok(xml.includes('NORAD 100001'), 'Missing table row');
    assert.ok(xml.includes('<w:tbl>'), 'Missing table');
    results.push({ language, bytes: output.length, elapsedMs: Date.now() - start });
  }
  return { version, sha256: hash(bytes), bundleBytes: bytes.length, results };
}

const baselineResult = await probe(baseline, '9.5.1');
const candidateResult = await probe(candidate, '9.14.0');
const evidence = {
  source: 'npm docx@9.14.0',
  pinnedIntegrity: expectedIntegrity,
  sha256: hash(candidate),
  baseline: baselineResult,
  candidate: candidateResult,
  stage: 'UMD API, bilingual DOCX and document validation; before full application regressions',
};
fs.writeFileSync(path.join(outputDir, 'docx-9-14-probe.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));

// Only change this ignored generated file inside the disposable CI checkout.
// The repository's packed manifest, main, release and deployed assets stay untouched.
fs.copyFileSync(candidateFile, currentFile);
console.log('PASS: pinned docx 9.14.0 UMD candidate staged locally for existing Word regression scripts');
