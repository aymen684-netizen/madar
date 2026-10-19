(function () {
  'use strict';
  const done = new WeakSet();
  const scope = '#shell-reports, #map-tools-dialog, #time-form, .catalog-controls';
  const control = 'input:not([type="checkbox"]):not([type="radio"]), select, textarea, .date-entry';
  function arrange(label) {
    if (
      done.has(label) ||
      !label.closest(scope) ||
      label.closest('.time-fields') ||
      (label.closest('.analysis-period') && label.querySelector('input[type="time"]'))
    )
      return;
    const field = [...label.children].find((n) => n.matches(control));
    if (field) {
      const text = [...label.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!text.length) return;
      const caption = document.createElement('span');
      caption.className = 'field-caption';
      for (const node of text) caption.append(node);
      label.prepend(caption);
      label.classList.add('inline-field');
      done.add(label);
      return;
    }
    if (!label.htmlFor) return;
    const input = document.getElementById(label.htmlFor);
    const entry = input?.closest('.date-entry') || input;
    if (!entry || !input.matches(control) || label.nextElementSibling !== entry) return;
    const row = document.createElement('div');
    row.className = 'inline-field';
    label.before(row);
    row.append(label, entry);
    label.classList.add('field-caption');
    done.add(label);
  }
  document.querySelectorAll('label').forEach(arrange);
  new MutationObserver((records) => {
    const labels = new Set();
    for (const record of records)
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1 || node.namespaceURI === 'http://www.w3.org/2000/svg') continue;
        const parent = node.closest('label');
        if (parent) labels.add(parent);
        node.querySelectorAll('label').forEach((label) => labels.add(label));
      }
    labels.forEach(arrange);
  }).observe(document.body, { childList: true, subtree: true });
})();
