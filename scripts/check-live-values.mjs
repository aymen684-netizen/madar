import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
class Element {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this.writes = 0;
  }
  set textContent(v) {
    this._text = v;
    this.writes++;
  }
  get textContent() {
    return this._text;
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
const context = { document: { createElement: () => new Element() } };
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('public/live-values.js', 'utf8'), context);
const api = context.LiveValues,
  host = new Element(),
  values = [
    ['الارتفاع', '500 km'],
    ['السرعة', '7.5 km/s'],
  ];
api.render(host, values);
const first = host.children[0],
  value = first.children[1];
api.render(host, values);
assert.equal(host.children[0], first);
assert.equal(value.writes, 1);
value.textContent = 'English value';
api.render(host, values);
assert.equal(
  value.textContent,
  'English value',
  'unchanged source values must preserve translated text',
);
api.render(host, [['الارتفاع', '501 km'], values[1]]);
assert.equal(host.children[0], first);
assert.equal(value.textContent, '501 km');
host.replaceChildren();
api.render(host, values);
assert.equal(host.children.length, 2, 'details return after empty selection');
assert.notEqual(host.children[0], first);
api.render(host, [['الميل', '40°']]);
assert.equal(host.children.length, 1);
console.log(
  'PASS: live detail nodes are retained, unchanged translations are preserved, changed values update and empty selections recover',
);
