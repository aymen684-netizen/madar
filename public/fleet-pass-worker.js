importScripts('network-resources.js?v=65', 'network-policy.js?v=43');
importScripts(
  'vendor/satellite.min.js',
  'orbit-data.js?v=42',
  'report-insights.js?v=52',
  'observer-engine.js?v=26',
  'fleet-pass-core.js?v=67',
);
self.onmessage = async (e) => {
  try {
    const result = await FleetPassCore.scan(satellite, e.data.objects, e.data.request, (p) =>
      self.postMessage({ type: 'progress', ...p }),
    );
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
};
