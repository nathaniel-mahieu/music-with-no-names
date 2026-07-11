import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDirectory = join(process.cwd(), "dist", "client");
const projectPath = "/music-with-no-names";
async function rewriteAssetPaths(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await rewriteAssetPaths(path);
      continue;
    }
    if (!/\.(?:html|js|rsc)$/.test(entry.name)) continue;
    const source = await readFile(path, "utf8");
    const rewritten = source
      .replace(/(?<!music-with-no-names)\/assets\//g, `${projectPath}/assets/`)
      .replaceAll('"assets/', `"${projectPath.slice(1)}/assets/`)
      .replaceAll("'assets/", `'${projectPath.slice(1)}/assets/`);
    if (rewritten !== source) await writeFile(path, rewritten);
  }
}

await rewriteAssetPaths(outputDirectory);
await writeFile(join(outputDirectory, ".nojekyll"), "");
