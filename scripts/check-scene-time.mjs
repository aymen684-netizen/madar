import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = vm.createContext({});
for (const file of ['globe-scene.js', 'time-controls.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), context);
function dom() {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) {
      const n = {
        value: '',
        textContent: '',
        children: [],
        attributes: new Map(),
        clientWidth: 390,
        clientHeight: 700,
        append(...items) {
          this.children.push(...items);
        },
        replaceChildren() {
          this.children = [];
        },
        setAttribute(key, value) {
          this.attributes.set(key, value);
        },
        classList: {
          active: false,
          toggle(_, value) {
            this.active = value;
          },
        },
      };
      nodes.set(id, n);
    }
    return nodes.get(id);
  };
  return {
    node,
    document: {
      getElementById: node,
      createElement: () => ({ textContent: '' }),
      head: node('head'),
    },
  };
}
const ui = dom(),
  clock = new Date('2026-10-17T22:15:30Z');
let state = { fixedTime: null, paused: false, pausedAt: null },
  changes = [],
  refreshed = 0;
ui.node('timezone').value = '3';
const time = context.TimeControls.create({
  document: ui.document,
  now: () => clock,
  getState: () => state,
  setState: (patch) => {
    state = { ...state, ...patch };
  },
  getTime: () => state.fixedTime || (state.paused ? state.pausedAt : clock),
  onChange: (change) => changes.push(change),
  onRefresh: () => {
    refreshed++;
  },
});
time.bind();
assert.equal(ui.node('date').value, '2026-10-18');
assert.equal(ui.node('hour').value, '01');
assert.equal(
  time.read().toISOString(),
  clock.toISOString(),
  'Riyadh fields round-trip across UTC midnight',
);
ui.node('timezone').value = '0';
ui.node('timezone').onchange();
assert.equal(refreshed, 1);
assert.equal(ui.node('date').value, '2026-10-17');
assert.equal(ui.node('hour').value, '22');
for (const [field, value] of [
  ['date', '2026-02-30'],
  ['hour', '24'],
  ['minute', '60'],
  ['second', '-1'],
  ['hour', '1.5'],
  ['second', ''],
]) {
  time.fill(clock);
  ui.node(field).value = value;
  assert.throws(() => time.read());
}
time.fill(clock);
let prevented = false;
ui.node('time-form').onsubmit({
  preventDefault() {
    prevented = true;
  },
});
assert(prevented);
assert.equal(state.fixedTime.toISOString(), clock.toISOString());
assert.equal(state.paused, false);
assert.equal(ui.node('pause').disabled, true);
assert.equal(changes.at(-1).focus, true);
const before = changes.length;
ui.node('pause').onclick();
assert.equal(changes.length, before, 'pause is ignored during fixed-time display');
ui.node('live').onclick();
assert.equal(state.fixedTime, null);
assert.equal(state.pausedAt, null);
assert.equal(ui.node('pause').disabled, false);
ui.node('pause').onclick();
assert.equal(state.paused, true);
assert.equal(state.pausedAt.toISOString(), clock.toISOString());
assert.equal(ui.node('pause').attributes.get('aria-label'), 'استئناف التحديث');
ui.node('pause').onclick();
assert.equal(state.paused, false);
assert.equal(ui.node('pause').attributes.get('aria-label'), 'إيقاف التحديث مؤقتًا');
time.fill(clock);
ui.node('hour').value = '99';
ui.node('time-form').onsubmit({ preventDefault() {} });
assert.equal(state.fixedTime, null);
assert(ui.node('time-message').textContent.includes('الساعة من 0'));
state = { fixedTime: null, paused: true, pausedAt: clock };
time.sync();
assert.equal(ui.node('pause').disabled, false);
assert.equal(ui.node('pause').textContent, '▶');
assert.equal(ui.node('pause').classList.active, true);
assert.equal(ui.node('pause').attributes.get('aria-label'), 'استئناف التحديث');
time.fill(clock);
ui.node('time-form').onsubmit({ preventDefault() {} });
assert.equal(state.pausedAt, null);
assert.equal(ui.node('pause').disabled, true);
assert.equal(ui.node('pause').textContent, 'Ⅱ');
assert.equal(ui.node('pause').classList.active, false);
assert.equal(ui.node('pause').attributes.get('aria-label'), 'إيقاف التحديث مؤقتًا');

