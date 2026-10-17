(function () {
  'use strict';
  const $ = (id) => document.getElementById(id),
    panel = $('guide-panel'),
    trigger = $('program-guide'),
    input = $('guide-search'),
    terms = Array.from(panel.querySelectorAll('.guide-term')),
    index = terms.map((el) => ({ el, text: CatalogSearch.normalize(el.textContent) }));
  function filter() {
    const tokens = CatalogSearch.normalize(input.value).split(' ').filter(Boolean);
    let count = 0;
    for (const entry of index) {
      entry.el.hidden = !tokens.every((t) =>
        CatalogSearch.normalize(
          entry.text +
            ' ' +
            entry.el.textContent +
            ' ' +
            (window.MadarI18n?.translate(entry.text, 'en') || ''),
        ).includes(t),
      );
      if (!entry.el.hidden) count++;
    }
    $('guide-count').textContent = count + ' من ' + terms.length + ' مصطلحًا وتعريفًا';
    $('guide-empty').hidden = count > 0;
  }
  $('guide-close').onclick = () => {
    panel.open = false;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
    trigger.scrollIntoView({ block: 'center', behavior: 'instant' });
  };
  panel.addEventListener('toggle', () => trigger.setAttribute('aria-expanded', String(panel.open)));
  input.addEventListener('input', filter);
  for (const button of document.querySelectorAll('[data-security-setting]'))
    button.onclick = () => {
      const settings = $('privacy-panel'),
        target = $(button.dataset.securitySetting);
      settings.open = true;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
    };
  const metricHelp = {
    الارتفاع: 'الارتفاع التقريبي فوق سطح الأرض، بالكيلومتر.',
    السرعة: 'مقدار السرعة المدارية المحسوبة، بالكيلومتر في الثانية.',
    'الميل المداري': 'زاوية مستوى المدار مع خط الاستواء، وليست اتجاه الكاميرا.',
    'زمن الدورة': 'مدة دورة حول الأرض؛ لا تعني تكرار المرور فوق البلد في كل دورة.',
    'المعرّف الدولي': 'معرّف يتكون من سنة الإطلاق ورقمه في السنة ورمز الجسم؛ يختلف عن رقم NORAD.',
    اللامركزية: 'مقياس استطالة المدار؛ الصفر مدار دائري.',
    'الحضيض التقريبي': 'ارتفاع أقرب موضع في المدار عن الأرض.',
    'الأوج التقريبي': 'ارتفاع أبعد موضع في المدار عن الأرض.',
    'الدورات في اليوم': 'عدد الدورات المدارية في اليوم، وليس عدد مرات المرور فوق بلد معين.',
  };
  document.addEventListener('madar-language', filter);
  window.MadarGuide = { description: (label) => metricHelp[label] || '' };
})();
