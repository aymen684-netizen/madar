(function (root) {
  'use strict';
  const clockFormats = new Map();
  function formatClock(date, { language = 'ar', offset = 3 } = {}) {
    const english = language === 'en',
      utc = Number(offset) === 0;
    const key = `${english}:${utc}`;
    let formats = clockFormats.get(key);
    if (!formats) {
      const locale = english ? 'en-GB' : 'ar-SA';
      const common = {
        numberingSystem: 'latn',
        timeZone: utc ? 'UTC' : 'Asia/Riyadh',
        dateStyle: 'medium',
      };
      formats = {
        gregorian: new Intl.DateTimeFormat(locale, {
          ...common,
          calendar: 'gregory',
          timeStyle: 'medium',
        }),
        hijri: new Intl.DateTimeFormat(locale, { ...common, calendar: 'islamic-umalqura' }),
      };
      clockFormats.set(key, formats);
    }
    const zone = utc ? 'UTC' : english ? 'Riyadh' : 'الرياض';
    return `${english ? 'Gregorian' : 'ميلادي'}: ${formats.gregorian.format(date)} · ${zone}\n${english ? 'Hijri' : 'هجري'}: ${formats.hijri.format(date)}`;
  }
  function create({
    document,
    now = () => new Date(),
    getTime,
    getState,
    setState,
    onChange,
    onRefresh,
  }) {
    const $ = (id) => document.getElementById(id);
    function sync() {
      const state = getState(),
        paused = !!state.paused && !state.fixedTime;
      $('pause').disabled = !!state.fixedTime;
      $('pause').textContent = paused ? '▶' : 'Ⅱ';
      $('pause').classList.toggle('active', paused);
      $('pause').setAttribute('aria-label', paused ? 'استئناف التحديث' : 'إيقاف التحديث مؤقتًا');
    }
    function fill(d) {
      const shifted = new Date(d.getTime() + Number($('timezone').value) * 3600000);
      $('date').value = shifted.toISOString().slice(0, 10);
      $('hour').value = String(shifted.getUTCHours()).padStart(2, '0');
      $('minute').value = String(shifted.getUTCMinutes()).padStart(2, '0');
      $('second').value = String(shifted.getUTCSeconds()).padStart(2, '0');
      weekday();
    }
    function read() {
      const ds = $('date').value,
        fields = ['hour', 'minute', 'second'].map((id) => $(id).value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds) || fields.some((v) => v.trim() === ''))
        throw Error('أدخل التاريخ والساعة والدقيقة والثانية.');
      const [h, m, s] = fields.map(Number);
      if (
        ![h, m, s].every(Number.isInteger) ||
        h < 0 ||
        h > 23 ||
        m < 0 ||
        m > 59 ||
        s < 0 ||
        s > 59
      )
        throw Error('الساعة من 0 إلى 23، والدقائق والثواني من 0 إلى 59.');
      const offset = Number($('timezone').value),
        base = new Date(ds + 'T00:00:00Z');
      if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== ds)
        throw Error('التاريخ غير صالح.');
      return new Date(base.getTime() + (h - offset) * 3600000 + m * 60000 + s * 1000);
    }
    function weekday() {
      const d = new Date($('date').value + 'T12:00:00Z');
      $('weekday').textContent = Number.isFinite(d.getTime())
        ? 'اليوم: ' +
          new Intl.DateTimeFormat('ar-SA', { weekday: 'long', timeZone: 'UTC' }).format(d)
        : '';
    }
    function bind() {
      fill(new Date(now()));
      sync();
      $('date').onchange = weekday;
      $('timezone').onchange = () => {
        fill(getTime());
        onRefresh();
      };
      $('time-form').onsubmit = (event) => {
        event.preventDefault();
        try {
          setState({ fixedTime: read(), paused: false, pausedAt: null });
          sync();
          $('time-message').textContent =
            'موضع محسوب من العناصر المتاحة؛ لم يُحمّل أرشيف مداري خاص بالتاريخ المختار.';
          onChange({ status: '◷ وقت محدد · المواقع تقديرية', list: true, focus: true });
        } catch (error) {
          $('time-message').textContent = error.message;
        }
      };
      $('live').onclick = () => {
        setState({ fixedTime: null, paused: false, pausedAt: null });
        sync();
        fill(new Date(now()));
        $('time-message').textContent = '● موضع محسوب بالوقت الحالي';
        onChange({
          status: '● الوقت الحالي · تحديث الحساب كل ثانية، وليس قياسًا جديدًا',
          list: true,
        });
      };
      $('pause').onclick = () => {
        const state = getState();
        if (state.fixedTime) return;
        const paused = !state.paused;
        setState({ paused, ...(paused ? { pausedAt: new Date(now()) } : {}) });
        sync();
        onChange({ list: false });
      };
    }
    return Object.freeze({ bind, fill, read, weekday, sync });
  }
  const api = Object.freeze({ create, formatClock });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TimeControls = api;
})(typeof window !== 'undefined' ? window : globalThis);
