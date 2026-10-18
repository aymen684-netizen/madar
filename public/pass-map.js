(function (root) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let replay = null;
  let replayPath = null,
    replayAt = NaN,
    hadBoundary = false;
  function objectFor(row, report) {
    // Replay exactly the archived elements; old reports without a snapshot cannot be replayed.
    return report?.archive?.payload?.objects?.find((o) => Number(o.id) === Number(row.id)) || null;
  }
  function show(row, object) {
    if (!object || !OrbitData.valid(object) || !Number.isFinite(row.entry)) return;
    MobileMap.close();
    fixedTime = new Date(row.entry);
    paused = false;
    pausedAt = null;
    timeControls.fill(fixedTime);
    timeControls.sync();
    // Respect the user's orbit filter, making the selected class visible for this action.
    const regime = OrbitAppearance.category(object);
    if (root.MapOrbitFilter && !MapOrbitFilter.matches(object))
      document.querySelector(`#orbit-legend [data-orbit="${regime}"]`)?.click();
    MadarShell.show('map');
    replay = prepare([object])[0];
    replayPath = null;
    choose(replay, false);
    $('time-message').textContent = 'عرض المرور من العناصر المستخدمة في الحساب؛ الموضع تقديري.';
    pathAt = 0;
    update();
    focusSelected();
    $('globe-card-name').focus?.();
  }
  function button(row, report, object = objectFor(row, report)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pass-map-button';
    b.textContent = 'اعرض المرور على الخريطة';
    b.disabled = !object;
    if (!object) b.title = 'لا تتوفر لقطة مدارات لهذا التقرير؛ أعد الحساب.';
    b.onclick = () => show(row, object);
    return b;
  }
  const field = document.createElement('fieldset');
  field.className = 'visibility-controls';
  field.innerHTML =
    '<legend>نطاق الرؤية الهندسية</legend><label><input id="visibility-footprint" type="checkbox">إظهار نطاق القمر المحدد</label><label>أقل زاوية ارتفاع فوق الأفق<input id="visibility-elevation" type="number" min="0" max="89" value="10" step="1"></label><p>الحد المرسوم تقدير على أرض كروية عند سطح البحر؛ ليس نطاق تصوير أو تغطية اتصال، ولا يشمل التضاريس أو الطقس.</p>';
  if ($('map-display')) $('map-display').append(field);
  else
    document.addEventListener('DOMContentLoaded', () => $('map-display').append(field), {
      once: true,
    });
  field.addEventListener('input', () => update());
  function drawFootprint() {
    if (!world || !root.PassToolsCore) return;
    const activeReplay = replay && selection.current === replay;
    if (!activeReplay && !$('visibility-footprint').checked && !hadBoundary) return;
    const p =
        selection.byUser &&
        selection.current &&
        $('visibility-footprint').checked &&
        (!root.MapOrbitFilter || MapOrbitFilter.matches(selection.current))
          ? position(selection.current)
          : null,
      e =
        $('visibility-elevation').value.trim() === ''
          ? NaN
          : Number($('visibility-elevation').value),
      boundary = root.PassToolsCore?.footprint(p, e);
    const paths = world
      .pathsData()
      .filter(
        (p) =>
          !p.visibilityBoundary &&
          !p.reportReplay &&
          (!activeReplay || (p.fleetId != null && Number(p.fleetId) !== Number(replay.id))),
      );
    if (activeReplay) {
      const time = +dateNow();
      if (!replayPath || replayAt !== time) {
        replayAt = time;
        replayPath = [];
        const period = 864e5 / OrbitData.fields(replay).motion;
        for (let i = 0; i <= 160; i++) {
          const p = position(replay, new Date(time + (period * i) / 160));
          if (p) replayPath.push([p.lat, p.lng, p.alt]);
        }
        replayPath.reportReplay = true;
        replayPath.fleetColor = '#ffd083';
      }
      if (replayPath.length) paths.push(replayPath);
    }
    if (boundary?.length) {
      boundary.visibilityBoundary = true;
      paths.push(boundary);
    }
    hadBoundary = !!boundary?.length;
    world.pathsData(paths);
  }
  root.PassMap = Object.freeze({
    show,
    button,
    drawFootprint,
    display(data) {
      if (selection.current !== replay || !replay) return data;
      return [...data.filter((o) => Number(o.id) !== Number(replay.id)), replay];
    },
  });
})(window);
