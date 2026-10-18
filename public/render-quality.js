(function (root) {
  'use strict';
  const preference = 'madar-render-quality',
    modes = new Set(['auto', 'economy', 'detail']);
  let mode = 'auto',
    renderer = null,
    globe = null,
    textureUrl = null;
  try {
    const saved = root.localStorage.getItem(preference);
    if (modes.has(saved)) mode = saved;
  } catch {}
  function compact() {
    return root.innerWidth <= 700 || (root.innerWidth <= 1000 && root.innerHeight <= 500);
  }
  function ratio() {
    const density = Number(root.devicePixelRatio) || 1,
      cap = mode === 'economy' ? 1 : mode === 'auto' && compact() ? 1.5 : 2;
    return Math.min(Math.max(1, density), cap);
  }
  function apply() {
    const value = ratio();
    if (renderer && renderer.getPixelRatio() !== value) renderer.setPixelRatio(value);
    if (globe) {
      const url =
        mode === 'detail' && renderer.capabilities?.maxTextureSize >= 8192
          ? 'assets/earth-detail.jpg'
          : 'assets/earth.jpg';
      if (textureUrl !== url) {
        textureUrl = url;
        globe.globeImageUrl(url);
      }
      sharpen();
    }
    const select = root.document.getElementById('render-quality'),
      status = root.document.getElementById('render-quality-status');
    if (select) select.value = mode;
    if (status) {
      const text =
        mode === 'economy'
          ? 'الوضع الحالي: توفير الطاقة.'
          : mode === 'detail'
            ? 'الوضع الحالي: تفاصيل أعلى.'
            : compact()
              ? 'الوضع الحالي: تلقائي للجوال.'
              : 'الوضع الحالي: تلقائي للشاشات الواسعة.';
      if (status.dataset.message !== text) {
        status.dataset.message = text;
        status.textContent = text;
      }
    }
  }
  function sharpen() {
    const map = globe?.globeMaterial?.()?.map;
    if (!map) return;
    const value = Math.min(
      mode === 'economy' ? 1 : 8,
      renderer.capabilities?.getMaxAnisotropy?.() || 1,
    );
    if (map.anisotropy !== value) {
      map.anisotropy = value;
      map.needsUpdate = true;
    }
  }
  function setMode(value) {
    if (!modes.has(value)) return;
    mode = value;
    try {
      root.localStorage.setItem(preference, mode);
    } catch {}
    apply();
  }
  function init() {
    const select = root.document.getElementById('render-quality');
    if (select) select.onchange = () => setMode(select.value);
    apply();
  }
  root.addEventListener('resize', apply, { passive: true });
  root.addEventListener('storage', (event) => {
    if (event.key === preference) {
      mode = modes.has(event.newValue) ? event.newValue : 'auto';
      apply();
    }
  });
  root.RenderQuality = {
    attach(world) {
      globe = world;
      renderer = world.renderer();
      apply();
    },
    sharpen,
    setMode,
    get mode() {
      return mode;
    },
  };
  if (root.document.readyState === 'loading')
    root.document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
