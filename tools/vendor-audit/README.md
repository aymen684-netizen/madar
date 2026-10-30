# Browser library provenance and audit guard

The audit dependency manifest is not the browser bundle build recipe. shipped-bundles.json
pins four shipped browser assets to their SHA-256 bytes and the audit-declared versions.

| Browser asset | Audit-declared version | Evidence |
| --- | --- | --- |
| vendor/docx.js | docx 9.5.1 | Upstream binary/version match unverified |
| vendor/satellite.min.js | satellite.js 6.0.1 | Upstream binary/version match unverified |
| vendor/globe.min.js | globe.gl 2.41.4 | Embedded version banner |
| vendor/globe-compat.min.js | globe.gl 2.31.0 | Embedded version banner |

All four locked npm packages are MIT licensed and contain tarball SHA-512 integrity and
registry URLs. Those fields identify npm tarballs, not the separately bundled assets;
do not treat them as proof of the browser bundle version. No vulnerability is asserted.

The normal npm run audit now rejects audit-only version drift. npm run check additionally
compares the pinned SHA-256 values with the frozen release bytes and checks the Globe
version banners. The packed asset reconstruction already checks packed gzip content.

Before upgrading, independently verify the exact upstream browser distribution hash,
license and version, reproducibly rebuild the shipped bundle, update packed parts (or
the tracked satellite file), update the audit lock and pinned provenance in one change,
and run Word, orbital accuracy, Globe rendering, privacy and production tests. This
guard is an interim safeguard, not an independent upstream provenance certificate.
