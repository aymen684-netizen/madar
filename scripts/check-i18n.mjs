import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const data = JSON.parse(fs.readFileSync('public/data/en.json')),
  doc = { nodeType: 1, childNodes: [], matches: () => false, getAttribute: () => null };
const c = {
  fetch: async () => ({ ok: true, json: async () => data }),
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class {
    observe() {}
  },
  CustomEvent: class {},
  Event: class {},
  document: { documentElement: doc, dispatchEvent() {} },
};
c.window = c;
vm.createContext(c);
vm.runInContext(fs.readFileSync('public/i18n.js', 'utf8'), c);
await c.MadarI18n.ready;
const I = c.MadarI18n;
assert.equal(I.translate('إنشاء التقرير', 'en'), 'Generate report');
assert.equal(
  I.translate('العناصر قريبة زمنيًا من وقت العرض', 'en'),
  'Elements are close to display time',
);
assert(!I.translate('زمن غير منشور', 'en').includes('From'));
assert.equal(I.translate('عرض 12 من 50 نتيجة', 'en'), 'Showing 12 of 50 results');
assert.equal(I.translate('عرض 10.2°، طول -3.4°', 'en'), 'Latitude 10.2°, longitude -3.4°');
assert.equal(I.translate('مدار · تقارير 34', 'en'), 'Madar · Reports 34');
const n = { nodeType: 3, nodeValue: 'إنشاء التقرير', parentElement: { closest: () => false } };
I.scan(n);
I.setLanguage('en');
I.scan(n);
assert.equal(n.nodeValue, 'Generate report');
assert.equal(I.original({ nodeType: 1, childNodes: [n] }), 'إنشاء التقرير');
I.setLanguage('ar');
I.scan(n);
assert.equal(n.nodeValue, 'إنشاء التقرير');
I.setLanguage('en');
n.nodeValue = 'جارٍ تجهيز Word…';
I.scan(n);
assert.equal(n.nodeValue, 'Preparing Word…');
I.setLanguage('ar');
I.scan(n);
assert.equal(n.nodeValue, 'جارٍ تجهيز Word…');
class Base {
  constructor(options) {
    this.options = options;
  }
}
const D = {
  Paragraph: Base,
  TextRun: Base,
  Table: Base,
  AlignmentType: { RIGHT: 'right', LEFT: 'left' },
};
I.setLanguage('en');
const L = I.wordLibrary(D);
assert.equal(
  new L.Paragraph({ text: 'المهمة', bidirectional: true, alignment: 'right' }).options.text,
  'Mission',
);
assert.equal(new L.Paragraph({ alignment: 'right' }).options.alignment, 'left');
assert.equal(new L.Table({ visuallyRightToLeft: true }).options.visuallyRightToLeft, false);
I.setLanguage('ar');
assert.equal(I.wordLibrary(D), D);
console.log(
  'PASS: bilingual text and dynamic numbers, word boundaries, reversible mutations and Word writing direction',
);

assert(
  !I.translate('تواريخ النسخ الاحتياطية المستخدمة: 2026-10-13، 2026-10-16.', 'en').match(
    /[\u0620-\u064a]/,
  ),
);

// Translation must follow displayed words, not the source formatter's wrapping.
const inventoryIntro =
  'تقرير بالأقمار المنسوبة إلى كل دولة أو جهة في الفهرس العام، مع تاريخ الإطلاق ورقم القمر والمدار والمهمة وتوثيقها.';
const wrappedIntro = inventoryIntro.replaceAll(' ', '\n    ');
assert.equal(I.translate(wrappedIntro, 'en'), I.translate(inventoryIntro, 'en'));
assert(!/[\u0620-\u064a]/.test(I.translate(wrappedIntro, 'en')));
assert.equal(I.translate(wrappedIntro, 'ar'), wrappedIntro);
const dynamicLine = 'عناصر ضمن 24 ساعة من كامل الفترة 12 / 20';
assert.equal(
  I.translate(dynamicLine.replaceAll(' ', '\n  '), 'en').replace(/\s+/g, ' '),
  I.translate(dynamicLine, 'en'),
);
assert(
  I.translate('CUSTOM-LINE-1\nCUSTOM-LINE-2 المهمة', 'en').includes('\n'),
  'Unknown line structure remains intact',
);
console.log(
  'PASS: wrapped static and dynamic UI phrases translate completely without flattening unrelated line breaks or changing Arabic originals',
);

assert(!/[\u0620-\u064a]/.test(I.translate(dynamicLine.replaceAll(' ', '\n  '), 'en')));
