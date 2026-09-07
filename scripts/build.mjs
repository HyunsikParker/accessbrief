import { copyFile, mkdir, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
await mkdir(new URL("src/", output), { recursive: true });
for (const name of ["index.html", "app.mjs", "styles.css"]) {
  await copyFile(new URL(`web/${name}`, root), new URL(name, output));
}
for (const name of ["core.mjs", "demo-data.mjs", "dom-inventory.mjs"]) {
  await copyFile(new URL(`src/${name}`, root), new URL(`src/${name}`, output));
}
await writeFile(new URL(".nojekyll", output), "");
