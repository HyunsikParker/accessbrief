import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
await mkdir(new URL("src/", output), { recursive: true });
let html = await readFile(new URL("web/index.html", root), "utf8");
// Publishing HTML and assets under permanent names can mix releases in caches.
// Give every browser entry asset a content-derived URL.
for (const name of ["app.mjs", "styles.css"]) {
  const content = await readFile(new URL(`web/${name}`, root));
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const dot = name.lastIndexOf(".");
  const versioned = `${name.slice(0, dot)}.${digest}${name.slice(dot)}`;
  await writeFile(new URL(versioned, output), content);
  html = html.replace(`./${name}`, `./${versioned}`);
}
await writeFile(new URL("index.html", output), html);
for (const name of ["core.mjs", "demo-data.mjs", "dom-inventory.mjs"]) {
  await copyFile(new URL(`src/${name}`, root), new URL(`src/${name}`, output));
}
await writeFile(new URL(".nojekyll", output), "");
