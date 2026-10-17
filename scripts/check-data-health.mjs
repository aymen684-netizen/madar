import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.textContent = '';
  }
  append(node) {
    this.children.push(node);
  }
  replaceChildren() {
    this.children = [];
  }
  set innerHTML(_) {
    throw Error('Health content must use text nodes');
  }
}
function view() {
  const nodes = new Map();
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  };
  return { node, document: { getElementById: node, createElement: () => new Element() } };
}
const context = vm.createContext({});
for (const file of ['orbit-data.js', 'data-health.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), context);
const orbit = context.OrbitData,
  seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  object = orbit.fromOmm(
    { ...seed, EPOCH: '2026-10-17T00:00:00Z', OBJECT_NAME: '<b>TEST</b>' },
    { mode: 'live', fetchedAt: 100 },
  ),
  epoch = orbit.epoch(object),
  ui = view(),
  other = view();
let clock = epoch + 23 * 3600000;
const health = context.DataHealth.create({ document: ui.document, orbit, now: () => clock }),
  second = context.DataHealth.create({ document: other.document, orbit, now: () => clock }),
  dataset = [object],
  sourceDataset = [object],
  input = {
    object,
    time: clock,
    byUser: false,
    fixedTime: false,
    paused: false,
    dataset,
    sourceDataset,
    connection: { state: 'live', transport: 'server' },
  },
  text = (id) => ui.node(id).textContent;
const original = JSON.stringify(object);
health.render(input);
assert.equal(ui.node('data-health-summary').children[0].textContent, 'حالة بيانات الأقمار');
assert(text('health-distance').includes('23.0'));
assert(text('health-distance').includes('ليس تأخر'));
assert(text('health-age').includes('23.0'));
assert(text('health-count').includes('1 سجلًا محمّلًا'));
assert(text('health-connection').includes('عبر خادم مدار'));
const badge = ui.node('data-health-summary').children[0];
health.render({
  ...input,
  time: input.time + 1000,
  connection: {
    state: 'blocked',
    transport: 'server',
    upstreamStatus: 403,
    retryAt: clock + 60000,
  },
});
assert.equal(
  ui.node('data-health-summary').children[0],
  badge,
  'cached details retain nodes within the minute',
);
assert(text('health-display').includes('23:00:01'));
assert(text('health-connection').includes('HTTP 403'));
assert(text('health-connection').includes('إعادة المحاولة'));
sourceDataset.push(object);
health.render(input);
assert(text('health-count').includes('2 سجلًا محمّلًا'));
assert.equal(ui.node('data-health-summary').children[0], badge);
sourceDataset.pop();
input.byUser = true;
health.render(input);
assert.equal(ui.node('data-health-summary').children[0].textContent, 'بيانات ' + object.name);
input.fixedTime = true;
health.render(input);
assert(
  text('health-note').includes('لم يُحمّل أرشيف'),
  'same-minute fixed-time toggle invalidates details',
);
assert(text('health-display').includes('وقت مختار'));
clock += 6 * 60000;
health.render(input);
assert(
  text('health-age').includes('23.1'),
  'wall-clock age keeps advancing with fixed display time',
);
assert(text('health-distance').includes('23.0'), 'display-relative epoch distance stays fixed');
input.fixedTime = false;
input.paused = true;
health.render(input);
assert(!text('health-note').includes('لم يُحمّل أرشيف'));
assert(text('health-display').includes('متوقف مؤقتًا'));
sourceDataset.note = 'New source note';
sourceDataset.rejected = 2;
health.render(input);
assert(text('health-note').includes('New source note'));
assert(text('health-invalid').includes('2 سجلًا'));
for (const mode of ['live', 'cache', 'local', 'derived', 'independent', 'imported']) {
  health.render({ ...input, object: { ...object, provenance: { mode, snapshot: '2026-10-16' } } });
  assert(!text('health-source').includes('مصدر غير موثق'));
  assert.equal(text('health-retrieved'), 'غير متاح', 'source date is never invented');
  assert.equal(text('health-note').includes('لم يُتحقق'), mode === 'imported');
}
health.render({ ...input, time: epoch - 4 * 86400000, dataset: [object] });
assert(text('health-distance').includes('يلي وقت العرض'));
assert(text('health-range').startsWith('1 من 1'));
health.render({ ...input, object: null, dataset: [], sourceDataset: [] });
assert.equal(ui.node('data-health').dataset.level, 'unknown');
assert.equal(text('health-epoch'), 'غير متاح');
assert.equal(text('health-format'), '—');
second.render(input);
assert.equal(other.node('data-health-summary').children[0].textContent, 'بيانات ' + object.name);
assert.notEqual(
  ui.node('data-health-summary').children[0],
  other.node('data-health-summary').children[0],
);
assert.equal(
  JSON.stringify(object),
  original,
  'rendering never changes orbit/provenance timestamps',
);
console.log(
  'PASS: isolated data health, honest source modes/timestamps, live connection refresh, stable cached nodes, fixed-time same-minute invalidation, advancing real age, filtered counts and empty recovery',
);
