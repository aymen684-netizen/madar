(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id),
    T = (text) => root.MadarI18n.translate(text),
    states = [],
    errors = new Map();
  let serial = 0;
  const configs = [
    {
      key: 'report',
      form: 'report-form',
      run: 'report-run',
      cancel: 'report-cancel',
      groups: [
        ['المكان', ['report-country']],
        ['الفترة والتوقيت', ['report-start-date', 'report-end-date', 'report-zone']],
        ['الأقمار والخيارات', ['report-scope', 'report-types']],
      ],
      advanced: ['report-builder', 'report-step'],
    },
    {
      key: 'analysis',
      form: 'analysis-form',
      run: 'analysis-run',
      cancel: 'analysis-cancel',
      groups: [
        ['المكان', ['analysis-country']],
        ['الفترة والتوقيت', ['analysis-zone', 'analysis-periods', 'analysis-add']],
        ['الأقمار والخيارات', ['analysis-scope', 'analysis-types']],
      ],
      advanced: ['analysis-step', 'analysis-tolerance', 'analysis-purpose'],
    },
    {
      key: 'observer',
      form: 'observer-form',
      cancel: 'observer-cancel',
      groups: [
        [
          'المكان',
          [
            'observer-site-select',
            'observer-name',
            'observer-lat',
            'observer-lon',
            'observer-height',
          ],
        ],
        [
          'الفترة والتوقيت',
          ['observer-date', 'observer-start', 'observer-end', 'observer-next', 'observer-zone'],
        ],
        ['الأقمار والخيارات', ['observer-scope']],
      ],
      advanced: ['observer-elevation'],
    },
    {
      key: 'inventory',
      form: 'inventory-form',
      run: 'inventory-run',
      groups: [['المكان', ['inventory-owner']]],
      advanced: [],
    },
  ];
  function fieldNode(input) {
    return (
      input.closest('.observer-sites, .type-picker') ||
      input.closest('.inline-field, label') ||
      input
    );
  }
  function errorAt(input, message) {
    if (!input) return;
    let entry = errors.get(input);
    if (!entry) {
      const node = document.createElement('small');
      node.id = 'report-field-error-' + ++serial;
      node.className = 'report-field-error';
      node.setAttribute('aria-live', 'polite');
      (input.closest('.date-entry') || input).after(node);
      const description = (input.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean);
      input.setAttribute('aria-describedby', [...description, node.id].join(' '));
      entry = { node, message };
      errors.set(input, entry);
    }
    entry.message = message;
    entry.node.textContent =
      T(message) +
      (input.validity.rangeUnderflow || input.validity.rangeOverflow
        ? ' (' + input.min + ' – ' + input.max + ')'
        : '');
    input.setAttribute('aria-invalid', 'true');
  }
  function clearError(input) {
    const entry = errors.get(input);
    if (!entry) return;
    const ids = (input.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== entry.node.id);
    if (ids.length) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
    input.removeAttribute('aria-invalid');
    entry.node.remove();
    errors.delete(input);
  }
  function controls(node) {
    return [...node.querySelectorAll('input, select, textarea')].filter(
      (input) => input.type !== 'hidden' && !input.disabled,
    );
  }
  function collect(state, section) {
    const found = new Map(),
      add = (input, message) => {
        if (input && (!section || section.contains(input))) found.set(input, message);
      };
    for (const input of controls(section || state.form)) {
      const v = input.validity;
      if (v.valid) continue;
      add(
        input,
        v.valueMissing
          ? 'أكمل هذا الحقل للمتابعة.'
          : v.rangeUnderflow || v.rangeOverflow
            ? 'أدخل قيمة ضمن الحدين الموضحين في الحقل.'
            : v.stepMismatch
              ? 'أدخل قيمة تتوافق مع خطوة هذا الحقل.'
              : 'أدخل قيمة صحيحة لهذا الحقل.',
      );
    }
    const key = state.config.key;
    if (key === 'report' || key === 'observer') {
      const id = key === 'report' ? 'report' : 'observer',
        startDate = $(id + (key === 'report' ? '-start-date' : '-date')),
        endDate = key === 'report' ? $('report-end-date') : startDate,
        startTime = $(id + (key === 'report' ? '-start-time' : '-start')),
        endTime = $(id + (key === 'report' ? '-end-time' : '-end'));
      if (
        [startDate, endDate, startTime, endTime].every(
          (input) => input.value && input.validity.valid,
        )
      ) {
        const offset = Number($(id + '-zone').value),
          start = reportDate(startDate.value, startTime.value, offset),
          end =
            reportDate(endDate.value, endTime.value, offset) +
            (key === 'observer' && $('observer-next').checked ? 864e5 : 0);
        if (end <= start)
          add(
            endTime,
            key === 'observer'
              ? 'اجعل النهاية بعد البداية، أو فعّل اليوم التالي لعبور منتصف الليل.'
              : 'نهاية الفترة يجب أن تكون بعد بدايتها.',
          );
        else if (end - start > (key === 'report' ? 7 : 1) * 864e5)
          add(
            endDate,
            key === 'report'
              ? 'الحد الأقصى لهذه الفترة 7 أيام.'
              : 'الحد الأقصى لهذه الفترة 24 ساعة.',
          );
      }
    }
    if (key === 'analysis') {
      const periods = [...$('analysis-periods').children];
      if (periods.length < 2)
        add(
          periods[0]?.querySelector('input') || $('analysis-zone'),
          'أضف فترتين على الأقل للمقارنة.',
        );
      if (
        periods.length >= 2 &&
        periods.every((row) => controls(row).every((input) => input.validity.valid))
      ) {
        try {
          readPeriods();
        } catch (error) {
          const index = Number(error.message.match(/^الفترة (\d+)/)?.[1] || 1) - 1;
          add(periods[index]?.querySelector('.period-end'), error.message);
        }
      }
    }
    if (key !== 'inventory') {
      const scope = $(key + '-scope'),
        value = scope.value;
      if (value === 'types' && !root.TypePicker.selected(key).length)
        add(scope, 'اختر نوعًا واحدًا على الأقل من الأقمار.');
      if (value === 'fleet' && !root.MapFleet?.size)
        add(scope, 'مجموعة الخارطة فارغة؛ أضف قمرًا إليها أو اختر نطاقًا آخر.');
      if (value === 'favorites' && typeof watchlist !== 'undefined' && !watchlist.items.length)
        add(scope, 'المفضلة فارغة؛ أضف قمرًا إليها أو اختر نطاقًا آخر.');
      if (value === 'selected' && (typeof selection === 'undefined' || !selection.current))
        add(scope, 'اختر قمرًا من الدليل أو الخارطة أولًا، أو غيّر نطاق الأقمار.');
    }
    if (key === 'report') {
      try {
        root.CountryReportBuilder.read();
      } catch (error) {
        const fields = {
          'اختر دولة أو جهة واحدة على الأقل.': 'owners',
          'اكتب المهمة أو اختر مستوى توثيقها.': 'mission',
          'أدخل نطاق ارتفاع صحيحًا من 0 إلى 100000 كم.': 'max',
          'أدخل نافذة وقت محلي صحيحة.': 'from',
        };
        add($('report-build-' + (fields[error.message] || 'group')), error.message);
      }
    }
    return found;
  }
  function reveal(state, input) {
    const step = input.closest('.report-guide-step');
    if (state.guided && step) setStep(state, state.steps.indexOf(step), false);
    let node = input.parentElement;
    while (node && node !== state.form) {
      if (node.tagName === 'DETAILS') node.open = true;
      node = node.parentElement;
    }
    input.focus();
    input.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function validate(state, section, focus = true) {
    for (const input of [...errors.keys()])
      if (!input.isConnected || state.form.contains(input)) clearError(input);
    const found = collect(state, section);
    for (const [input, message] of found) errorAt(input, message);
    if (found.size && focus) {
      const status = $(state.config.key + '-status');
      if (status) status.textContent = T(found.values().next().value);
    }
    if (found.size && focus) reveal(state, found.keys().next().value);
    return !found.size;
  }
  function summary(state) {
    const list = document.createElement('dl');
    list.className = 'report-guide-summary';
    for (const input of controls(state.form)) {
      if (
        input.closest('.report-guide-review, .observer-sites, .type-picker') ||
        (['checkbox', 'radio'].includes(input.type) && !input.checked) ||
        !input.value ||
        input.id === 'report-build-preview'
      )
        continue;
      const label = input.closest('label, .inline-field'),
        caption = label?.querySelector('.field-caption'),
        external = input.id && document.querySelector('label[for="' + input.id + '"]');
      let name =
        input.getAttribute('aria-label') ||
        caption?.textContent ||
        external?.textContent ||
        [...(label?.childNodes || [])]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('');
      if (!name.trim()) continue;
      const term = document.createElement('dt'),
        value = document.createElement('dd'),
        text = document.createElement('bdi');
      term.textContent = T(name.trim());
      text.dataset.noTranslate = '';
      text.dir = 'auto';
      text.textContent =
        input.tagName === 'SELECT'
          ? [...input.selectedOptions].map((o) => o.textContent).join('، ')
          : input.type === 'checkbox'
            ? T('نعم')
            : input.value;
      value.append(text);
      list.append(term, value);
    }
    if ($(state.config.key + '-scope')?.value === 'types') {
      const term = document.createElement('dt'),
        value = document.createElement('dd');
      term.textContent = T('أنواع الأقمار المختارة');
      value.textContent = T(root.TypePicker.name(root.TypePicker.selected(state.config.key)));
      list.append(term, value);
    }
    state.reviewContent.replaceChildren(list);
  }
  function busy(state) {
    return (
      state.form.getAttribute('aria-busy') === 'true' ||
      !!(state.config.cancel && !$(state.config.cancel).disabled)
    );
  }
  function sync(state) {
    const last = state.steps.length - 1;
    state.form.dataset.reportGuided = String(state.guided);
    state.toggle.textContent = state.guided ? 'عرض كل الحقول' : 'استخدام الخطوات المبسطة';
    state.toggle.setAttribute('aria-pressed', String(!state.guided));
    state.nav.hidden = !state.guided;
    state.steps.forEach((step, i) => {
      step.hidden = state.guided ? i !== state.index : i === last;
      if (i !== last) step.querySelector('h3').hidden = !state.guided;
      const button = state.buttons[i];
      button.setAttribute('aria-current', i === state.index ? 'step' : 'false');
      button.disabled = busy(state);
    });
    state.back.hidden = !state.guided || state.index === 0;
    state.next.hidden = !state.guided || state.index === last;
    state.run.hidden = state.guided && state.index !== last;
    state.toggle.disabled = state.back.disabled = state.next.disabled = busy(state);
    if (state.guided && state.index === last) summary(state);
  }
  function setStep(state, index, focus = true) {
    state.index = index;
    sync(state);
    if (focus) state.steps[index].querySelector('h3').focus();
  }
  function advance(state, index) {
    if (busy(state)) return;
    if (index > state.index) {
      // A forward jump validates every earlier step, so review cannot hide missing values.
      for (let i = 0; i < index; i++) if (!validate(state, state.steps[i])) return;
    }
    setStep(state, index);
  }
  function mount(config) {
    const form = $(config.form),
      run = config.run ? $(config.run) : form.querySelector('[type="submit"]'),
      state = { config, form, run, steps: [], buttons: [], index: 0, guided: true };
    form.noValidate = true;
    form.classList.add('report-guided-form');
    if (config.key === 'inventory') $('inventory-owner').required = true;
    const header = document.createElement('div');
    header.className = 'report-guide-header';
    const instruction = document.createElement('p');
    instruction.textContent =
      'اختر نوع التقرير أعلاه، ثم أكمل الخطوات. لن يبدأ الحساب حتى تراجع المدخلات وتضغط زر الإنشاء.';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = config.key + '-guide-toggle';
    state.toggle = toggle;
    header.append(instruction, toggle);
    const nav = document.createElement('nav');
    nav.className = 'report-guide-nav';
    nav.setAttribute('aria-label', 'خطوات إعداد التقرير');
    state.nav = nav;
    const container = document.createElement('div');
    for (const [title, ids] of [...config.groups, ['المراجعة والإنشاء', []]]) {
      const step = document.createElement('section'),
        heading = document.createElement('h3'),
        fields = document.createElement('div');
      step.className = 'report-guide-step';
      step.id = config.key + '-guide-step-' + state.steps.length;
      heading.tabIndex = -1;
      heading.textContent = title;
      fields.className = 'report-grid';
      for (const id of ids) {
        const input = $(id);
        if (input) fields.append(fieldNode(input));
      }
      step.append(heading, fields);
      const index = state.steps.length,
        button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-controls', step.id);
      button.textContent = index + 1 + '. ' + title;
      button.onclick = () => advance(state, index);
      nav.append(button);
      state.buttons.push(button);
      state.steps.push(step);
      container.append(step);
    }
    state.reviewContent = document.createElement('div');
    const review = state.steps.at(-1);
    review.classList.add('report-guide-review');
    const caution = document.createElement('p');
    caution.textContent =
      config.key === 'inventory'
        ? 'راجع الدولة أو الجهة قبل إنشاء الحصر.'
        : 'راجع المكان والفترة والتوقيت والأقمار. النتائج تقديرات من العناصر المدارية المتاحة؛ المرور الهندسي لا يثبت الرؤية أو التصوير.';
    review.append(caution, state.reviewContent);
    if (config.advanced.length) {
      const details = document.createElement('details'),
        title = document.createElement('summary');
      details.id = config.key + '-guide-advanced';
      details.className = 'report-guide-advanced';
      title.textContent = 'خيارات متقدمة · تُحفظ قيمها عند الإغلاق';
      details.append(title);
      for (const id of config.advanced) details.append(fieldNode($(id)));
      state.steps.at(-2).append(details);
    }
    const footer = document.createElement('div'),
      back = document.createElement('button'),
      next = document.createElement('button');
    footer.className = 'report-guide-actions';
    for (const b of [back, next]) b.type = 'button';
    back.id = config.key + '-guide-back';
    next.id = config.key + '-guide-next';
    back.textContent = 'السابق';
    next.textContent = 'التالي';
    back.onclick = () => {
      if (!busy(state)) setStep(state, state.index - 1);
    };
    next.onclick = () => advance(state, state.index + 1);
    footer.append(back, next);
    state.back = back;
    state.next = next;
    // All fields remain the original nodes in the original form; no alternate calculation path.
    for (const grid of form.querySelectorAll(':scope > .report-grid'))
      if (!grid.children.length) grid.remove();
    form.prepend(header, nav, container, footer);
    toggle.onclick = () => {
      if (!busy(state)) {
        state.guided = !state.guided;
        sync(state);
      }
    };
    form.addEventListener(
      'submit',
      (event) => {
        if (busy(state)) return;
        if (state.guided && state.index < state.steps.length - 1) {
          event.preventDefault();
          event.stopImmediatePropagation();
          advance(state, state.index + 1);
        } else if (!validate(state)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    form.addEventListener('focusout', (event) => {
      const input = event.target;
      if (input.matches('input,select,textarea') && !input.validity.valid) {
        const found = collect(state, input.closest('.report-guide-step'));
        if (found.has(input)) errorAt(input, found.get(input));
      }
    });
    const edited = () => {
      if ([...errors.keys()].some((input) => form.contains(input))) validate(state, null, false);
      if (state.guided && state.index === state.steps.length - 1) summary(state);
    };
    form.addEventListener('input', edited);
    form.addEventListener('change', edited);
    const watch = config.cancel ? $(config.cancel) : run;
    new MutationObserver(() => sync(state)).observe(watch, {
      attributes: true,
      attributeFilter: ['disabled'],
    });
    states.push(state);
    sync(state);
  }
  configs.forEach(mount);
  document.addEventListener('madar-language', () => {
    for (const entry of errors.values()) entry.node.textContent = T(entry.message);
    for (const state of states)
      if (state.guided && state.index === state.steps.length - 1) summary(state);
  });
})(window);
