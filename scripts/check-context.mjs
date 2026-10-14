import assert from 'node:assert/strict';
import '../public/context-core.js';
const C=globalThis.ContextCore;let id=0;const uid=()=>String(++id);
assert.equal(C.number('٢٤٫٧'),24.7);
assert.throws(()=>C.geometry({type:'Point',coordinates:[181,0]}));
const g=C.geometry({type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]]]});
assert.equal(C.distance(g,[1,1]),0);assert.ok(Math.abs(C.distance(g,[3,1])-111.18)<1);
const sites=C.importSites('name,lat,lon\n"موقع، خاص",24,46','csv',uid);
assert.equal(sites[0].geometry.coordinates[0],46);assert.throws(()=>C.importSites('name,lat,lon\na,99,46','csv',uid));
const state={format:'madar-context',version:1,sites,notes:[]};assert.equal(C.merge(state,state).sites.length,1);
assert.throws(()=>C.merge(state,{...state,sites:[{...sites[0],name:'conflict'}]}));
assert.throws(()=>C.state({...state,notes:[{id:'x',siteId:'missing'}]}));
assert.throws(()=>C.parseCsv('a,"bad'));
console.log('Context: geometry, Arabic numbers, CSV, backup merge and validation passed');

assert.throws(()=>C.state({...state,sites:[{...sites[0],updatedAt:1e300}]}));
