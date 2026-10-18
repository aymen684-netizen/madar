import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const document = new EventTarget(),
  toggle = new EventTarget(),
  reduced = new EventTarget(),
  controls = new EventTarget(),
  holder = new EventTarget();
document.hidden = false;
document.getElementById = () => toggle;
reduced.matches = false;
let visible = true,
  tracking = false;
const root = { document, matchMedia: () => reduced };
vm.createContext(root);
vm.runInContext(fs.readFileSync('public/globe-motion.js', 'utf8'), root);
const motion = root.GlobeMotion,
  world = { controls: () => controls },
  options = { active: () => visible, tracking: () => tracking };
let dispose = motion.attach(world, holder, options);
assert.equal(controls.autoRotate, true);
assert(controls.autoRotateSpeed > 0 && controls.autoRotateSpeed < 0.3);
visible = false;
document.dispatchEvent(new Event('madar-route'));
assert.equal(controls.autoRotate, false);
visible = true;
document.dispatchEvent(new Event('madar-route'));
assert.equal(controls.autoRotate, true);
document.hidden = true;
document.dispatchEvent(new Event('visibilitychange'));
assert.equal(controls.autoRotate, false);
document.hidden = false;
document.dispatchEvent(new Event('visibilitychange'));
assert.equal(controls.autoRotate, true);
reduced.matches = true;
reduced.dispatchEvent(new Event('change'));
assert.equal(controls.autoRotate, false);
assert.equal(toggle.disabled, true);
assert.equal(toggle.checked, false);
reduced.matches = false;
reduced.dispatchEvent(new Event('change'));
assert.equal(controls.autoRotate, true);
for (const event of ['pointerdown', 'wheel', 'keydown']) {
  holder.dispatchEvent(new Event(event));
  assert.equal(controls.autoRotate, false);
  motion.sync();
  assert.equal(controls.autoRotate, false, 'interaction stays stopped until explicit restart');
  assert.equal(toggle.checked, false);
  toggle.checked = true;
  toggle.dispatchEvent(new Event('change'));
  assert.equal(controls.autoRotate, true);
}
controls.dispatchEvent(new Event('start'));
assert.equal(controls.autoRotate, false);
toggle.checked = true;
toggle.dispatchEvent(new Event('change'));
tracking = true;
motion.sync();
assert.equal(controls.autoRotate, false);
assert.equal(toggle.disabled, true);
motion.interrupt();
tracking = false;
motion.sync();
assert.equal(controls.autoRotate, false, 'ending tracking does not restart the camera');
toggle.checked = true;
toggle.dispatchEvent(new Event('change'));
const replacement = new EventTarget();
dispose = motion.attach({ controls: () => replacement }, new EventTarget(), options);
assert.equal(controls.autoRotate, false, 'old renderer stopped on replacement');
holder.dispatchEvent(new Event('wheel'));
assert.equal(replacement.autoRotate, true, 'old interaction listeners removed');
dispose();
assert.equal(replacement.autoRotate, false);
console.log(
  'PASS: gentle camera rotation, visibility and reduced-motion guards, permanent interaction stop, explicit restart, tracking exclusion and renderer cleanup without timers or storage',
);
