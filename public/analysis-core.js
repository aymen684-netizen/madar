(function (root) {
  'use strict';
  const DAY = 86400000;
  function clockSegments(entry, exit, offset) {
    if (exit <= entry) return [];
    if (exit - entry >= DAY) return [[0, DAY]];
    const a = entry + offset * 3600000,
      b = exit + offset * 3600000,
      day = Math.floor(a / DAY) * DAY;
    if (b <= day + DAY) return [[a - day, b - day]];
    return [
      [a - day, DAY],
      [0, b - day - DAY],
    ];
  }
  function clockDifference(a, b, offset) {
    const x = (((a + offset * 3600000) % DAY) + DAY) % DAY,
      y = (((b + offset * 3600000) % DAY) + DAY) % DAY,
      d = Math.abs(x - y);
    return Math.min(d, DAY - d);
  }
  function mergeIntervals(ranges) {
    const sorted = ranges.map((r) => [...r]).sort((a, b) => a[0] - b[0]),
      out = [];
    for (const r of sorted) {
      const prev = out[out.length - 1];
      if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
      else out.push(r);
    }
    return out;
  }
  function normalized(w) {
    const hours = (w.end - w.start) / 36e5,
      ranges = mergeIntervals(
        w.result.rows
          .map((r) => [Math.max(w.start, r.entry), Math.min(w.end, r.exit)])
          .filter((r) => r[1] > r[0]),
      ),
      seconds = ranges.reduce((a, r) => a + (r[1] - r[0]) / 1000, 0);
    return {
      hours,
      passes: w.result.rows.length,
      perHour: hours > 0 ? w.result.rows.length / hours : null,
      coveragePercent: hours > 0 ? (seconds / (hours * 3600)) * 100 : null,
      clipped: w.result.rows.filter((r) => r.clippedStart || r.clippedEnd).length,
    };
  }
  function analyze(windows, offset, toleranceMinutes) {
    const satellites = new Map(),
      sets = windows.map((w) => new Set(w.result.rows.map((r) => r.id))),
      indexed = windows.map((w) => {
        const m = new Map();
        for (const row of w.result.rows) {
          if (!m.has(row.id)) m.set(row.id, []);
          m.get(row.id).push(row);
        }
        return m;
      });
    let totalPasses = 0,
      invalid = 0,
      stale = 0;
    windows.forEach((w, i) => {
      totalPasses += w.result.rows.length;
      invalid += w.result.invalid;
      stale += w.result.stale;
      for (const row of w.result.rows) {
        let sat = satellites.get(row.id);
        if (!sat) {
          sat = {
            id: row.id,
            name: row.name,
            metadata: row.metadata,
            counts: Array(windows.length).fill(0),
            duration: 0,
            rows: [],
          };
          satellites.set(row.id, sat);
        }
        sat.counts[i]++;
        sat.duration += row.duration;
        sat.rows.push({ ...row, window: i });
      }
    });
    const matrix = [...satellites.values()]
      .map((s) => ({
        ...s,
        frequency: s.counts.filter((n) => n > 0).length,
        total: s.counts.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.frequency - a.frequency || b.total - a.total || a.id - b.id);
    const repeated = matrix.filter((s) => s.frequency >= 2),
      commonAll = matrix.filter((s) => s.frequency === windows.length),
      pairs = [],
      timing = [];
    for (let i = 0; i < windows.length; i++)
      for (let j = i + 1; j < windows.length; j++) {
        const commonIds = [...sets[i]].filter((id) => sets[j].has(id)).sort((a, b) => a - b),
          union = new Set([...sets[i], ...sets[j]]).size;
        let clockMatched = 0,
          nearMatched = 0,
          absoluteMatched = 0;
        for (const id of commonIds) {
          const aa = indexed[i].get(id),
            bb = indexed[j].get(id);
          let clock = false,
            near = false,
            absolute = false;
          for (const a of aa)
            for (const b of bb) {
              const absoluteMs = Math.max(0, Math.min(a.exit, b.exit) - Math.max(a.entry, b.entry));
              const intersections = [];
              for (const x of clockSegments(a.entry, a.exit, offset))
                for (const y of clockSegments(b.entry, b.exit, offset)) {
                  const start = Math.max(x[0], y[0]),
                    end = Math.min(x[1], y[1]);
                  if (end > start) intersections.push([start, end]);
                }
              const clockMs = mergeIntervals(intersections).reduce((s, r) => s + r[1] - r[0], 0),
                delta = clockDifference(a.entry, b.entry, offset),
                isNear = delta <= toleranceMinutes * 60000;
              clock ||= clockMs > 0;
              near ||= isNear;
              absolute ||= absoluteMs > 0;
              if (clockMs > 0 || isNear || absoluteMs > 0)
                timing.push({
                  id,
                  name: a.name,
                  first: i,
                  second: j,
                  entryA: a.entry,
                  exitA: a.exit,
                  entryB: b.entry,
                  exitB: b.exit,
                  clockSeconds: clockMs / 1000,
                  entryDeltaSeconds: delta / 1000,
                  near: isNear,
                  absoluteSeconds: absoluteMs / 1000,
                  clipped: a.clippedStart || a.clippedEnd || b.clippedStart || b.clippedEnd,
                });
            }
          if (clock) clockMatched++;
          if (near) nearMatched++;
          if (absolute) absoluteMatched++;
        }
        pairs.push({
          first: i,
          second: j,
          commonIds,
          common: commonIds.length,
          union,
          jaccard: union ? (commonIds.length / union) * 100 : null,
          clockMatched,
          nearMatched,
          absoluteMatched,
          overlappingWindows:
            Math.max(
              0,
              Math.min(windows[i].end, windows[j].end) -
                Math.max(windows[i].start, windows[j].start),
            ) / 1000,
        });
      }
    timing.sort(
      (a, b) => a.first - b.first || a.second - b.second || a.id - b.id || a.entryA - b.entryA,
    );
    const coverage =
      mergeIntervals(windows.map((w) => [w.start, w.end])).reduce(
        (sum, r) => sum + r[1] - r[0],
        0,
      ) / 1000;
    return {
      matrix,
      repeated,
      commonAll,
      pairs,
      timing,
      totalPasses,
      unique: matrix.length,
      invalid,
      stale,
      coverageSeconds: coverage,
      windows: windows.length,
      mostFrequent: matrix[0]?.frequency || 0,
      topIds: matrix.filter((s) => s.frequency === matrix[0]?.frequency).map((s) => s.id),
      clockMatchingIds: [...new Set(timing.filter((t) => t.clockSeconds > 0).map((t) => t.id))],
      nearMatchingIds: [...new Set(timing.filter((t) => t.near).map((t) => t.id))],
    };
  }
  const api = { normalized, clockSegments, clockDifference, mergeIntervals, analyze };
  if (typeof module !== 'undefined') module.exports = api;
  else root.AnalysisCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
