(function (root) {
  'use strict';
  const details = new Map(),
    T = (s) => root.MadarI18n?.translate(String(s)) || String(s),
    words = {
      ar: {
        executive: 'الملخص التنفيذي',
        quality: 'اكتمال البيانات وحداثتها',
        limits: 'نطاق الاستنتاج',
        references: 'المراجع المجمعة',
        edition: 'إصدار التقرير',
        page: 'صفحة',
        of: 'من',
        empty: 'لا توجد نتائج',
        detail: 'محتوى Word والطباعة',
        full: 'تفصيلي مع الجداول',
        brief: 'مختصر للإحاطة',
        note: 'الاختيار يغيّر Word والطباعة فقط؛ CSV وJSON يحتفظان بكل النتائج.',
      },
      en: {
        executive: 'Executive summary',
        quality: 'Data completeness and freshness',
        limits: 'Interpretation limits',
        references: 'Collected references',
        edition: 'Report edition',
        page: 'Page',
        of: 'of',
        empty: 'No results',
        detail: 'Word and print content',
        full: 'Detailed with tables',
        brief: 'Executive brief',
        note: 'This choice affects Word and printing only; CSV and JSON retain all results.',
      },
    };
  let brandPromise;
  async function brand() {
    return (brandPromise ??= root
      .fetch('icons/madar-192.png')
      .then((r) => {
        if (!r.ok) throw Error('Brand unavailable');
        return r.arrayBuffer();
      })
      .then((b) => new Uint8Array(b))
      .catch(() => null));
  }
  function language() {
    return root.MadarI18n?.language || 'ar';
  }
  function mode(kind) {
    return details.get(kind) || 'full';
  }
  function setMode(kind, value) {
    details.set(kind, value === 'brief' ? 'brief' : 'full');
  }
  function rate(m, lang = 'ar') {
    if (m.percent === null) return '—';
    if (m.count === 0) return '0%';
    if (m.count === m.total) return '100%';
    if (m.percent > 99.9) return lang === 'en' ? 'over 99.9%' : 'أكثر من 99.9%';
    if (m.percent < 0.1) return lang === 'en' ? 'under 0.1%' : 'أقل من 0.1%';
    return Number(m.percent.toFixed(1)) + '%';
  }
  function metricText(m) {
    return m.label + ' · ' + m.count + ' / ' + m.total + ' · ' + rate(m) + ' · ' + m.scope;
  }
  function distributionText(d) {
    return (
      d.label + ' · ' + (d.items.map((x) => x.label + ' ' + x.count).join('، ') || 'لا توجد نتائج')
    );
  }
  function render(host, r) {
    const b = root.ReportBrief.build(r),
      doc = host.ownerDocument,
      section = doc.createElement('section');
    section.className = 'report-brief';
    section.dataset.reportBrief = b.kind;
    const add = (parent, tag, text) => {
      const el = doc.createElement(tag);
      el.textContent = text;
      parent.append(el);
      return el;
    };
    add(section, 'h2', words.ar.executive);
    for (const text of b.overview) add(section, 'p', text);
    const detail = doc.createElement('details');
    detail.className = 'report-brief-details';
    add(detail, 'summary', 'تفاصيل الحساب وجودة البيانات');
    for (const text of b.executive) add(detail, 'p', text);
    add(detail, 'h3', words.ar.quality);
    const list = doc.createElement('dl');
    list.className = 'report-quality-metrics';
    for (const m of b.metrics) {
      const pair = doc.createElement('div');
      add(pair, 'dt', m.label);
      add(pair, 'dd', m.count + ' / ' + m.total + ' · ' + rate(m));
      add(pair, 'small', m.scope);
      list.append(pair);
    }
    detail.append(list);
    for (const d of b.distributions) add(detail, 'p', distributionText(d));
    add(detail, 'h3', words.ar.limits);
    for (const text of b.notes) add(detail, 'p', text);
    section.append(detail);
    host.append(section);
    return b;
  }

  function printFront(doc, r, title) {
    const b = root.ReportBrief.build(r),
      add = (tag, text) => {
        const el = doc.createElement(tag);
        el.textContent = T(text);
        doc.body.append(el);
        return el;
      };
    const image = doc.createElement('img');
    image.src = new URL('icons/madar-192.png', root.location.href).href;
    image.alt = T('شعار مدار');
    image.style.cssText = 'width:48px;height:48px';
    doc.body.append(image);
    add('h1', title);
    add(
      'p',
      'إصدار التقرير ' +
        b.version +
        ' · ' +
        (mode(b.kind) === 'brief' ? words.ar.brief : words.ar.full),
    );
    add('h2', words.ar.executive);
    for (const text of b.executive) add('p', text);
    add('h2', words.ar.quality);
    for (const m of b.metrics) add('p', metricText(m));
    for (const d of b.distributions) add('p', distributionText(d));
    add('h2', words.ar.limits);
    for (const text of b.notes) add('p', text);
    return b;
  }
  function printReferences(doc, b) {
    const h = doc.createElement('h2');
    h.textContent = T(words.ar.references);
    doc.body.append(h);
    if (mode(b.kind) === 'brief' && b.references.length > 12) {
      const p = doc.createElement('p');
      p.textContent = T(
        'المختصر يعرض أول 12 مرجعًا. بقية المراجع متاحة في النسخة التفصيلية وملف JSON.',
      );
      doc.body.append(p);
    }
    for (const ref of mode(b.kind) === 'brief' ? b.references.slice(0, 12) : b.references) {
      const p = doc.createElement('p'),
        a = doc.createElement('a');
      a.textContent = T(ref.label) + ' · ' + ref.url;
      a.href = ref.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      p.append(a);
      doc.body.append(p);
    }
  }
  function translated(b) {
    return {
      ...b,
      executive: b.executive.map(T),
      metrics: b.metrics.map((m) => ({ ...m, label: T(m.label), scope: T(m.scope) })),
      distributions: b.distributions.map((d) => ({
        ...d,
        label: T(d.label),
        items: d.items.map((x) => ({ ...x, label: T(x.label) })),
      })),
      notes: b.notes.map(T),
      references: b.references.map((x) => ({ ...x, label: T(x.label) })),
    };
  }
  function document(D, r, children, options = {}) {
    const lang = options.language || language(),
      rtl = lang !== 'en',
      w = words[lang],
      b = options.brief || root.ReportBrief.build(r),
      title = options.title || 'تقرير مدار',
      align = D.AlignmentType.START;
    const p = (text, extra = {}) =>
        new D.Paragraph({
          bidirectional: rtl,
          alignment: align,
          spacing: {
            after: options.detail === 'brief' ? 40 : 120,
            line: options.detail === 'brief' ? 240 : 270,
          },
          children: String(text ?? '')
            .split('\n')
            .map(
              (line, i) =>
                new D.TextRun({
                  text: line,
                  break: i ? 1 : 0,
                  font: 'Arial',
                  size: options.detail === 'brief' ? 21 : 22,
                  rightToLeft: rtl,
                  color: '000000',
                }),
            ),
          ...extra,
        }),
      h = (text) =>
        new D.Paragraph({ text, style: 'Heading1', bidirectional: rtl, alignment: align }),
      front = [];
    if (r.brandBytes?.length)
      front.push(
        new D.Paragraph({
          alignment: align,
          bidirectional: rtl,
          children: [
            new D.ImageRun({
              type: 'png',
              data: r.brandBytes,
              transformation: { width: 48, height: 48 },
              altText: { title: lang === 'en' ? 'Madar logo' : 'شعار مدار', description: 'Madar' },
            }),
          ],
        }),
      );
    front.push(
      new D.Paragraph({ text: title, style: 'Title', bidirectional: rtl, alignment: align }),
      p(w.edition + ' ' + b.version + ' · ' + (options.detail === 'brief' ? w.brief : w.full)),
    );
    if (r.archive)
      front.push(
        p(r.archive.id + ' · UTC ' + new Date(r.archive.createdAt).toISOString(), {
          spacing: { after: 180 },
        }),
      );
    else if (r.createdAt) front.push(p('UTC ' + r.createdAt));
    front.push(
      h(w.executive),
      ...b.executive.map((t) => p(t)),
      h(w.quality),
      ...b.metrics.flatMap((m, i) => [
        ...(i === 0 || m.scope !== b.metrics[i - 1].scope ? [p(m.scope, { keepNext: true })] : []),
        p(m.label + ' · ' + m.count + ' ' + w.of + ' ' + m.total + ' · ' + rate(m, lang)),
      ]),
      ...b.distributions.map((d) =>
        p(d.label + ' · ' + (d.items.map((x) => x.label + ' ' + x.count).join('، ') || w.empty)),
      ),
    );
    const content = options.detail === 'brief' ? [] : children;
    content.push(h(w.limits), ...b.notes.map((t) => p(t)), h(w.references));
    if (options.detail === 'brief' && b.references.length > 12)
      content.push(
        p(
          lang === 'en'
            ? 'The brief lists the first 12 references. Remaining sources are available in the detailed version and JSON.'
            : 'المختصر يعرض أول 12 مرجعًا. بقية المراجع متاحة في النسخة التفصيلية وملف JSON.',
        ),
      );
    for (const ref of options.detail === 'brief' ? b.references.slice(0, 12) : b.references) {
      content.push(
        p(ref.label, { keepNext: true }),
        new D.Paragraph({
          bidirectional: false,
          alignment: D.AlignmentType.LEFT,
          spacing: { after: options.detail === 'brief' ? 60 : 100 },
          children: [
            new D.ExternalHyperlink({
              link: ref.url,
              children: [
                new D.TextRun({
                  text: ref.url,
                  font: 'Arial',
                  size: 20,
                  color: '000000',
                  rightToLeft: false,
                }),
              ],
            }),
          ],
        }),
      );
    }
    if (r.archive && root.ReportArchive) content.push(p(root.ReportArchive.text(r)));
    const footer = new D.Footer({
      children: [
        new D.Paragraph({
          alignment: D.AlignmentType.CENTER,
          bidirectional: rtl,
          children: [
            new D.TextRun({
              text: 'Madar · ' + w.edition + ' ' + b.version + ' · ' + w.page + ' ',
              size: 18,
              color: '000000',
            }),
            new D.TextRun({ children: [D.PageNumber.CURRENT], size: 18 }),
            new D.TextRun({ text: ' ' + w.of + ' ', size: 18 }),
            new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], size: 18 }),
          ],
        }),
      ],
    });
    return new D.Document({
      creator: 'Madar',
      title,
      description: options.detail === 'brief' ? w.brief : w.full,
      styles: {
        default: {
          document: {
            run: { font: 'Arial', size: 22, color: '000000' },
            paragraph: { spacing: { after: 120 } },
          },
        },
        paragraphStyles: [
          {
            id: 'Title',
            name: 'Title',
            basedOn: 'Normal',
            next: 'Normal',
            run: { font: 'Arial', size: 32, bold: true, color: '000000' },
            paragraph: { keepNext: true, spacing: { after: 220 } },
          },
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            next: 'Normal',
            run: { font: 'Arial', size: 26, bold: true, color: '000000' },
            paragraph: { keepNext: true, spacing: { before: 220, after: 130 } },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 12240,
                height: 15840,
                ...(options.landscape ? { orientation: D.PageOrientation.LANDSCAPE } : {}),
              },
              margin: {
                top: options.landscape ? 720 : options.detail === 'brief' ? 1080 : 1440,
                bottom: 1080,
                left: options.landscape ? 720 : options.detail === 'brief' ? 1152 : 1440,
                right: options.landscape ? 720 : options.detail === 'brief' ? 1152 : 1440,
                footer: 360,
              },
            },
          },
          footers: { default: footer },
          children: [...front, ...content],
        },
      ],
    });
  }
  root.ReportLayout = {
    rate,
    render,
    document,
    brand,
    mode,
    setMode,
    metricText,
    distributionText,
    printFront,
    printReferences,
    translated,
    words,
  };
})(typeof window !== 'undefined' ? window : globalThis);
