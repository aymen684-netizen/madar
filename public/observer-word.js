(function (root) {
  'use strict';
  function start(report, progress) {
    const worker = new Worker('inventory-word-worker.js?v=87'),
      T = (text) => root.MadarI18n.translate(String(text));
    let cancelled = false,
      rejectJob;
    const promise = new Promise((resolve, reject) => {
      rejectJob = reject;
      worker.onmessage = (event) => {
        if (cancelled) return;
        const message = event.data;
        if (message.type === 'progress') progress?.(message.done);
        else {
          worker.terminate();
          if (message.type === 'done') resolve(message);
          else reject(Error(message.message));
        }
      };
      worker.onerror = () => {
        worker.terminate();
        reject(Error('تعذّر تشغيل تجهيز Word. أعد المحاولة.'));
      };
    });
    (async () => {
      const rows = [];
      let headers;
      for (let i = 0; i < report.result.rows.length; i += 100) {
        const batch = root.ObserverReport.wordRows({
          ...report,
          result: { ...report.result, rows: report.result.rows.slice(i, i + 100) },
        });
        headers ||= batch[0].map(T);
        rows.push(...batch.slice(1).map((row) => row.map(T)));
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (cancelled) return;
      }
      const brandBytes = await root.ReportLayout.brand();
      if (cancelled) return;
      worker.postMessage({
        title: T('تقرير مرور الأقمار من موقع الرصد'),
        notes: [...root.ObserverReport.lines(report).slice(4), root.ReportArchive.text(report)].map(
          T,
        ),
        headers,
        brief: root.ReportLayout.translated(root.ReportBrief.build(report)),
        brandBytes,
        createdAt: new Date(report.archive?.createdAt || Date.now()).toISOString(),
        language: root.MadarI18n.language,
        partLabel: T('الجزء'),
        scopeNote: T('الملخص يصف كامل فترة الرصد؛ هذا الملف يتضمن جزءًا من حالات المرور.'),
        filePrefix: 'madar-observer',
        columnWidths: [2800, 3300, 2800, 2300, 1600, 1600],
        groups: [{ code: 'passes', label: T('تفاصيل المرور'), rows }],
      });
    })().catch((error) => {
      worker.terminate();
      rejectJob(error);
    });
    return {
      promise,
      cancel() {
        cancelled = true;
        worker.terminate();
        rejectJob(new DOMException('Word cancelled', 'AbortError'));
      },
    };
  }
  root.ObserverWord = { start };
})(window);
