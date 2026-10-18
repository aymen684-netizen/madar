import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let attributeReads = 0;
const data = JSON.parse(fs.readFileSync('public/data/en.json')),
  doc = {
    nodeType: 1,
    childNodes: [],
    matches: () => false,
    getAttribute: () => {
      attributeReads++;
      return null;
    },
  };
let regexBuilds = 0,
  observing = false;
const c = {
  RegExp: class extends RegExp {
    constructor(...args) {
      super(...args);
      regexBuilds++;
    }
  },
  fetch: async () => ({ ok: true, json: async () => data }),
  localStorage: { getItem: () => null, setItem: () => {} },
  MutationObserver: class {
    observe() {
      observing = true;
    }
    disconnect() {
      observing = false;
    }
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
assert.equal(regexBuilds, 0, 'Arabic startup does not build English fallback patterns');
assert.equal(attributeReads, 0, 'Arabic startup does not traverse the document');
assert.equal(observing, false, 'Arabic startup does not observe DOM mutations');
assert.equal(I.translate('إنشاء التقرير', 'en'), 'Generate report');
assert.equal(regexBuilds, 0, 'an exact dictionary lookup needs no fallback patterns');
assert.equal(
  I.translate('العناصر قريبة زمنيًا من وقت العرض', 'en'),
  'Elements are close to display time',
);
assert(!I.translate('زمن غير منشور', 'en').includes('From'));
assert.equal(I.translate('عرض 12 من 50 نتيجة', 'en'), 'Showing 12 of 50 results');
assert.equal(I.translate('عرض 10.2°، طول -3.4°', 'en'), 'Latitude 10.2°, longitude -3.4°');
assert.equal(I.translate('مدار · تقارير 34', 'en'), 'Madar · Reports 34');
assert.equal(I.translate('اليوم: Saturday', 'en'), 'Day: Saturday');
assert.equal(
  I.translate('عناصر UTC 2026-10-16 12:00:00 · جلب UTC 2026-10-17 00:00:00', 'en'),
  'Element epoch (UTC) 2026-10-16 12:00:00 · Retrieved at (UTC) 2026-10-17 00:00:00',
);
assert.equal(
  I.translate(
    'زاوية الذروة درجة / المسافة عند الذروة كم / سمت الدخول درجة / سمت الخروج درجة',
    'en',
  ),
  'Peak elevation (degrees) / Range at peak elevation (km) / Entry azimuth (degrees) / Exit azimuth (degrees)',
);
const precisionNote = I.translate(
  'النتائج تقديرية من العناصر المدارية المتاحة، وليست إثباتًا تاريخيًا للمرور. الحدود تقريبية من Natural Earth، والفحص على فواصل زمنية قد يفوّت مرورًا أقصر من خطوة الفحص. تُصقل أوقات الدخول والخروج إلى ثانية ضمن الفواصل المكتشفة.',
  'en',
);
assert(precisionNote.includes('one-second resolution'));
assert(precisionNote.includes('not historical evidence'));
assert(precisionNote.includes('may miss passes'));
const sharingNote = I.translate(
  'عند إيقاف التحديثات تستخدم المدارات المحفوظة أو الاحتياطية المتاحة، وقد تتصل ملفات الموقع بالاستضافة. فتح رابط خارجي أو مشاركة ملف ينقلك إلى جهة أخرى تختارها.',
  'en',
);
assert(sharingNote.includes('loading site files may still contact the hosting service'));
assert(sharingNote.includes('sharing sends the file to the app you choose'));
for (const [ar, en] of [
  ['تحقّق من عمر العناصر', 'Check the age of the orbital elements'],
  ['العناصر بعيدة زمنيًا عن وقت العرض', 'Elements are far from display time'],
])
  assert.equal(I.translate(ar, 'en'), en);
assert.equal(
  I.translate(
    'أضف قمرًا من بطاقته أو فعّل التحديد بالضغط على الخريطة. لكل قمر لون ثابت؛ تظهر المختارة حتى عند تغيير المجموعة. هذه المجموعة مستقلة عن المفضلة وتصفية الدليل ونطاق التقارير.',
    'en',
  ),
  'Add a satellite from its card or enable map selection. Each satellite keeps its color and remains displayed when you change groups. This map group is separate from favorites, catalog filters and report scope.',
);
const built = regexBuilds;
assert(built > 0);
I.translate('مدار · تقارير 35', 'en');
assert.equal(regexBuilds, built, 'fallback patterns are built once');
const n = { nodeType: 3, nodeValue: 'إنشاء التقرير', parentElement: { closest: () => false } };
I.scan(n);
I.setLanguage('en');
assert.equal(observing, true);
I.scan(n);
assert.equal(n.nodeValue, 'Generate report');
assert.equal(I.original({ nodeType: 1, childNodes: [n] }), 'إنشاء التقرير');
I.setLanguage('ar');
assert.equal(observing, false);
I.scan(n);
assert.equal(n.nodeValue, 'إنشاء التقرير');
I.setLanguage('en');
n.nodeValue = 'جارٍ تجهيز Word…';
I.scan(n);
assert.equal(n.nodeValue, 'Preparing Word…');
I.setLanguage('ar');
I.scan(n);
assert.equal(n.nodeValue, 'جارٍ تجهيز Word…');
n.nodeValue = 'إنشاء التقرير';
assert.equal(I.original(n), 'إنشاء التقرير', 'unobserved Arabic changes override old originals');
I.setLanguage('en');
I.scan(n);
assert.equal(n.nodeValue, 'Generate report');
I.setLanguage('ar');
I.scan(n);
assert.equal(n.nodeValue, 'إنشاء التقرير');
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

// An English choice before the dictionary arrives must not cache untranslated text.
let release;
const text = { nodeType: 3, nodeValue: 'إنشاء التقرير', parentElement: { closest: () => false } },
  waiting = {
    ...c,
    fetch: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    document: { documentElement: { ...doc, childNodes: [text] }, dispatchEvent() {} },
  };
waiting.window = waiting;
vm.createContext(waiting);
vm.runInContext(fs.readFileSync('public/i18n.js', 'utf8'), waiting);
const delayed = waiting.MadarI18n;
delayed.setLanguage('en');
delayed.scan(text);
assert.equal(text.nodeValue, 'إنشاء التقرير');
assert.equal(delayed.translate('المهمة', 'en'), 'المهمة');
release({ ok: true, json: async () => data });
await delayed.ready;
assert.equal(text.nodeValue, 'Generate report');
assert.equal(delayed.translate('المهمة', 'en'), 'Mission');
delayed.setLanguage('ar');
assert.equal(text.nodeValue, 'إنشاء التقرير');
console.log(
  'PASS: Arabic skips automatic DOM scans/observation and lazy English patterns; live originals and pre-ready language choices remain correct',
);
