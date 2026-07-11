# Audio fixtures

Generated fixtures are synthesized inside tests and Recording Lab. The open-fixture manifest additionally pins a small CC0 musical-scale recording by source page, direct URL, creator, license, byte count, and SHA-1 checksum.

The binary is intentionally fetched through `scripts/fetch-open-fixtures.mjs` rather than silently copied from an unverified URL. The script rejects size or checksum drift. After retrieval, browser decoding and analysis must be exercised manually because Node does not provide the same audio-codec implementation as the supported browsers.

No commercial recording is stored here.
