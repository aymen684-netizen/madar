import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context = vm.createContext({});
for (const file of ['orbit-data.js', 'catalog-search.js', 'catalog-rows.js', 'catalog-list.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), context);
const orbit = context.OrbitData,
  seed = JSON.parse(fs.readFileSync('scripts/fixtures/omm-six-digit.json')),
  epoch = Date.parse('2026-10-17T00:00:00Z'),
  make = (id, hours = 0) =>
    orbit.fromOmm({
      ...seed,
      NORAD_CAT_ID: id,
      OBJECT_NAME: 'SAT ' + id,
      EPOCH: new Date(epoch - hours * 3600000).toISOString(),
    }),
  dataset = [make(100001), make(100002, 73), make(100003), make(100004)],
  metadata = new Map([
    [100001, { ownerCode: 'US', ownerIso2: 'US', program: 'Starlink' }],
    [100002, { ownerCode: 'CIS', ownerIso2: 'RU' }],
    [100004, { ownerCode: 'ESA' }],
  ]);
let prepared = 0,
  allowed = true;
const dependencies = {
    orbit,
    search: context.CatalogSearch,
    prepare: (data) => {
      prepared++;
      return data.map((o) => ({ ...o, prepared: true }));
    },
    getMetadata: (id) => metadata.get(id),
    matchesDisplay: () => allowed,
  },
  model = context.CatalogRows.create(dependencies),
  input = {
    dataset,
    query: '',
    country: 'all',
    onlySaved: false,
    age: 'all',
    sort: 'original',
    time: epoch,
    displayKey: '',
  },
  ids = (rows) => Array.from(rows, (o) => o.id);
const original = ids(dataset),
  first = model.rows(input);
assert.deepEqual(ids(first), original);
assert.equal(
  model.rows({ ...input, time: epoch + 1000 }),
  first,
  'unchanged context retains result identity',
);
assert.deepEqual(ids(model.rows({ ...input, query: '١٠٠٠٠٢' })), [100002]);
assert.deepEqual(ids(model.rows({ ...input, query: 'starlink' })), [100001]);
for (const [country, expected] of [
  ['US', [100001]],
  ['CIS', [100002]],
  ['unknown', [100003]],
  ['other', [100004]],
  ['owner:ESA', [100004]],
])
  assert.deepEqual(ids(model.rows({ ...input, country })), expected);
const recent = { ...input, age: 'recent', time: epoch + 24 * 3600000 };
assert.equal(model.rows(recent).length, 3, '24-hour boundary is inclusive');
assert.equal(
  model.rows({ ...recent, time: recent.time + 1 }).length,
  0,
  'cache expires precisely after the boundary',
);
assert.equal(
  model.rows({ ...recent, time: epoch }).length,
  3,
  'backwards display time recomputes the view',
);
assert.deepEqual(ids(model.rows({ ...input, age: 'old' })), [100002]);
model.rows({ ...input, sort: 'newest' });
assert.deepEqual(ids(dataset), original, 'sorting does not mutate the source');
const saved = model.rows({ ...input, onlySaved: true });
assert.equal(prepared, 1);
assert(saved.every((o) => o.prepared));
assert.equal(model.rows({ ...input, onlySaved: true }), saved);
const before = model.rows(input);
allowed = false;
assert.equal(model.rows(input), before);
model.invalidate();
assert.equal(model.rows(input).length, 0, 'explicit invalidation refreshes map matching');
allowed = true;
assert.equal(
  context.CatalogRows.create(dependencies).rows(input).length,
  4,
  'models own independent caches',
);

class Element {
  constructor(tag = '') {
    this.tag = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.className = '';
    this.classList = {
      toggle: (name, active) => {
        const set = new Set(this.className.split(' ').filter(Boolean));
        active ? set.add(name) : set.delete(name);
        this.className = [...set].join(' ');
      },
    };
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren() {
    this.children = [];
  }
  setAttribute(key, value) {
    this.attributes.set(key, value);
  }
  querySelectorAll() {
    return this.children.filter((n) => n.tag === 'button');
  }
  querySelector() {
    return this.querySelectorAll()[0];
  }
  focus(options) {
    this.focused = options;
  }
  set innerHTML(_) {
    throw Error('Catalog text must not use HTML');
  }
}
const nodes = new Map(),
  node = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id);
  },
  document = { getElementById: node, createElement: (tag) => new Element(tag) };
let picked;
const view = context.CatalogList.create({
    document,
    orbit,
    getMetadata: () => ({ evidenceLabel: 'موثق' }),
    onChoose: (o) => {
      picked = o;
    },
  }),
  data = Array.from({ length: 301 }, (_, i) => ({
    ...dataset[0],
    id: 100001 + i,
    name: i === 0 ? '<img src=x>' : 'SAT ' + i,
  })),
  state = {
    data,
    dataset: data,
    context: 'all',
    onlySaved: false,
    saved: [data[0]],
    query: '',
    loading: false,
    time: epoch,
    selectedId: data[0].id,
  };
view.render(state);
assert.equal(node('list').children.length, 100);
assert.equal(view.lastRows, data);
assert.equal(node('list').children[0].children[1].children[0].textContent, '<img src=x>');
assert(node('list').children[0].children[1].children[1].textContent.includes('★'));
assert.equal(node('list').children[0].attributes.get('aria-pressed'), 'true');
node('list').children[1].onclick();
assert.equal(picked, data[1]);
view.select(data[1].id);
assert.equal(node('list').children[0].attributes.get('aria-pressed'), 'false');
assert.equal(node('list').children[1].attributes.get('aria-pressed'), 'true');
view.changePage(1);
view.render(state);
assert.equal(node('list').children[0].dataset.satelliteId, '100101');
view.focusFirst();
assert.equal(node('list').scrollTop, 0);
assert.equal(node('list').children[0].focused.preventScroll, true);
view.changePage(99);
view.render(state);
assert.equal(node('list').children.length, 1);
assert.equal(node('list').children[0].dataset.satelliteId, '100301');
assert.equal(node('list-next').disabled, true);
view.render({ ...state, context: 'new filter' });
assert.equal(node('list').children[0].dataset.satelliteId, '100001');
view.render(state);
view.changePage(-99);
view.render(state);
assert.equal(node('list-previous').disabled, true);
view.changePage(1);
view.render(state);
view.render({ ...state, dataset: data.slice() });
assert.equal(node('list-previous').disabled, true, 'new source resets pagination');
view.render({ ...state, data: [], dataset: [], saved: [], onlySaved: true });
assert(node('list').children[0].textContent.includes('المفضلة فارغة'));
assert.equal(node('catalog-empty-browse').hidden, false);
view.render({ ...state, data: [], dataset: [], loading: true });
assert.equal(node('catalog-empty-actions').hidden, true);
assert(node('results-summary').textContent.includes('جارٍ تحميل'));
view.render({ ...state, data: [data[0]] });
assert.equal(node('list').children.length, 1);
assert.equal(node('list-pagination').hidden, true);
console.log(
  'PASS: isolated catalog query/cache/filter/age boundaries and explicit invalidation; bounded 100-row pages, safe names, selection, focus, source/filter resets and empty/loading recovery',
);
