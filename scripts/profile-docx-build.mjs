// Isolated Node VM diagnostic. This does not modify production or release assets.
// Run each UMD version in a separate Node process to distinguish parsing, building
// the document object graph, and serializing DOCX through Packer.toBlob.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import vm from 'node:vm';
import { validDocx } from '../worker/docx-validation.js';

const [bundlePath, version, outputPath] = process.argv.slice(2);
assert(
  bundlePath && version && outputPath,
  'Usage: node scripts/profile-docx-build.mjs <UMD file> <version> <JSON output>',
);
const bytes = fs.readFileSync(bundlePath);
const sandbox = { Blob, TextEncoder, TextDecoder, Uint8Array, URL, setTimeout, clearTimeout };
sandbox.self = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
const parseStart = performance.now();
vm.runInContext(bytes.toString('utf8'), sandbox, { filename: bundlePath, timeout: 30000 });
const parseMs = performance.now() - parseStart;
const D = sandbox.docx;
assert(D?.Packer?.toBlob, 'UMD docx global or Packer.toBlob is missing');

function buildDocument(language) {
  const rtl = language === 'ar';
  const label = rtl ? 'تقرير مدار واختبار الأداء' : 'Madar Word performance probe';
  const rows = Array.from(
    { length: 500 },
    (_, index) =>
      new D.TableRow({
        cantSplit: true,
        children: Array.from(
          { length: 6 },
          (_, col) =>
            new D.TableCell({
              children: [
                new D.Paragraph({
                  bidirectional: rtl,
                  alignment: D.AlignmentType.START,
                  children: [
                    new D.TextRun({
                      text:
                        col === 0 ? 'NORAD ' + (100000 + index) : label + ' ' + index + ' ' + col,
                      rightToLeft: rtl,
                      font: 'Arial',
                      size: 19,
                    }),
                  ],
                }),
              ],
            }),
        ),
      }),
  );
  return new D.Document({
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
        children: [
          new D.Paragraph({ text: label, bidirectional: rtl }),
          new D.Table({
            visuallyRightToLeft: rtl,
            width: { size: 14400, type: D.WidthType.DXA },
            columnWidths: [2400, 2400, 2400, 2400, 2400, 2400],
            rows: [
              new D.TableRow({
                tableHeader: true,
                children: Array.from(
                  { length: 6 },
                  (_, col) =>
                    new D.TableCell({
                      children: [new D.Paragraph({ text: label + ' ' + col, bidirectional: rtl })],
                    }),
                ),
              }),
              ...rows,
            ],
          }),
        ],
      },
    ],
  });
}

async function sample(language) {
  const buildStart = performance.now();
  const doc = buildDocument(language);
  const buildMs = performance.now() - buildStart;
  const packStart = performance.now();
  const blob = await D.Packer.toBlob(doc);
  const packMs = performance.now() - packStart;
  const output = new Uint8Array(await blob.arrayBuffer());
  assert(validDocx(output), 'Generated DOCX is invalid: ' + version + ' ' + language);
  return { buildMs, packMs, docxBytes: output.length };
}

const result = {
  version,
  bundleBytes: bytes.length,
  parseMs,
  runsPerLanguage: 3,
  samples: {},
};
for (const language of ['ar', 'en']) {
  // Avoid reporting first-use initialization as a steady-state sample.
  await sample(language);
  result.samples[language] = [];
  for (let i = 0; i < result.runsPerLanguage; i++) {
    result.samples[language].push(await sample(language));
  }
}
result.peakRssKiB = Math.round(process.resourceUsage().maxRSS);
result.heapUsedKiB = Math.round(process.memoryUsage().heapUsed / 1024);
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
