(function (root) {
  'use strict';
  let binding = null,
    enabled = true;
  function sync() {
    binding?.sync();
  }
  function interrupt() {
    enabled = false;
    sync();
  }
  function attach(world, holder, { active, tracking }) {
    binding?.dispose();
    const controls = world.controls(),
      toggle = root.document.getElementById('globe-rotation'),
      reduced = root.matchMedia('(prefers-reduced-motion: reduce)');
    controls.autoRotateSpeed = 0.18;
    const item = {
      sync() {
        const allowed = !reduced.matches && !tracking();
        controls.autoRotate = enabled && allowed && !root.document.hidden && active();
        toggle.checked = enabled && allowed;
        toggle.disabled = !allowed;
      },
      dispose() {
        controls.autoRotate = false;
        controls.removeEventListener('start', interrupt);
        for (const type of ['pointerdown', 'wheel', 'keydown'])
          holder.removeEventListener(type, interrupt);
        reduced.removeEventListener('change', sync);
        root.document.removeEventListener('visibilitychange', sync);
        root.document.removeEventListener('madar-route', sync);
        toggle.removeEventListener('change', change);
        if (binding === item) binding = null;
      },
    };
    function change() {
      enabled = toggle.checked;
      sync();
    }
    binding = item;
    controls.addEventListener('start', interrupt);
    for (const type of ['pointerdown', 'wheel', 'keydown'])
      holder.addEventListener(type, interrupt, { passive: true });
    reduced.addEventListener('change', sync);
    root.document.addEventListener('visibilitychange', sync);
    root.document.addEventListener('madar-route', sync);
    toggle.addEventListener('change', change);
    sync();
    return item.dispose;
  }
  root.GlobeMotion = { attach, interrupt, sync };
})(typeof window !== 'undefined' ? window : globalThis);
