(function (root) {
  'use strict';
  function stamp(t, offset) {
    return new Date(t + offset * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  }
  function duration(s) {
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), Math.floor(s % 60)]
      .map((v) => String(v).padStart(2, '0'))
      .join(':');
  }
  function createReport(D, r) {
    D = root.MadarI18n?.wordLibrary(D) || D;
    if (root.ReportLayout.mode('report') === 'brief')
      return root.ReportLayout.document(D, r, [], {
        title: 'تقرير مرور الأقمار فوق ' + r.countryName,
        detail: 'brief',
      });
    const {
      Document,
      Paragraph,
      TextRun,
      Table,
      TableRow,
      TableCell,
      WidthType,
      AlignmentType,
      VerticalAlign,
      HeadingLevel,
      BorderStyle,
      ImageRun,
    } = D;
    const p = (text, opts = {}) =>
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.START,
        spacing: { after: 150, line: 280 },
        children: String(text)
          .split('\n')
          .map(
            (line, i) =>
              new TextRun({
                text: line,
                break: i ? 1 : 0,
                font: 'Arial',
                size: 22,
                rightToLeft: true,
                ...opts,
              }),
          ),
      });
    const heading = (t, opts = {}) =>
      new Paragraph({
        ...opts,
        text: t,
        bidirectional: true,
        alignment: AlignmentType.START,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 240, after: 140 },
      });
    const cell = (text, width, header = false, shade = false) =>
      new TableCell({
        width: { size: width, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        shading: { fill: header ? 'DCE6EF' : shade ? 'F4F6F8' : 'FFFFFF' },
        margins: { top: 100, bottom: 100, left: 90, right: 90 },
        children: [
          new Paragraph({
            bidirectional: true,
            alignment: AlignmentType.START,
            spacing: { after: 0, line: 260 },
            children: cellRuns(text, header),
          }),
        ],
      });
    const table = (headers, widths, data) => {
      const row = (vals, idx) =>
        new TableRow({
          tableHeader: idx === -1,
          cantSplit: true,
          children: vals.map((v, i) => cell(v, widths[i], idx === -1, idx % 2 === 1)),
        });
      return new Table({
        visuallyRightToLeft: true,
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: widths,
        borders: Object.fromEntries(
          ['top', 'bottom', 'left', 'right', 'insideHorizontal', 'insideVertical'].map((k) => [
            k,
            { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
          ]),
        ),
        rows: [row(headers, -1), ...data.map((v, i) => row(v, i))],
      });
    };
    function image(data, width) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
        height = Math.round((width * view.getUint32(20)) / view.getUint32(16));
      return new ImageRun({ type: 'png', data, transformation: { width, height } });
    }
    function cellRuns(value, header) {
      const text = typeof value === 'object' ? value.text : String(value),
        runs = text.split('\n').map(
          (line, i) =>
            new TextRun({
              text: line,
              break: i ? 1 : 0,
              font: 'Arial',
              size: 19,
              bold: header,
              color: '000000',
            }),
        );
      if (value?.flagBytes?.length)
        runs.unshift(image(value.flagBytes, 26), new TextRun({ text: ' ' }));
      return runs;
    }
    function finish(children) {
      return root.ReportLayout.document(D, r, children.slice(1), {
        title: 'تقرير مرور الأقمار فوق ' + r.countryName,
        detail: root.ReportLayout.mode('report'),
      });
    }

    if (r.criteria) {
      const C = root.CountryReportCore,
        I = root.ReportInsights;
      const children = [
        new Paragraph({
          text: 'تقرير مرور الأقمار فوق ' + r.countryName,
          bidirectional: true,
          alignment: AlignmentType.START,
          style: 'Title',
        }),
        p(
          'الفترة ' +
            stamp(r.start, r.offset) +
            ' إلى ' +
            stamp(r.end, r.offset) +
            ' · ' +
            r.zoneLabel +
            '\nمجموعة الفحص ' +
            r.scopeName +
            ' · خطوة الفحص ' +
            r.step +
            ' ثانية',
        ),
        heading('الملخص ومعايير التقرير'),
        ...C.summaryLines(r).map((t) => p(t)),
        heading('مؤشرات المرور'),
        ...I.lines(r, r.offset, stamp, duration)
          .slice(2, 5)
          .map((t) => p(t)),
      ];
      for (const axis of [...new Set([r.criteria.group, 'owner', 'date'])])
        children.push(
          heading('التصنيف حسب ' + C.GROUPS[axis]),
          table(
            ['التصنيف', 'الأقمار', 'الحالات', 'دقائق الوجود دون تداخل'],
            [4400, 1200, 1500, 2260],
            C.groups(r.result.rows, axis, r.offset).map((g) => [
              g.label,
              g.satellites,
              g.passes,
              (g.seconds / 60).toFixed(1),
            ]),
          ),
        );
      children.push(
        heading('دليل الأقمار'),
        table(
          [
            'القمر ورقم NORAD',
            'الدولة والمهمة',
            'التوثيق ومصدر المدار',
            'المرور والتكرار في العينة',
          ],
          [1900, 2500, 2460, 2500],
          C.satellites(r).map((x) => [
            x.name + '\n' + x.id,
            (x.metadata?.country || 'غير متاح') +
              '\n' +
              (x.metadata?.mission || x.metadata?.missionLabel || 'غير متاح'),
            (x.metadata?.evidenceLabel || 'غير موثق') +
              '\n' +
              I.source(x.provenance) +
              '\nعناصر UTC ' +
              stamp(x.epoch, 0) +
              '\n' +
              (x.provenance?.fetchedAt
                ? 'جلب UTC ' + stamp(x.provenance.fetchedAt, 0)
                : 'وقت الجلب غير موثق'),
            x.passes + ' حالات\n' + x.recurring,
          ]),
        ),
      );
      children.push(
        heading('جدول المرور والحركة والمسار'),
        table(
          ['القمر ورقم NORAD', 'التوقيت المحلي', 'المدة والارتفاع والسرعة', 'المسار الأرضي'],
          [1700, 2400, 2200, 3060],
          r.result.rows.map((x) => [
            x.name + '\n' + x.id,
            'دخول ' +
              stamp(x.entry, r.offset) +
              (x.clippedStart ? ' *' : '') +
              '\nخروج ' +
              stamp(x.exit, r.offset) +
              (x.clippedEnd ? ' *' : ''),
            duration(x.duration) +
              '\nارتفاع ' +
              (Number.isFinite(x.height) ? x.height.toFixed(1) + ' كم' : 'غير متاح') +
              '\nسرعة ' +
              (Number.isFinite(x.speed) ? x.speed.toFixed(3) + ' كم/ث' : 'غير متاح'),
            (Number.isFinite(x.groundDistance)
              ? x.groundDistance.toFixed(1) + ' كم'
              : 'طول غير متاح') +
              '\nالبداية ' +
              C.coord(x.track?.[0]) +
              '\nالنهاية ' +
              C.coord(x.track?.at(-1)),
          ]),
        ),
        p(
          '* حالة محصورة بحدود الفترة؛ قد يبدأ المرور قبلها أو يستمر بعدها. العينات الزمنية قد تفوّت مرورًا أقصر من خطوة الفحص. النتائج تقديرات من العناصر المتاحة وليست أرشيفًا تاريخيًا مرصودًا.',
        ),
      );
      children.push(heading('خريطة المرور والخط الزمني'), p(I.notes(r)));
      if (r.visuals)
        for (const bytes of [r.visuals.map, r.visuals.timeline])
          children.push(new Paragraph({ spacing: { after: 150 }, children: [image(bytes, 624)] }));
      children.push(heading('هوية التقرير وقابلية المراجعة'), p(root.ReportArchive.text(r)));
      return finish(children);
    }
    const children = [
      new Paragraph({
        text: 'تقرير المرور المداري فوق ' + r.countryName,
        bidirectional: true,
        alignment: AlignmentType.START,
        style: 'Title',
        spacing: { after: 200 },
      }),
      p(
        'يعرض هذا التقرير المرور المقدّر للأقمار الصناعية فوق الحدود الجغرافية للبلد خلال الفترة المحددة. اكتُشفت ' +
          r.result.rows.length +
          ' حالة مرور تشمل ' +
          r.result.unique +
          ' قمرًا مختلفًا ضمن ' +
          r.result.total +
          ' قمرًا شملها الفحص.',
      ),
      heading('نطاق التقرير'),
      p(
        'البلد ' +
          r.countryName +
          '\nبداية الفترة (التاريخ والوقت) ' +
          stamp(r.start, r.offset) +
          '\nنهاية الفترة (التاريخ والوقت) ' +
          stamp(r.end, r.offset) +
          '\nالتوقيت ' +
          r.zoneLabel +
          '\nاليوم ' +
          r.day +
          '\nمجموعة الفحص ' +
          r.scopeName +
          '\nخطوة الفحص ' +
          r.step +
          ' ثانية\nتاريخ إنشاء التقرير ' +
          stamp(r.archive?.createdAt || Date.now(), r.offset),
      ),
      heading('طريقة الحساب وحدود الدقة'),
      p(
        'احتُسبت المواقع بخوارزمية SGP4 من العناصر المدارية المتاحة، واختُبر وجود الموضع المسقط على سطح الأرض داخل حدود Natural Earth التقريبية. لا يصف التقرير المجال الجوي القانوني ولا تغطية المستشعرات أو إمكانية الرؤية من الأرض. تظهر مصادر العناصر الفعلية في مؤشرات الجودة، بما فيها المستوردة وغير الموثقة. تُعرض تواريخ النسخ الاحتياطية المستخدمة ضمن مؤشرات البيانات عند توفرها. قد تتضمن المجموعة العسكرية والاستخبارية عناصر رصد علني مستقل من Mike McCants، ويُوضح مصدرها في جدول معلومات الأقمار.',
      ),
      p(
        'النتائج تقديرية وليست سجلًا تاريخيًا مرصودًا. وقت جلب البيانات يختلف عن تاريخ العناصر المدارية. لم يُحمّل أرشيف خاص بفترة التقرير؛ تُستخدم العناصر المتاحة مع إظهار ابتعادها عن الفترة المطلوبة. الفحص على فواصل ' +
          r.step +
          ' ثانية قد يفوّت حالات مرور أقصر من الفاصل. صُقلت الحدود المكتشفة إلى ثانية تقريبًا. ' +
          r.result.stale +
          ' قمرًا لديه عناصر تبعد أكثر من ثلاثة أيام عن الفترة المطلوبة، و' +
          r.result.invalid +
          ' قمرًا تعذّر حسابه أثناء الفحص. لا تعني النتيجة الصفرية تأكيد عدم المرور.',
      ),
      heading('حالات المرور المكتشفة'),
    ];
    if (r.result.rows.length) {
      children.push(
        table(
          ['القمر ورقم NORAD', 'الدخول', 'الخروج', 'المدة', 'الارتفاع كم'],
          [2700, 2100, 2100, 1160, 1300],
          r.result.rows.map((row) => [
            row.name + '\n' + row.id,
            stamp(row.entry, r.offset) + (row.clippedStart ? ' *' : ''),
            stamp(row.exit, r.offset) + (row.clippedEnd ? ' *' : ''),
            duration(row.duration),
            row.height === null ? 'غير متاح' : row.height.toFixed(1),
          ]),
        ),
        p(
          'العلامة * تعني أن المرور بدأ قبل بداية فترة البحث أو استمر بعد نهايتها، والمدة المعروضة محصورة في الفترة المطلوبة.',
        ),
        heading('الدولة والمهمة وتاريخ العناصر المدارية'),
      );
      const unique = [...new Map(r.result.rows.map((row) => [row.id, row])).values()];
      children.push(
        table(
          ['القمر ورقم NORAD', 'الدولة أو الجهة', 'المهمة', 'تاريخ العناصر UTC'],
          [2200, 2200, 2760, 2200],
          unique.map((row) => [
            row.name + '\n' + row.id,
            {
              text: row.metadata?.country || 'غير متاح',
              flagBytes: r.ownerFlags?.[row.metadata?.ownerIso2],
            },
            row.metadata?.missionLabel || 'غير متاح',
            stamp(row.epoch, 0) +
              '\n' +
              root.ReportInsights.source(row.provenance) +
              '\n' +
              (row.provenance?.format || 'TLE') +
              (row.provenance?.fetchedAt
                ? '\nجلب ' + stamp(row.provenance.fetchedAt, 0)
                : '\nوقت الجلب غير موثق'),
          ]),
        ),
        p(
          'الدولة أو الجهة هي رمز الملكية المسجل في SATCAT وقد تكون منظمة مشتركة. المهمة المصنفة تصنيفًا عامًا مستمدة من مجموعة CelesTrak. وصف المنظومة موثق لدى الجهة الناشرة ولا يؤكد تفاصيل حمولة كل قمر أو حالته التشغيلية. المعلومات غير المتاحة لم تُستنتج من الاسم أو المدار.',
        ),
      );
      const references = new Map();
      for (const row of unique) {
        const m = row.metadata;
        if (m?.missionSource) {
          const key = m.missionSource;
          const entry = references.get(key) || {
            title: m.missionSourceTitle || 'مصدر المهمة',
            ids: [],
            checked: m.checked,
          };
          entry.ids.push(String(row.id));
          references.set(key, entry);
        }
      }
      if (references.size) {
        children.push(heading('مراجع أوصاف المهام'));
        for (const [url, ref] of references)
          children.push(
            p(
              ref.title +
                ' · NORAD ' +
                ref.ids.join('، ') +
                (ref.checked ? ' · مراجعة ' + ref.checked : '') +
                '\n' +
                url,
            ),
          );
      }
    } else children.push(p('لم تُكتشف حالات مرور ضمن عينة الفحص لهذه الفترة.'));
    children.push(heading('هوية التقرير وقابلية المراجعة'), p(root.ReportArchive.text(r)));
    const insights = root.ReportInsights;
    children.splice(
      2,
      0,
      heading('خريطة المرور والخط الزمني'),
      p(insights.notes(r)),
      ...(r.visuals
        ? [
            new Paragraph({
              keepNext: true,
              keepLines: true,
              spacing: { before: 0, after: 100 },
              children: [image(r.visuals.map, 624)],
            }),
            new Paragraph({
              keepLines: true,
              spacing: { before: 0, after: 100 },
              children: [image(r.visuals.timeline, 624)],
            }),
          ]
        : [p('الرسوم غير متاحة في هذه النسخة.')]),
    );
    if (r.flagBytes?.length)
      children.splice(
        1,
        0,
        new Paragraph({
          alignment: AlignmentType.START,
          spacing: { after: 160 },
          children: [image(r.flagBytes, 64)],
        }),
      );
    return finish(children);
  }

  const api = { stamp, duration, createReport };
  if (typeof module !== 'undefined') module.exports = api;
  else root.ReportDocument = api;
})(typeof window !== 'undefined' ? window : globalThis);
