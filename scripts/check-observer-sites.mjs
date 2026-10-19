import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const data = new Map();
const localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value)),
  removeItem: (key) => data.delete(key),
  key: (i) => [...data.keys()][i],
  get length() {
    return data.size;
  },
};
function context() {
  const c = {
    localStorage,
    addEventListener() {},
    document: { readyState: 'loading', addEventListener() {} },
  };
  c.window = c;
  vm.createContext(c);
  for (const name of ['privacy.js', 'observer-sites-core.js'])
    vm.runInContext(fs.readFileSync('public/' + name, 'utf8'), c);
  let serial = 0;
  return {
    c,
    model: c.ObserverSitesCore.create({ privacy: c.Privacy, id: () => 'site-' + ++serial }),
  };
}
const a = context(),
  site = {
    name: '<b>My site</b>',
    lat: '0',
    lon: '-180',
    height: '-500',
    minElevation: '0',
    zone: '0',
  };
assert.throws(() => a.model.save({ ...site, lat: '' }));
assert.throws(() => a.model.save({ ...site, lon: 181 }));
assert.throws(() => a.model.save({ ...site, lat: true }));
assert.throws(() => a.model.save({ ...site, zone: '' }));
assert.throws(() => a.model.save({ ...site, name: '   ' }));
const saved = a.model.save(site);
assert.equal(saved.persistent, true);
assert.equal(saved.site.lat, 0);
const b = context();
assert.equal(b.model.all()[0].name, site.name, 'literal names and values survive reload');
b.model.save(
  { ...site, name: 'Renamed', lat: 90, lon: 180, minElevation: 89, height: 9000, zone: 3 },
  saved.site.id,
);
assert.equal(a.model.all()[0].name, 'Renamed', 'each read sees another tab update');
const copy = a.model.all();
copy[0].lat = 55;
assert.equal(a.model.all()[0].lat, 90, 'callers cannot mutate saved state');
for (let i = 1; i < 20; i++) a.model.save({ ...site, name: 'Site ' + i });
assert.throws(() => a.model.save(site), /20/);
assert.equal(a.model.all().length, 20);
const stale = context();
await a.c.Privacy.clear();
assert.equal(data.has(a.c.ObserverSitesCore.KEY), false, 'clear removes private observing sites');
stale.model.save(site);
assert.equal(data.has(a.c.ObserverSitesCore.KEY), false, 'an old tab cannot restore cleared sites');
assert.equal(stale.model.all().length, 1, 'old tab saves stay in session memory');
const session = context();
await session.c.Privacy.setEnabled(false);
assert.equal(session.model.save(site).persistent, false);
assert.equal(session.model.all().length, 1);
assert.equal(context().model.all().length, 0, 'session sites do not survive reload');
session.model.remove(session.model.all()[0].id);
assert.equal(session.model.all().length, 0);
const blocked = a.c.ObserverSitesCore.create({
  privacy: {
    localGet() {
      throw Error();
    },
    localSet() {
      throw Error();
    },
  },
  id: () => 'blocked',
});
assert.equal(blocked.save(site).persistent, false);
assert.equal(blocked.all().length, 1, 'blocked storage retains explicitly saved session data');
assert.throws(() => blocked.save(site, 'missing'));
data.set('madar-save-enabled', 'true');
data.set(
  a.c.ObserverSitesCore.KEY,
  JSON.stringify({
    version: 1,
    sites: [
      { id: 'ok', ...site },
      { id: 'bad', ...site, lat: null },
      { id: 'ok', ...site },
    ],
  }),
);
assert.equal(context().model.all().length, 1, 'malformed and duplicate stored sites are excluded');
// A failed write must never promote a stale session snapshot over another tab.
let recoveryRaw = null,
  failWrites = true,
  recoveryId = 0;
const recoveryPrivacy = {
  persistent: () => true,
  localGet: () => recoveryRaw,
  localSet: (key, value) => {
    if (failWrites) throw Error('Quota exceeded');
    recoveryRaw = value;
    return true;
  },
};
const recoveryModel = () =>
  a.c.ObserverSitesCore.create({ privacy: recoveryPrivacy, id: () => 'recovery-' + ++recoveryId });
const oldTab = recoveryModel();
const temporary = oldTab.save({ ...site, name: 'Temporary A' });
assert.equal(temporary.persistent, false);
failWrites = false;
const currentTab = recoveryModel();
currentTab.save({ ...site, name: 'Saved B' });
assert.equal(
  oldTab.save({ ...site, name: 'Updated A' }, temporary.site.id).persistent,
  false,
  'storage failure keeps this tab in session mode until reload',
);
assert.deepEqual(
  JSON.parse(recoveryRaw).sites.map((s) => s.name),
  ['Saved B'],
  'recovery never overwrites sites saved by another tab',
);
assert.equal(oldTab.all()[0].name, 'Updated A');
oldTab.remove(temporary.site.id);
assert.equal(oldTab.all().length, 0, 'temporary sites can still be deleted in session mode');
// Failed deletion of a durable site must preserve the selection and report failure.
const deleteTab = recoveryModel(),
  durable = deleteTab.all()[0];
failWrites = true;
assert.throws(() => deleteTab.remove(durable.id), /تعذّر حذف الموقع/);
assert.equal(deleteTab.all().length, 1, 'failed deletion keeps the site visible');
assert.equal(JSON.parse(recoveryRaw).sites.length, 1, 'failed deletion leaves durable data intact');
assert.throws(() => deleteTab.remove(durable.id), /تعذّر حذف الموقع/);
assert.equal(recoveryModel().all()[0].id, durable.id);
failWrites = false;
const reloadedTab = recoveryModel();
assert.equal(reloadedTab.remove(durable.id).persistent, true);
assert.equal(
  recoveryModel().all().length,
  0,
  'deletion succeeds after storage recovery and reload',
);
console.log(
  'PASS: observing site validation and bounds, reload/cross-tab updates, limits, private/session storage, clear-generation protection and storage failures',
);
