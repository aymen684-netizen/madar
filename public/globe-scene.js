(function (root) {
  'use strict';
  const satelliteFont = {
    familyName: 'Madar Satellite',
    resolution: 1000,
    boundingBox: { yMin: 0, yMax: 900 },
    underlineThickness: 0,
    glyphs: {
      S: {
        ha: 1400,
        x_min: 0,
        x_max: 1400,
        o: 'm 0 280 l 430 280 l 430 650 l 0 650 l 0 280 m 500 210 l 900 210 l 900 730 l 500 730 l 500 210 m 970 280 l 1400 280 l 1400 650 l 970 650 l 970 280 m 400 430 l 1000 430 l 1000 500 l 400 500 l 400 430 m 665 720 l 735 720 l 735 900 l 665 900 l 665 720',
      },
    },
  };
  function create({
    document,
    getGlobe,
    viewport,
    observeSize,
    appearance,
    view,
    extensions,
    particleObject,
    events,
  }) {
    const $ = (id) => document.getElementById(id),
      fonts = new WeakMap();
    function initialView() {
      const { width, height } = viewport();
      return {
        lat: 22,
        lng: 45,
        altitude: width <= 700 ? Math.max(2, (height / width) * 1.4) : 2.6,
      };
    }
    function initialize(compat = false) {
      try {
        const Globe = getGlobe(),
          ext = extensions();
        if (!Globe) throw Error('المكتبة غير متاحة');
        const holder = $('globe');
        const world = (
          compat
            ? Globe({ waitForGlobeReady: false, animateIn: false })(holder)
            : new Globe(holder, { waitForGlobeReady: false, animateIn: false })
        )
          .globeImageUrl('assets/earth.jpg')
          .backgroundImageUrl('assets/stars.png')
          .backgroundColor('#080d16')
          .showAtmosphere(true)
          .atmosphereColor('#63bce7')
          .atmosphereAltitude(0.16)
          .pointsMerge(false)
          .pointLat('lat')
          .pointLng('lng')
          .pointAltitude('alt')
          .pointRadius((d) =>
            view.isSatelliteMode()
              ? 0
              : d.id === view.selectedId()
                ? 0.34
                : view.fleet()?.has(d.id)
                  ? 0.27
                  : 0.18,
          )
          .pointResolution(6)
          .pointColor(
            (d) =>
              view.fleet()?.color(d.id) ||
              (d.id === view.selectedId()
                ? '#e8fff9'
                : appearance.color(appearance.category(d.obj))),
          )
          .pointLabel((d) => {
            const el = document.createElement('span');
            el.textContent = d.name + ' · NORAD ' + d.id;
            return el;
          })
          .onPointClick((d, e) => {
            if (!ext.picking?.handled(e)) events.select(d.obj);
          })
          .labelRotation((d) => (view.isSatelliteMode() ? d.bearing : 0))
          .labelLat('lat')
          .labelLng('lng')
          .labelAltitude('alt')
          .labelText((d) => (view.isSatelliteMode() ? 'S' : d.name))
          .labelSize((d) =>
            view.isSatelliteMode() ? (d.id === view.selectedId() ? 0.9 : 0.65) : 0.7,
          )
          .labelColor(
            (d) =>
              view.fleet()?.color(d.id) || (d.id === view.selectedId() ? '#8ecbff' : '#2795ff'),
          )
          .labelDotRadius(() => (view.isSatelliteMode() ? 0 : 0.3))
          .onLabelClick((d, e) => {
            if (!ext.picking?.handled(e)) events.select(d.obj);
          })
          .labelResolution(2)
          .pathPoints((d) => d)
          .pathPointLat((d) => d[0])
          .pathPointLng((d) => d[1])
          .pathPointAlt((d) => d[2])
          .pathColor((d) => d.fleetColor || '#ffd083')
          .pathStroke(1.4)
          .pathResolution(2)
          .pathTransitionDuration(0)
          .pointsTransitionDuration(0);
        events.world(world);
        if (typeof world.particlesData === 'function')
          world
            .particleLat('lat')
            .particleLng('lng')
            .particleAltitude('alt')
            .particlesSize(3)
            .particlesSizeAttenuation(false)
            .particlesColor((group) => appearance.color(group.regime))
            .particleLabel((d) => {
              const o = particleObject(d);
              if (!o) return '';
              const el = document.createElement('span');
              el.textContent = o.name + ' · NORAD ' + o.id;
              return el;
            })
            .onParticleClick((d, e) => {
              const o = particleObject(d);
              if (o && !ext.picking?.handled(e)) events.select(o);
            });
        ext.picking?.install(holder, {
          world: () => world,
          candidates: events.candidates,
          select: (o) => events.select(o),
        });
        ext.quality?.attach(world);
        fonts.set(world, { defaultFont: world.labelTypeFace(), mode: null });
        world.pointOfView(initialView());
        world.controls().minDistance = 110;
        world.controls().maxDistance = 1100;
        const size = () => {
          if (holder.clientWidth > 0 && holder.clientHeight > 0)
            world.width(holder.clientWidth).height(holder.clientHeight);
        };
        observeSize(size, holder);
        size();
        ext.lifecycle?.attach(world, holder, events.refresh, () => ext.motion?.sync());
        ext.motion?.attach(world, holder, {
          active: () =>
            (!ext.lifecycle || ext.lifecycle.sceneActive()) &&
            (!document.body.dataset.shellView || document.body.dataset.shellView === 'map'),
          tracking: () => view.isTracking(),
        });
        $('map-error').hidden = true;
        for (const id of ['plus', 'minus', 'reset']) $(id).disabled = false;
        ext.draft?.restoreCamera(world);
      } catch (e) {
        events.world(null);
        if (!compat) {
          $('globe').replaceChildren();
          const script = document.createElement('script');
          script.src = 'vendor/globe-compat.min.js';
          script.onload = () => {
            initialize(true);
            events.refresh();
          };
          script.onerror = () => {
            $('map-error').hidden = false;
            $('map-error').textContent =
              'تعذّر تحميل العارض المتوافق. حدّث الصفحة أو افتح التطبيق في متصفح الجهاز.';
          };
          document.head.append(script);
          return;
        }
        $('map-error').hidden = false;
        $('map-error').textContent =
          'تعذّر إكمال العرض. جرّب إعادة تحميل الصفحة أو فتح التطبيق في متصفح الجهاز.';
        events.error(e);
        for (const id of ['plus', 'minus', 'reset', 'focus']) $(id).disabled = true;
      }
    }
    function applyMarkerMode(world, mode) {
      const state = fonts.get(world);
      if (state && state.mode !== mode) {
        world.labelTypeFace(mode ? satelliteFont : state.defaultFont);
        state.mode = mode;
      }
    }
    function zoom(world, factor) {
      extensions().motion?.interrupt();
      if (!world) return;
      const camera = world.pointOfView();
      world.pointOfView(
        { ...camera, altitude: Math.max(0.3, Math.min(9, camera.altitude * factor)) },
        300,
      );
    }
    function reset(world) {
      extensions().motion?.interrupt();
      world?.pointOfView(initialView(), 700);
    }
    return Object.freeze({ initialize, applyMarkerMode, zoom, reset });
  }
  const api = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GlobeScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
