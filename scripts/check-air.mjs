import assert from 'node:assert/strict';import '../public/air-core.js';
const C=globalThis.AirCore,t='2026-10-15T01:00:00+03:00',o={objectId:'D1',name:'درون اختبار',kind:'drone',time:t,lat:'٢٤٫٥',lon:46,altitudeM:120,source:'سجل اختبار'};
const state=C.state({...C.empty(),observations:[o]});assert.equal(state.observations[0].lat,24.5);assert.equal(state.observations[0].time,Date.parse(t));assert.equal(C.merge(state,state).observations.length,1);
assert.throws(()=>C.time('2026-10-15T01:00:00'));assert.throws(()=>C.time('2026-02-30T00:00:00Z'));assert.throws(()=>C.observation({...o,lat:91}));assert.throws(()=>C.observation({...o,altitudeM:Infinity}));assert.throws(()=>C.merge(state,{...C.empty(),observations:[{...o,lat:0}]}));
const parsed=C.parse('objectId,name,kind,time,lat,lon\nD1,"اختبار، طيران",drone,2026-10-14T22:00:00Z,24,46','csv');assert.equal(parsed.observations.length,1);assert.equal(parsed.observations[0].altitudeM,null);
assert.throws(()=>C.parse('objectId,name,kind,time,lat,lon\nD1,"bad','csv'));
assert.throws(()=>C.state({...state,links:[{id:'x',objectId:'missing',time:t,network:'X',source:'Y',reference:'Z'}]}));
const l=C.link({id:'l',objectId:'D1',time:t,network:'شبكة تجريبية',satelliteId:100001,source:'مستخدم',reference:'test'},new Set(['D1']));assert.equal(l.satelliteId,100001);assert(!('verified' in l));
assert.equal(C.tracks(state,'aircraft').size,0);console.log('PASS: air schema, Arabic numbers, explicit timezone, invalid dates, CSV, non-destructive merge, missing altitude and honest connection records');
