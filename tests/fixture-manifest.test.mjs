import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("open recording fixtures pin provenance, license, size, and checksum", async () => {
  const manifest = JSON.parse(await readFile(new URL("../fixtures/open/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.schema, "music-with-no-names.fixture-manifest.v1");
  assert.ok(manifest.fixtures.length > 0);
  for (const fixture of manifest.fixtures) {
    assert.match(fixture.sourcePage, /^https:\/\/commons\.wikimedia\.org\//);
    assert.match(fixture.downloadUrl, /^https:\/\/upload\.wikimedia\.org\//);
    assert.equal(fixture.license, "CC0-1.0");
    assert.ok(Number.isInteger(fixture.declaredBytes) && fixture.declaredBytes > 0);
    assert.match(fixture.sha1, /^[a-f0-9]{40}$/);
    assert.equal(fixture.bundled, false);
  }
});
