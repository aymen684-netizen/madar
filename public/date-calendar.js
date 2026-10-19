(function (root) {
  'use strict';
  // Gregorian civil dates only: no timezone conversion and no changes to the app clock.
  function parse(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
    const date = new Date(0);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 ? date : null;
  }
  function iso(date) {
    return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  function shift(value, months) {
    const date = parse(value);
    if (!date || !Number.isInteger(months)) return null;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999 ? iso(date) : null;
  }
  function allowed(value, min, max) {
    return !!parse(value) && (!parse(min) || value >= min) && (!parse(max) || value <= max);
  }
  const api = (root.DateCalendar = { parse, iso, shift, allowed });
  if (!root.document) return;
  const doc = root.document;
  let dialog, input, trigger, shown;
  const attached = new WeakSet();
  const english = () => root.MadarI18n?.language === 'en';
  const text = (ar, en) => (english() ? en : ar);
  const format = (date, options) =>
    new Intl.DateTimeFormat(english() ? 'en-GB' : 'ar-SA', {
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone: 'UTC',
      ...options,
    }).format(date);
  function today() {
    const zoneId = input?.classList.contains('period-date')
      ? 'analysis-zone'
      : {
          date: 'timezone',
          'observer-date': 'observer-zone',
          'report-start-date': 'report-zone',
          'report-end-date': 'report-zone',
        }[input?.id];
    const zone = zoneId && doc.getElementById(zoneId)?.value;
    if (zone !== undefined && zone !== false && zone !== '' && Number.isFinite(Number(zone)))
      return iso(new Date(Date.now() + Number(zone) * 3600000));
    const now = new Date();
    return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  function button(label, action, className) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (className) b.className = className;
    b.onclick = (event) => {
      event.preventDefault();
      action();
    };
    return b;
  }
  function choose(value) {
    if (
      !input?.isConnected ||
      input.disabled ||
      input.readOnly ||
      !allowed(value, input.min, input.max)
    )
      return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    dialog.close();
  }
  function move(months, focus) {
    const next = shift(shown, months);
    if (next) {
      shown = next;
      render(focus);
    }
  }
  function render(focus) {
    dialog.replaceChildren();
    dialog.dir = english() ? 'ltr' : 'rtl';
    const title = doc.createElement('h2');
    title.id = 'date-calendar-title';
    title.textContent = text('التقويم الميلادي', 'Gregorian calendar');
    const context = doc.createElement('p');
    context.id = 'date-calendar-context';
    context.textContent =
      input.getAttribute('aria-label') ||
      Array.from(input.labels || [])
        .flatMap((label) =>
          label.querySelector('.field-caption')
            ? [label.querySelector('.field-caption').textContent.trim()]
            : Array.from(label.childNodes)
                .filter((n) => n.nodeType === 3)
                .map((n) => n.textContent.trim()),
        )
        .join(' ');
    const nav = doc.createElement('div');
    nav.className = 'date-calendar-nav';
    const previous = button(
      '−',
      () => move(-1, '.date-calendar-previous'),
      'date-calendar-previous',
    );
    previous.setAttribute('aria-label', text('الشهر السابق', 'Previous month'));
    previous.disabled = !shift(shown, -1);
    const next = button('+', () => move(1, '.date-calendar-next'), 'date-calendar-next');
    next.setAttribute('aria-label', text('الشهر التالي', 'Next month'));
    next.disabled = !shift(shown, 1);
    const date = parse(shown),
      year = date.getUTCFullYear(),
      month = date.getUTCMonth();
    const months = doc.createElement('select');
    months.setAttribute('aria-label', text('الشهر الميلادي', 'Gregorian month'));
    for (let i = 0; i < 12; i++) {
      const option = doc.createElement('option');
      option.value = i;
      option.textContent = format(parse(`2000-${String(i + 1).padStart(2, '0')}-01`), {
        month: 'long',
      });
      months.append(option);
    }
    months.value = month;
    months.onchange = () => move(Number(months.value) - month, 'select');
    const years = doc.createElement('input');
    years.type = 'number';
    years.min = '1';
    years.max = '9999';
    years.step = '1';
    years.value = year;
    years.setAttribute('aria-label', text('السنة الميلادية', 'Gregorian year'));
    years.onchange = () => {
      const value = `${String(Number(years.value)).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`;
      if (parse(value)) {
        shown = value;
        render('input');
      } else years.value = year;
    };
    nav.append(previous, months, years, next);
    const grid = doc.createElement('div');
    grid.className = 'date-calendar-grid';
    for (let i = 0; i < 7; i++) {
      const weekday = doc.createElement('span');
      weekday.textContent = format(parse(`2024-01-${String(7 + i).padStart(2, '0')}`), {
        weekday: 'short',
      });
      grid.append(weekday);
    }
    for (let i = 0; i < date.getUTCDay(); i++) grid.append(doc.createElement('span'));
    const current = today();
    for (let day = 1; day <= 31; day++) {
      const value = `${shown.slice(0, 7)}-${String(day).padStart(2, '0')}`;
      const d = parse(value);
      if (!d) break;
      const b = button(String(day), () => choose(value));
      b.dataset.date = value;
      b.setAttribute('aria-label', format(d, { dateStyle: 'full' }));
      b.disabled = !allowed(value, input.min, input.max);
      if (value === input.value) {
        b.classList.add('is-selected');
        b.setAttribute('aria-pressed', 'true');
      }
      if (value === current) b.setAttribute('aria-current', 'date');
      b.onkeydown = (event) => {
        const deltas = {
          ArrowDown: 7,
          ArrowUp: -7,
          ArrowLeft: english() ? -1 : 1,
          ArrowRight: english() ? 1 : -1,
        };
        let target;
        if (event.key in deltas) {
          d.setUTCDate(day + deltas[event.key]);
          target = iso(d);
        } else if (event.key === 'Home') target = `${shown.slice(0, 7)}-01`;
        else if (event.key === 'End') target = iso(parse(shift(shown, 1)) || parse('9999-12-31'));
        else return;
        if (event.key === 'End' && shift(shown, 1)) {
          const last = parse(target);
          last.setUTCDate(0);
          target = iso(last);
        }
        event.preventDefault();
        if (!allowed(target, input.min, input.max)) return;
        shown = target.slice(0, 8) + '01';
        render();
        dialog.querySelector(`[data-date="${target}"]`)?.focus();
      };
      grid.append(b);
    }
    const footer = doc.createElement('div');
    footer.className = 'date-calendar-footer';
    const now = button(text('اليوم', 'Today'), () => choose(current));
    now.disabled = !allowed(current, input.min, input.max);
    footer.append(
      now,
      button(text('إغلاق', 'Close'), () => dialog.close()),
    );
    dialog.append(title, context, nav, grid, footer);
    if (focus) dialog.querySelector(focus)?.focus();
  }
  function open(field, opener) {
    if (field.disabled || field.readOnly) return;
    if (!dialog) {
      dialog = doc.createElement('dialog');
      dialog.id = 'date-calendar-dialog';
      dialog.dataset.noTranslate = '';
      dialog.setAttribute('aria-labelledby', 'date-calendar-title');
      dialog.setAttribute('aria-describedby', 'date-calendar-context');
      dialog.addEventListener('close', () => {
        if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      });
      doc.body.append(dialog);
    }
    input = field;
    trigger = opener;
    let value = parse(field.value) ? field.value : today();
    if (parse(field.min) && value < field.min) value = field.min;
    if (parse(field.max) && value > field.max) value = field.max;
    shown = value.slice(0, 8) + '01';
    render();
    dialog.showModal();
    (
      dialog.querySelector(`[data-date="${value}"]:not(:disabled)`) ||
      dialog.querySelector('[data-date]:not(:disabled)') ||
      dialog.querySelector('button')
    ).focus();
  }
  function attach(field) {
    if (attached.has(field)) return;
    attached.add(field);
    const wrapper = doc.createElement('span');
    wrapper.className = 'date-entry';
    field.before(wrapper);
    wrapper.append(field);
    const opener = button(
      text('ميلادي', 'Gregorian'),
      () => open(field, opener),
      'date-calendar-open',
    );
    opener.dataset.noTranslate = '';
    // A button nested in a field label must not invoke the native date picker as well.
    opener.addEventListener('click', (event) => event.stopPropagation());
    opener.setAttribute('aria-haspopup', 'dialog');
    opener.setAttribute('aria-controls', 'date-calendar-dialog');
    wrapper.append(opener);
  }
  api.attach = attach;
  doc.querySelectorAll('input[type="date"]').forEach(attach);
  doc.addEventListener('madar-language', () => {
    doc.querySelectorAll('.date-calendar-open').forEach((b) => {
      b.textContent = text('ميلادي', 'Gregorian');
    });
    if (dialog?.open) render();
  });
})(globalThis);
