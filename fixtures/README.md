# Audio fixtures

Generated fixtures are synthesized inside tests and Recording Lab. The open-fixture manifest additionally pins a small CC0 musical-scale recording by source page, direct URL, creator, license, byte count, and SHA-1 checksum.

The binary was fetched through `scripts/fetch-open-fixtures.mjs` rather than silently copied from an unverified URL. The script rejects size or checksum drift. Automated tests recheck the bundled bytes; browser decoding and analysis remain part of the real-browser codec matrix because Node does not provide the same audio-codec implementation as supported browsers.

No commercial recording is stored here.
