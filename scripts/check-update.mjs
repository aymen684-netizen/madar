import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const app = fs.readFileSync('public/app.js', 'utf8');
const parse = (text) => {
  const lines = text.trim().split(/\r?\n/),
    out = [];
  for (let i = 0; i < lines.length; i++)
    if (lines[i].startsWith('1 ') && lines[i + 1]?.startsWith('2 ')) {
      out.push({
        name: lines[i - 1],
        id: Number(lines[i].slice(2, 7)),
        l1: lines[i],
        l2: lines[++i],
      });
    }
  return out;
};
const active = parse(fs.readFileSync('public/data/active.txt', 'utf8'));
const groupsContext = {
  AbortSignal,
  fetch: async (url) => {
    if (!url.startsWith('data/')) throw Error('offline');
    return {
      ok: fs.existsSync('public/' + url),
      text: async () => fs.readFileSync('public/' + url, 'utf8'),
    };
  },
};
vm.createContext(groupsContext);
for (const file of ['orbit-data.js', 'orbit-service.js'])
  vm.runInContext(fs.readFileSync('public/' + file, 'utf8'), groupsContext);
vm.runInContext(fs.readFileSync('public/satellite-groups.js', 'utf8'), groupsContext);
const groups = groupsContext.SatGroups;
assert.equal(new Set(groups.list.map((g) => g.key)).size, groups.list.length);
assert(groups.list.length > 40);
assert.equal((await groups.fetchGroup('active', parse)).data.length, active.length);
const starlink = await groups.fetchGroup('starlink', parse);
assert.equal(starlink.source, 'local');
const oneweb = await groups.fetchGroup('oneweb', parse);
assert.equal(oneweb.source, 'derived');
assert(oneweb.data.every((o) => /^ONEWEB/i.test(o.name)));
await assert.rejects(groups.fetchGroup('analyst', parse), /نسخة احتياطية/);
let posted;
const workerContext = {
  self: {
    postMessage: (m) => {
      posted = m;
    },
  },
  importScripts: () => {},
};
vm.createContext(workerContext);
vm.runInContext(fs.readFileSync('public/orbit-data.js', 'utf8'), workerContext);
vm.runInContext(fs.readFileSync('public/vendor/satellite.min.js', 'utf8'), workerContext);
vm.runInContext(fs.readFileSync('public/positions-worker.js', 'utf8'), workerContext);
workerContext.self.onmessage({
  data: { type: 'set', token: 1, tles: active.map((o) => [o.l1, o.l2]) },
});
workerContext.self.onmessage({ data: { type: 'tick', token: 1, time: Date.UTC(2026, 9, 14) } });
assert.equal(posted.buf.length, active.length * 3);
assert(posted.buf.filter(Number.isFinite).length > active.length * 2);
const before = posted;
workerContext.self.onmessage({ data: { type: 'tick', token: 0, time: Date.now() } });
assert.equal(posted, before);
let fakeWorker, drawn;
class FakeWorker {
  constructor() {
    fakeWorker = this;
    this.messages = [];
  }
  postMessage(m) {
    this.messages.push(m);
  }
  terminate() {
    this.terminated = true;
  }
}
const swarmContext = {
  OrbitData: groupsContext.OrbitData,
  Worker: FakeWorker,
  world: {
    particlesData: (d) => {
      drawn = d;
    },
  },
  update: () => {},
};
vm.createContext(swarmContext);
vm.runInContext(fs.readFileSync('public/orbit-appearance.js', 'utf8'), swarmContext);
assert.match(app, /\bconst\s+Swarm\s*=/);
vm.runInContext(
  app.slice(app.search(/\bconst\s+Swarm\s*=/), app.indexOf('\nfunction parse(')) +
    '\nglobalThis.swarm=Swarm;',
  swarmContext,
);
const swarm = swarmContext.swarm;
const a = active.slice(0, 2),
  b = active.slice(2, 4);
