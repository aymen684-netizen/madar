(function (root) {
  'use strict';
  const limit = 500;
  function project(lat, lng, rect) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return null;
    const lon = ((((lng + 180) % 360) + 360) % 360) - 180;
    return {
      x: rect.x + ((lon + 180) / 360) * rect.width,
      y: rect.y + ((90 - lat) / 180) * rect.height,
    };
  }
  function bounded(objects, selected, fleet = []) {
    const priority = new Set([selected, ...fleet]),
      seen = new Set(),
      out = [];
    for (const object of [...objects.filter((o) => priority.has(o.id)), ...objects]) {
      if (!seen.has(object.id)) {
        seen.add(object.id);
        out.push(object);
      }
      if (out.length === limit) break;
    }
    return out;
  }
  function segments(points, rect) {
    const out = [];
    let previous = null;
    for (const point of points) {
      const current = point && project(point.lat, point.lng, rect);
      if (previous && current && Math.abs(current.x - previous.x) <= rect.width / 2)
        out.push([previous, current]);
      previous = current;
    }
    return out;
  }
  function create({ document, holder, position, color, onSelect }) {
    let canvas,
      context,
      panel,
      picker,
      counter,
      texture,
      observer,
      state = null,
      points = [],
      rect,
      optionKey = '',
      track = [],
      trackId = null,
      trackTime = null;
    const active = () => !!context;
    const visible = () => active() && !document.hidden && document.body.dataset.shellView === 'map';
    function draw() {
      if (!visible() || !state) return;
      const width = canvas.clientWidth,
        height = canvas.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(root.devicePixelRatio || 1, 2);
      if (
        canvas.width !== Math.round(width * ratio) ||
        canvas.height !== Math.round(height * ratio)
      ) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = '#080d16';
      context.fillRect(0, 0, width, height);
      const mapWidth = Math.min(width, height * 2),
        mapHeight = mapWidth / 2;
      rect = {
        x: (width - mapWidth) / 2,
        y: (height - mapHeight) / 2,
        width: mapWidth,
        height: mapHeight,
      };
      context.fillStyle = '#102d43';
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (texture.complete && texture.naturalWidth) {
        context.globalAlpha = 0.8;
        context.drawImage(texture, rect.x, rect.y, rect.width, rect.height);
        context.globalAlpha = 1;
      }
      context.strokeStyle = '#7fb1c344';
      context.lineWidth = 1;
      context.beginPath();
      for (let lat = -60; lat <= 60; lat += 30) {
        const p = project(lat, -180, rect);
        context.moveTo(rect.x, p.y);
        context.lineTo(rect.x + rect.width, p.y);
      }
      for (let lng = -180; lng <= 180; lng += 30) {
        const x = rect.x + ((lng + 180) / 360) * rect.width;
        context.moveTo(x, rect.y);
        context.lineTo(x, rect.y + rect.height);
      }
      context.stroke();
      context.strokeStyle = '#e8fff9';
      context.lineWidth = 1.5;
      context.beginPath();
      for (const [a, b] of segments(track, rect)) {
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
      }
      context.stroke();
      for (const point of points) {
        const p = project(point.lat, point.lng, rect),
          selected = point.object.id === state.selected;
        point.screen = p;
        context.beginPath();
        context.arc(p.x, p.y, selected ? 6 : 3.5, 0, 2 * Math.PI);
        context.fillStyle = selected ? '#e8fff9' : color(point.object);
        context.fill();
        if (selected) {
          context.strokeStyle = '#080d16';
          context.lineWidth = 2;
          context.stroke();
        }
      }
    }
    function update(next) {
      state = next;
      if (!visible()) return;
      points = bounded(next.objects, next.selected, next.fleet).flatMap((object) => {
        const p = position(object, next.time);
        return p && project(p.lat, p.lng, { x: 0, y: 0, width: 360, height: 180 })
          ? [{ ...p, object }]
          : [];
      });
      const key = JSON.stringify(points.map((p) => [p.object.id, p.object.name]));
      if (key !== optionKey) {
        optionKey = key;
        picker.replaceChildren();
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '—';
        picker.append(blank);
        for (const { object } of points) {
          const option = document.createElement('option');
          option.value = String(object.id);
          option.textContent = object.name + ' · NORAD ' + object.id;
          picker.append(option);
        }
      }
      picker.value = points.some((p) => p.object.id === next.selected) ? String(next.selected) : '';
      const count =
        points.length.toLocaleString('en-US') + ' / ' + next.objects.length.toLocaleString('en-US');
      if (counter.textContent !== count) counter.textContent = count;
      const selected = points.find((p) => p.object.id === next.selected)?.object;
      if (!selected) {
        track = [];
        trackId = null;
      } else if (
        trackId !== selected.id ||
        trackTime === null ||
        Math.abs(+next.time - trackTime) >= 30000 ||
        (next.exact && +next.time !== trackTime)
      ) {
        trackId = selected.id;
        trackTime = +next.time;
        track = [];
        const period = 1440 / root.OrbitData.fields(selected).motion;
        for (let i = 0; i <= 160; i++)
          track.push(position(selected, new Date(+next.time + (i * period * 60000) / 160)));
      }
      draw();
      return points.length;
    }
    function activate() {
      if (active()) return true;
      canvas = document.createElement('canvas');
      context = canvas.getContext('2d');
      if (!context) return false;
      panel = document.createElement('section');
      panel.id = 'flat-map';
      const tools = document.createElement('div');
      tools.className = 'flat-map-tools';
      const title = document.createElement('strong');
      title.textContent = 'خارطة ثنائية الأبعاد';
      const label = document.createElement('label');
      label.textContent = 'اختيار قمر من الخارطة';
      picker = document.createElement('select');
      picker.id = 'flat-map-select';
      picker.setAttribute('data-no-translate', '');
      label.htmlFor = picker.id;
      counter = document.createElement('span');
      counter.id = 'flat-map-count';
      counter.setAttribute('data-no-translate', '');
      tools.append(title, label, picker, counter);
      const note = document.createElement('p');
      note.id = 'flat-map-note';
      note.textContent =
        'تعرض الخارطة حتى 500 قمر مطابق للتصفية. المواقع تقديرية، والخط مسار أرضي للقمر المحدد. يمكنك الاختيار باللمس أو من القائمة.';
      canvas.id = 'flat-map-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'مواقع الأقمار على خارطة العالم');
      canvas.setAttribute('aria-describedby', note.id);
      panel.append(tools, canvas, note);
      holder.replaceChildren(panel);
      holder.classList.add('has-flat-map');
      texture = new root.Image();
      texture.onload = draw;
      texture.src = 'assets/earth.jpg';
      picker.onchange = () => {
        const point = points.find((p) => String(p.object.id) === picker.value);
        if (point) onSelect(point.object);
      };
      canvas.onclick = (event) => {
        const box = canvas.getBoundingClientRect(),
          x = event.clientX - box.left,
          y = event.clientY - box.top;
        if (
          !rect ||
          x < rect.x ||
          x > rect.x + rect.width ||
          y < rect.y ||
          y > rect.y + rect.height
        )
          return;
        let nearest = null,
          distance = 22;
        for (const point of points) {
          if (!point.screen) continue;
          const d = Math.hypot(point.screen.x - x, point.screen.y - y);
          if (d < distance) {
            nearest = point;
            distance = d;
          }
        }
        if (nearest) onSelect(nearest.object);
      };
      observer = new root.ResizeObserver(draw);
      observer.observe(canvas);
      return true;
    }
    return { activate, active, update };
  }
  root.FlatMap = { create, project, bounded, segments, limit };
})(window);
