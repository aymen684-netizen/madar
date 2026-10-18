(function (root) {
  'use strict';
  const R = 6371,
    rad = Math.PI / 180;
  function footprint(p, elevation = 0) {
    if (
      !p ||
      ![p.lat, p.lng, p.h, elevation].every(Number.isFinite) ||
      p.h <= 0 ||
      elevation < 0 ||
      elevation > 89
    )
      return [];
    const a = Math.acos((R / (R + p.h)) * Math.cos(elevation * rad)) - elevation * rad,
      lat = p.lat * rad,
      lon = p.lng * rad,
      ring = [];
    for (let i = 0; i <= 72; i++) {
      const b = (i * 2 * Math.PI) / 72,
        y = Math.asin(
          Math.max(
            -1,
            Math.min(1, Math.sin(lat) * Math.cos(a) + Math.cos(lat) * Math.sin(a) * Math.cos(b)),
          ),
        ),
        x =
          lon +
          Math.atan2(
            Math.sin(b) * Math.sin(a) * Math.cos(lat),
            Math.cos(a) - Math.sin(lat) * Math.sin(y),
          );
      ring.push([y / rad, ((x / rad + 540) % 360) - 180, 0.002]);
    }
    ring.fleetColor = '#a8e8f0';
    return ring;
  }
  function polar(azimuth, elevation) {
    if (![azimuth, elevation].every(Number.isFinite)) return null;
    const r = Math.max(0, Math.min(90, 90 - elevation));
    return [110 + r * Math.sin(azimuth * rad), 110 - r * Math.cos(azimuth * rad)];
  }
  function sky(S, orbit, observer, pass) {
    if (!pass || !(pass.exit > pass.entry)) return [];
    const out = [],
      rec = root.OrbitData.satrec(S, orbit);
    for (let i = 0; i <= 48; i++) {
      const t = pass.entry + ((pass.exit - pass.entry) * i) / 48,
        look = root.ObserverEngine.look(S, rec, t, observer);
      // Azimuth is unstable near zenith: break the path there rather than invent a direction.
      out.push(look && look.elevation < 89.9 ? polar(look.azimuth, look.elevation) : null);
    }
    return out;
  }
  function escape(value) {
    return String(value)
      .replaceAll('\\', '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replaceAll(';', '\\;')
      .replaceAll(',', '\\,');
  }
  function fold(line) {
    const encoder = new TextEncoder(),
      parts = [];
    let part = '',
      size = 0;
    for (const c of line) {
      const n = encoder.encode(c).length;
      if (size + n > 75) {
        parts.push(part);
        part = ' ';
        size = 1;
      }
      part += c;
      size += n;
    }
    return [...parts, part].join('\r\n');
  }
  function calendar(passes, { language = 'ar', now = Date.now() } = {}) {
    const stamp = (t) =>
        new Date(t)
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, ''),
      en = language === 'en',
      lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Madar//Satellite passes//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
      ];
    for (const p of passes) {
      if (![p.entry, p.exit].every(Number.isFinite) || p.exit <= p.entry) continue;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${p.id}-${Math.round(p.entry)}@madar.local`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(p.entry)}`,
        `DTEND:${stamp(p.exit)}`,
        'SUMMARY:' + escape((en ? 'Satellite pass: ' : 'مرور القمر: ') + p.name + ' · ' + p.id),
        'DESCRIPTION:' +
          escape(
            en
              ? 'Geometric prediction from available orbital elements; visibility is not guaranteed.'
              : 'تنبؤ هندسي من العناصر المتاحة؛ لا يضمن الرؤية.',
          ),
        'END:VEVENT',
      );
    }
    return lines.concat('END:VCALENDAR', '').map(fold).join('\r\n');
  }
  root.PassToolsCore = Object.freeze({ footprint, polar, sky, calendar });
})(typeof window !== 'undefined' ? window : globalThis);
