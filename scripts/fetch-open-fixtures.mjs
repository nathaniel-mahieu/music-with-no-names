import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = new URL("../fixtures/open/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
await mkdir(root, { recursive: true });

for (const fixture of manifest.fixtures) {
  const response = await fetch(fixture.downloadUrl);
  if (!response.ok) throw new Error(`${fixture.id}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  if (bytes.byteLength !== fixture.declaredBytes) throw new Error(`${fixture.id}: expected ${fixture.declaredBytes} bytes, received ${bytes.byteLength}`);
  if (sha1 !== fixture.sha1) throw new Error(`${fixture.id}: expected SHA-1 ${fixture.sha1}, received ${sha1}`);
  await writeFile(new URL(fixture.filename, root), bytes);
  process.stdout.write(`${fixture.filename}\n`);
}