swarm.show(a, new Date(1000));
const first = fakeWorker.messages[0].token;
swarm.show(b, new Date(2000));
const second = fakeWorker.messages[2].token;
fakeWorker.onmessage({ data: { type: 'positions', token: first, buf: new Float32Array(6) } });
swarm.show(b, new Date(3000));
assert.equal(fakeWorker.messages.length, 4, 'stale response must not release current calculation');
fakeWorker.onmessage({
  data: { type: 'positions', token: second, buf: new Float32Array([1, 2, 3, 4, 5, 6]) },
});
assert.equal(fakeWorker.messages.at(-1).time, 3000);
assert.equal(swarm.object(drawn.flat().find((p) => p.i === 1)).id, b[1].id);
const refresh = b.map((o) => ({ ...o, l1: o.l1 + ' ' }));
swarm.show(refresh, new Date(3000));
assert.equal(fakeWorker.messages.at(-2).type, 'set', 'same IDs with new TLE must refresh');
let sceneVisible = true;
swarmContext.RenderLifecycle = { sceneActive: () => sceneVisible };
swarm.show(refresh, new Date(4000));
const messageCount = fakeWorker.messages.length,
  previousDrawing = drawn,
  refreshToken = fakeWorker.messages.filter((m) => m.type === 'set').at(-1).token;
sceneVisible = false;
fakeWorker.onmessage({
  data: { type: 'positions', token: refreshToken, buf: new Float32Array([1, 2, 3, 4, 5, 6]) },
});
assert.equal(fakeWorker.messages.length, messageCount, 'hidden scene must not drain a queued tick');
assert.equal(drawn, previousDrawing, 'hidden scene must discard completed positions');
sceneVisible = true;
swarm.show(refresh, new Date(4000));
assert.equal(fakeWorker.messages.at(-1).type, 'tick');
assert.equal(
  fakeWorker.messages.length,
  messageCount + 1,
  'returning to a frozen time must still replace a discarded result',
);
swarm.show([], new Date(4000));
assert.equal(drawn.length, 0);
let keys = ['oneweb', 'analyst'];
const pickerContext = {
  OrbitData: groupsContext.OrbitData,
  window: { SatGroups: groups },
  parse,
  document: { querySelectorAll: () => keys.map((value) => ({ value })) },
};
vm.createContext(pickerContext);
vm.runInContext(fs.readFileSync('public/type-picker.js', 'utf8'), pickerContext);
const partial = await pickerContext.window.TypePicker.load('catalog');
assert(partial.length);
assert.equal(partial.failed.length, 1);
await assert.rejects(pickerContext.window.TypePicker.load('report'), /لم يُنشأ التقرير/);
await assert.rejects(pickerContext.window.TypePicker.load('analysis'), /لم يُنشأ التقرير/);
console.log(
  `PASS: ${groups.list.length} groups, offline fallback, ${active.length} worker positions, stale responses, TLE refresh and incomplete-report protection`,
);

const prepareContext = { OrbitData: groupsContext.OrbitData, S: { twoline2satrec: () => ({}) } };
vm.createContext(prepareContext);
vm.runInContext(
  app.slice(app.indexOf('function prepare('), app.indexOf('\nfunction dateNow(')),
  prepareContext,
);
const prepared = prepareContext.prepare(partial);
assert.equal(prepared.failed.length, 1, 'current-group reports retain loading failures');
assert.equal(prepared.derived, true);
assert(pickerContext.window.TypePicker.describe(prepared, 'OneWeb').includes('تقريبي'));
console.log('PASS: current-group report provenance and partial-load metadata');

let modelBuilds = 0;
prepareContext.S = {
  twoline2satrec: () => {
    modelBuilds++;
    return { model: modelBuilds };
  },
};
const deferred = prepareContext.prepare(Array.from({ length: 16000 }, () => partial[0]));
assert.equal(modelBuilds, 0, 'large catalogs defer main-thread orbit models');
const deferredModel = deferred[0].rec;
assert(deferredModel);
assert.equal(deferred[0].rec, deferredModel);
assert.equal(modelBuilds, 1, 'the selected model is built once');
assert.equal(deferred[1].rec.model, 2);
assert.equal(modelBuilds, 2);
assert(!Object.keys(deferred[0]).includes('rec'), 'transient models stay outside data copies');
prepareContext.S = {
  twoline2satrec: () => {
    throw Error('invalid');
  },
};
const invalid = prepareContext.prepare([partial[0]])[0];
assert.equal(invalid.rec, null);
assert.equal(invalid.rec, null);
console.log(
  'PASS: 16,000-record preparation defers unused orbit models, caches each used model and retains failures safely',
);
