# Browser library provenance and audit guard

The audit manifest is not the browser build recipe. `shipped-bundles.json`
pins the SHA-256 bytes actually served to users alongside exact audit versions.

| Browser asset | Audited version | Evidence |
| --- | --- | --- |
| `vendor/docx.js` | `docx@9.5.1` | Byte-identical to locked npm `dist/index.umd.cjs` |
| `vendor/satellite.min.js` | `satellite.js@6.0.1` | Byte-identical to locked npm `dist/satellite.min.js` |
| `vendor/globe.min.js` | `globe.gl@2.41.4` | Embedded version banner |
| `vendor/globe-compat.min.js` | `globe.gl@2.31.0` | Embedded version banner |

The exact docx and satellite.js matches were verified by GitHub Actions workflow
`Verify upstream vendor bundle identity` (run 41165362998, 31 October 2026).
It installs npm dependencies with `npm ci --ignore-scripts` from
`tools/vendor-audit/package-lock.json`, reconstructs locally packed assets, and
compares entire upstream and shipped files byte-for-byte, including SHA-256.

Npm lockfile SHA-512 values authenticate package tarballs during installation;
they do not alone establish a browser file identity. The separate provenance
workflow compares those files. This is evidence about the **current deployed
versions**, not approval to update them or proof that no vulnerabilities exist.

`npm run audit` blocks audit-only version drift, and `npm run check` compares
the pinned SHA-256 values against frozen release bytes. Packed asset reconstruction
also verifies the locally checked-in gzip parts.

To upgrade a browser library, pin an official upstream release and license,
verify reproducible browser bytes, update the tracked or packed asset plus the
lockfile and provenance in the same reviewed change, and run the Word, orbital
accuracy, Globe rendering, privacy and production tests. In particular, satellite.js
v7 removes the older minified UMD loader used by this app, so a separate ESM
migration and review are needed. Keep PRs #95, #12 and #10 unmerged until that
work is performed.
