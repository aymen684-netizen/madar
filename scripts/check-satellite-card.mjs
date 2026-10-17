import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

class Element {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.hidden = false;
    this._text = '';
    this.writes = 0;
  }
  set textContent(value) {
    this._text = String(value);
    this.writes++;
  }
  get textContent() {
    return this._text;
  }
  set innerHTML(_) {
    throw Error('Card content must use text nodes');
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const node of this.children) node.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
}
const nodes = new Map(),
  node = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  },
  document = { getElementById: node, querySelector: node, createElement: () => new Element() },
  context = vm.createContext({ document });
context.window = context;
for (const file of ['orbit-data.js', 'live-values.js', 'satellite-card.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), context);
const orbit = context.OrbitData,
  seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  object = orbit.fromOmm(
    { ...seed, OBJECT_NAME: '<img src=x onerror=alert(1)>', MEAN_MOTION: 2, ECCENTRICITY: 0.1 },
    { mode: 'live' },
  ),
  now = new Date(orbit.epoch(object));
let metadata = {
    country: 'United States',
    missionLabel: '<script>mission</script>',
    evidenceLabel: 'Reviewed',
    checked: '2026-10-17',
    ownerIso2: 'US',
    countrySource: 'https://celestrak.org/satcat/',
    missionSource: 'https://www.nasa.gov/',
    missionSourceTitle: '<b>Source</b>',
  },
  positionCalls = 0,
  location = { h: 500, speed: 7.65, lat: 22.5, lng: 45 },
  cleared = 0,
  rendered = null;
const card = context.SatelliteCard.create({
  document,
  orbit,
  values: context.LiveValues,
  getMetadata: (id) => {
    assert.equal(id, object.id);
    return metadata;
  },
  sourceDetails: {
    render: (o, m) => {
      rendered = [o, m];
    },
    clear: () => {
      cleared++;
    },
  },
  describeMetric: (label) => 'Description: ' + label,
  position: () => {
    positionCalls++;
    return location;
  },
});
assert.equal(card.show(null), false);
card.renderDetails(null, now);
card.syncFavorites(null, false);
assert.equal(node('.sat-identity').hidden, true);
assert.equal(node('epoch').hidden, true);
assert.equal(node('globe-card').hidden, true);
assert.equal(node('favorite').disabled, true);
assert.equal(cleared, 1);
assert.equal(positionCalls, 0);
card.renderFloating(object, { now, tracking: false });
assert.equal(positionCalls, 0, 'hidden floating cards must not propagate positions');
card.renderDetails(object, now);
assert.equal(node('name').textContent, object.name, 'names are rendered literally');
assert.equal(node('sat-mission').textContent, metadata.missionLabel);
assert.equal(node('n2yo').href, 'https://www.n2yo.com/satellite/?s=100001');
assert.equal(rendered[0], object);
assert.equal(rendered[1], metadata);
const metric = (label) =>
  node('metrics').children.find((row) => row.children[0].textContent === label);
assert.equal(metric('الارتفاع').children[1].textContent, '500.0 km');
assert.equal(metric('السرعة').children[1].textContent, '7.65 km/s');
assert.equal(metric('زمن الدورة').children[1].textContent, '720.0 min');
assert.equal(metric('اللامركزية').children[1].textContent, '0.1000000');
const row = metric('الارتفاع');
card.renderDetails(object, now);
assert.equal(metric('الارتفاع'), row, 'stable metrics retain their DOM nodes');
assert.equal(row.children[1].writes, 1);
assert.equal(card.show(object), true);
card.syncFavorites(object, true);
assert.equal(node('favorite').attributes.get('aria-pressed'), 'true');
assert.equal(node('globe-card-favorite').attributes.get('aria-pressed'), 'true');
card.renderFloating(object, { now, tracking: true });
assert.equal(node('globe-card-name').textContent, object.name);
assert.equal(node('globe-card-flag').src, 'assets/flags/us.png');
assert.equal(node('track-selected').attributes.get('aria-pressed'), 'true');
const source = node('globe-card-sources').children;
assert.equal(source.length, 3);
assert.equal(source[1].textContent, '<b>Source</b> ↗');
for (const link of source) {
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
}
card.renderFloating(object, { now, tracking: false });
assert.equal(node('globe-card-sources').children[0], source[0], 'unchanged sources retain nodes');
assert.equal(node('globe-card-name').writes, 1);
assert.equal(node('track-selected').attributes.get('aria-pressed'), 'false');
for (const [mode, expected] of [
  ['imported', ''],
  ['independent', 'https://mmccants.org/tles/'],
]) {
  metadata = null;
  card.renderFloating({ ...object, provenance: { mode } }, { now, tracking: false });
  assert.equal(node('globe-card-flag').hidden, true);
  assert.equal(node('globe-card-sources').children.length, expected ? 1 : 0);
  if (expected) assert.equal(node('globe-card-sources').children[0].href, expected);
}
location = null;
card.renderDetails(object, new Date(+now + 4 * 864e5));
assert.equal(metric('الارتفاع').children[1].textContent, 'غير متاح');
assert(node('epoch').textContent.includes('أكثر من 3 أيام'));
card.renderFloating(object, { now, tracking: false });
assert.equal(node('globe-card-motion').textContent, '');
card.renderDetails(null, now);
assert.equal(node('metrics').children.length, 0);
card.renderDetails(object, now);
assert.equal(node('metrics').children.length, 12, 'details recover after an empty selection');
card.hide();
assert.equal(node('globe-card').hidden, true);
console.log(
  'PASS: isolated satellite card rendering, exact display units, safe literal text and source links, stable metric/source nodes, hidden-card propagation gating, null recovery, tracking and watchlist button sync',
);
