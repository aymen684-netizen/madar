(function (root) {
  'use strict';

  // Each instance owns its worker, response generation and reusable particle cache.
  // Application state and rendering lifecycle are supplied through explicit callbacks.
  function create({ getWorld, createWorker, serialize, category, isSceneActive, onFailure }) {
    let worker = null,
      failed = false,
      list = [],
      token = 0,
      busy = false,
      lastTime = 0,
      pending = null,
      particles = [];
    function supported() {
      return (
        !failed &&
        typeof createWorker === 'function' &&
        getWorld() &&
        typeof getWorld().particlesData === 'function'
      );
    }
    function start() {
      if (worker || failed) return worker;
      try {
        worker = createWorker();
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type !== 'positions' || m.token !== token) return;
          busy = false;
          if (!isSceneActive()) {
            pending = null;
            lastTime = NaN;
            return;
          }
          const b = m.buf,
            out = [];
          for (let i = 0; i < list.length; i++) {
            const lat = b[i * 3];
            if (lat === lat)
              out.push(
                particles[i]
                  ? Object.assign(particles[i], { lat, lng: b[i * 3 + 1], alt: b[i * 3 + 2] })
                  : (particles[i] = {
                      i,
                      lat,
                      lng: b[i * 3 + 1],
                      alt: b[i * 3 + 2],
                      regime: category(list[i]),
                    }),
              );
          }
          const buckets = new Map();
          for (const point of out) {
            if (!buckets.has(point.regime)) {
              const group = [];
              group.regime = point.regime;
              buckets.set(point.regime, group);
            }
            buckets.get(point.regime).push(point);
          }
          getWorld()?.particlesData([...buckets.values()]);
          if (pending) {
            const t = pending;
            pending = null;
            tick(t);
          }
        };
        worker.onerror = () => {
          failed = true;
          worker?.terminate();
          worker = null;
          getWorld()?.particlesData([]);
          onFailure();
        };
      } catch {
        failed = true;
      }
      return worker;
    }
    function tick(time) {
      if (!worker || !list.length) return;
      if (!isSceneActive()) {
        pending = null;
        return;
      }
      if (busy) {
        pending = time;
        return;
      }
      busy = true;
      lastTime = +time;
      worker.postMessage({ type: 'tick', token, time: +time });
    }
    function show(objs, time) {
      if (!supported()) return;
      const changed =
        objs !== list && (objs.length !== list.length || objs.some((o, i) => o !== list[i]));
      if (changed) {
        list = objs;
        particles = [];
        token++;
        busy = false;
        pending = null;
        getWorld().particlesData([]);
        if (!objs.length) return;
        if (!start()) return;
        worker.postMessage({ type: 'set', token, objects: objs.map(serialize) });
        tick(time);
        return;
      }
      list = objs;
      if (objs.length && +time !== lastTime) tick(time);
    }
    return { supported, show, object: (d) => list[d?.i] };
  }

  root.MapSwarm = { create };
})(typeof window !== 'undefined' ? window : globalThis);
