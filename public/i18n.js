(function (root) {
  'use strict';
  let lang = 'ar';
  try {
    lang = localStorage.getItem('madar-language') === 'en' ? 'en' : 'ar';
  } catch {}
  let dictionary = {},
    patterns = null,
    ready = false,
    appliedLanguage = null;
  const originals = new WeakMap(),
    attributes = new WeakMap(),
    translations = new Map();
  function translationPatterns() {
    if (!patterns)
      patterns = Object.entries(dictionary)
        .filter(([key]) => key.length > 1)
        .sort((a, b) => b[0].length - a[0].length)
        .map(([a, b]) => {
          const escape = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
          return [
            new RegExp(
              (/^[\u0620-\u064a]/.test(a) ? '(?<![\u0620-\u064a])' : '') +
                escape +
                (/[\u0620-\u064a]$/.test(a) ? '(?![\u0620-\u064a])' : ''),
              'g',
            ),
            b,
          ];
        });
    return patterns;
  }
  function translate(value, to = lang) {
    const text = String(value ?? '');
    if (to !== 'en' || !ready || !/[\u0600-\u06ff]/.test(text)) return text;
    if (translations.has(text)) return translations.get(text);
    const trim = text.trim();
    if (dictionary[trim]) return text.replace(trim, dictionary[trim]);
    // HTML source formatting can wrap a single displayed sentence across lines.
    const normalized = trim.replace(/\s+/g, ' ');
    if (dictionary[normalized]) return text.replace(trim, dictionary[normalized]);
    let out = text
      .replace(/(^|[\s/])ف(?=\d)/g, '$1P')
      .replace(/عرض (-?\d+(?:\.\d+)?)°، طول /g, 'Latitude $1°, longitude ');
    for (const [a, b] of translationPatterns()) out = out.replace(a, () => b);
    if (translations.size >= 2000) translations.delete(translations.keys().next().value);
    translations.set(text, out);
    return out;
  }
  function nodeText(n) {
    const text = n.nodeValue;
    if (!text?.trim()) return;
    let entry = originals.get(n);
    if (!entry || (text !== entry.ar && text !== entry.en)) entry = { ar: text, en: null };
    originals.set(n, entry);
    const next = lang === 'en' ? (entry.en ??= translate(entry.ar, 'en')) : entry.ar;
    if (text !== next) n.nodeValue = next;
  }
  function scan(node) {
    if (lang === 'en' && !ready) return;
    if (node.nodeType === 3) {
      if (!node.parentElement?.closest('script,style,textarea,[data-no-translate],svg'))
        nodeText(node);
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.nodeType === 1 && node.matches('script,style,textarea,[data-no-translate],svg'))
      return;
    if (node.nodeType === 1) {
      let saved = attributes.get(node) || {};
      for (const key of ['placeholder', 'aria-label', 'title', 'data-hint']) {
        const v = node.getAttribute(key);
        if (v == null) continue;
        let e = saved[key];
        if (!e || (v !== e.ar && v !== e.en)) e = { ar: v, en: null };
        saved[key] = e;
        const next = lang === 'en' ? (e.en ??= translate(e.ar, 'en')) : e.ar;
        if (v !== next) node.setAttribute(key, next);
      }
      attributes.set(node, saved);
    }
    for (const child of node.childNodes) scan(child);
  }
  function wordLibrary(D) {
    if (lang !== 'en') return D;
    const out = { ...D };
    for (const key of ['Paragraph', 'TextRun', 'Table']) {
      const Base = D[key];
      out[key] = class extends Base {
        constructor(opts) {
          if (typeof opts === 'string') opts = translate(opts);
          else if (opts && typeof opts === 'object') {
            opts = { ...opts };
            if (typeof opts.text === 'string') opts.text = translate(opts.text);
            if (key === 'Paragraph') {
              opts.bidirectional = false;
              if (opts.alignment === D.AlignmentType.RIGHT) opts.alignment = D.AlignmentType.LEFT;
            }
            if (key === 'TextRun') opts.rightToLeft = false;
            if (key === 'Table') opts.visuallyRightToLeft = false;
          }
          super(opts);
        }
      };
    }
    return out;
  }
  function setLanguage(value) {
    const previous = appliedLanguage;
    lang = value === 'en' ? 'en' : 'ar';
    try {
      localStorage.setItem('madar-language', lang);
    } catch {}
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    observer.disconnect();
    if ((lang === 'en' && ready) || previous === 'en') scan(document.documentElement);
    appliedLanguage = lang === 'en' && ready ? 'en' : 'ar';
    if (appliedLanguage === 'en')
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'aria-label', 'title'],
      });
    document.dispatchEvent(new CustomEvent('madar-language', { detail: lang }));
    return lang;
  }
  const observer = new MutationObserver((records) => {
    if (lang !== 'en' || !ready) return;
    for (const r of records) {
      if (r.type === 'characterData') scan(r.target);
      else if (r.type === 'attributes') scan(r.target);
      else for (const n of r.addedNodes) scan(n);
    }
  });
  function start() {
    setLanguage(lang);
  }
  const promise = fetch('data/en.json?v=77')
    .then((r) => {
      if (!r.ok) throw Error('Language unavailable');
      return r.json();
    })
    .then((d) => {
      dictionary = d;
      ready = true;
      start();
    })
    .catch(() => {
      lang = 'ar';
      start();
      document.dispatchEvent(new Event('madar-language-error'));
    });
  for (const method of ['alert', 'confirm', 'prompt'])
    if (typeof root[method] === 'function') {
      const native = root[method].bind(root);
      root[method] = (message, ...args) => native(translate(message), ...args);
    }
  function original(n) {
    if (!n) return '';
    if (n.nodeType === 3) {
      const entry = originals.get(n),
        text = n.nodeValue;
      return entry && (text === entry.ar || text === entry.en) ? entry.ar : text;
    }
    return Array.from(n.childNodes || [])
      .map(original)
      .join('');
  }
  root.MadarI18n = {
    translate,
    wordLibrary,
    setLanguage,
    get language() {
      return lang;
    },
    ready: promise,
    original,
    scan,
  };
})(window);