function renderer() {
  const calls = new Map(),
    controls = {},
    originalFont = { name: 'original' };
  let camera = { lat: 0, lng: 0, altitude: 2 },
    font = originalFont;
  const world = new Proxy(
    {},
    {
      get(_, name) {
        if (name === 'controls') return () => controls;
        if (name === 'pointOfView')
          return (...args) => {
            if (!args.length) return camera;
            camera = args[0];
            calls.set(name, args);
            return world;
          };
        if (name === 'labelTypeFace')
          return (...args) => {
            if (!args.length) return font;
            font = args[0];
            calls.set(name, args);
            return world;
          };
        return (...args) => {
          calls.set(name, args);
          return world;
        };
      },
    },
  );
  return { world, calls, controls, originalFont };
}
function scene({ failModern = false, failCompat = false, width = 390, height = 844 } = {}) {
  const elements = dom(),
    render = renderer();
  let linked = null,
    selected = null,
    refreshed = 0,
    attached = 0,
    errors = 0,
    satellite = false,
    observed;
  function Globe(_holder, options) {
    if (options) {
      if (failModern) throw Error('modern unavailable');
      return render.world;
    }
    if (failCompat) throw Error('compat unavailable');
    return () => render.world;
  }
  const api = context.GlobeScene.create({
    document: elements.document,
    getGlobe: () => Globe,
    viewport: () => ({ width, height }),
    observeSize: (callback, holder) => {
      observed = holder;
      callback();
    },
    appearance: { category: () => 'leo', color: () => '#123456' },
    view: {
      isSatelliteMode: () => satellite,
      selectedId: () => 1,
      fleet: () => ({ has: (id) => id === 2, color: () => null }),
    },
    extensions: () => ({
      picking: {
        handled: (event) => !!event?.handled,
        install: () => {
          attached++;
        },
      },
      quality: { attach() {} },
      lifecycle: { attach() {} },
      draft: { restoreCamera() {} },
    }),
    particleObject: (point) => point.object,
    events: {
      world: (world) => {
        linked = world;
      },
      select: (object) => {
        selected = object;
      },
      candidates: function* () {},
      refresh: () => {
        refreshed++;
      },
      error: () => {
        errors++;
      },
    },
  });
  return {
    api,
    elements,
    render,
    get linked() {
      return linked;
    },
    get selected() {
      return selected;
    },
    get refreshed() {
      return refreshed;
    },
    get errors() {
      return errors;
    },
    get attached() {
      return attached;
    },
    get observed() {
      return observed;
    },
    setSatellite(value) {
      satellite = value;
    },
  };
}
const map = scene();
map.api.initialize();
assert.equal(map.linked, map.render.world);
assert.equal(map.attached, 1);
assert.equal(map.observed, map.elements.node('globe'));
assert.equal(map.render.controls.minDistance, 110);
assert.equal(map.render.calls.get('particlesSize')[0], 3);
assert.equal(map.render.calls.get('pointRadius')[0]({ id: 1 }), 0.34);
assert.equal(map.render.calls.get('pointRadius')[0]({ id: 2 }), 0.27);
const object = { id: 1, name: '<b>Satellite</b>' };
map.render.calls.get('onPointClick')[0]({ obj: object }, {});
assert.equal(map.selected, object);
map.render.calls.get('onPointClick')[0]({ obj: null }, { handled: true });
assert.equal(map.selected, object);
map.api.applyMarkerMode(map.render.world, true);
assert.equal(map.render.calls.get('labelTypeFace')[0].familyName, 'Madar Satellite');
map.api.applyMarkerMode(map.render.world, false);
assert.equal(map.render.calls.get('labelTypeFace')[0], map.render.originalFont);
map.api.zoom(map.render.world, 100);
assert.equal(map.render.calls.get('pointOfView')[0].altitude, 9);
map.api.zoom(map.render.world, 0.0001);
assert.equal(map.render.calls.get('pointOfView')[0].altitude, 0.3);
map.api.reset(map.render.world);
assert.equal(map.render.calls.get('pointOfView')[1], 700);
assert.equal(map.render.calls.get('pointOfView')[0].altitude, (844 / 390) * 1.4);
const desktop = scene({ width: 1440, height: 1000 });
desktop.api.initialize();
assert.equal(desktop.render.calls.get('pointOfView')[0].altitude, 2.6);
const fallback = scene({ failModern: true });
fallback.api.initialize();
assert.equal(fallback.linked, null);
const script = fallback.elements.node('head').children[0];
assert.equal(script.src, 'vendor/globe-compat.min.js');
script.onload();
assert.equal(fallback.linked, fallback.render.world);
assert.equal(fallback.refreshed, 1);
const failed = scene({ failModern: true, failCompat: true });
failed.api.initialize();
failed.elements.node('head').children[0].onload();
assert.equal(failed.linked, null);
assert.equal(failed.errors, 1);
assert.equal(failed.elements.node('map-error').hidden, false);
assert.equal(failed.elements.node('focus').disabled, true);
const offline = scene({ failModern: true });
offline.api.initialize();
offline.elements.node('head').children[0].onerror();
assert(offline.elements.node('map-error').textContent.includes('تحميل العارض المتوافق'));
console.log(
  'PASS: isolated time controls, UTC/Riyadh midnight round-trip, invalid dates, fixed/live/pause routing; globe configuration, picking, fonts, camera bounds, resize and compatibility success/failure',
);
