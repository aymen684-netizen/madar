(function (root) {
  'use strict';
  function next(item, time) {
    if (item.invalid) return { state: 'invalid', pass: null };
    const pass = item.rows.find((r) => r.exit > time);
    return {
      state: !pass ? 'none' : pass.entry <= time ? 'ongoing' : 'upcoming',
      pass: pass || null,
    };
  }
  function countdown(pass, time) {
    const seconds = Math.max(
      0,
      Math.ceil(((pass.entry > time ? pass.entry : pass.exit) - time) / 1000),
    );
    return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':');
  }
  function overview(result, time) {
    if (!result || !Number.isFinite(time) || time < result.start || time >= result.end)
      return { state: 'missing', event: null, invalid: 0 };
    let event = null,
      invalid = 0;
    for (const item of result.items) {
      const nextPass = next(item, time);
      if (nextPass.state === 'invalid') invalid++;
      if (
        nextPass.pass &&
        (!event ||
          Math.max(nextPass.pass.entry, time) < Math.max(event.pass.entry, time) ||
          (Math.max(nextPass.pass.entry, time) === Math.max(event.pass.entry, time) &&
            item.id < event.id))
      )
        event = { id: item.id, pass: nextPass.pass, state: nextPass.state };
    }
    return { state: event ? event.state : invalid ? 'invalid' : 'none', event, invalid };
  }
  async function scan(S, objects, request, progress) {
    root.ObserverEngine.validate(request);
    if (
      !objects.length ||
      objects.length > 12 ||
      objects.some((o) => !root.OrbitData.valid(o)) ||
      new Set(objects.map((o) => Number(o.id))).size !== objects.length
    )
      throw Error('اختر من قمر واحد إلى 12 قمرًا صالحًا من مجموعة الخارطة.');
    const items = [];
    for (const object of objects) {
      const result = await root.ObserverEngine.scan(S, [object], request);
      items.push({ id: object.id, invalid: result.invalid > 0, rows: result.rows });
      progress?.({ done: items.length, total: objects.length });
    }
    return { start: request.start, end: request.end, items };
  }
  root.FleetPassCore = { next, countdown, overview, scan };
})(typeof self !== 'undefined' ? self : globalThis);
