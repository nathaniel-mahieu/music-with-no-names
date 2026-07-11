import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outputDirectory = join(process.cwd(), "dist", "client");
const projectPath = "/music-with-no-names";
const exportedDocuments = ["index.html", "index.rsc"];

for (const filename of exportedDocuments) {
  const path = join(outputDirectory, filename);
  const source = await readFile(path, "utf8");
  const rewritten = source.replaceAll("/assets/", `${projectPath}/assets/`);
  await writeFile(path, rewritten);
}

await writeFile(join(outputDirectory, ".nojekyll"), "");
