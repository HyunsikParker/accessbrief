import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { browserBundle } from './browser-bundle.mjs';
import { webAssets } from './web-assets.mjs';

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
await mkdir(new URL("src/", output), { recursive: true });
let html = await readFile(new URL("web/index.html", root), "utf8");
let app = Buffer.from(await browserBundle()).toString('utf8');
let css = await readFile(new URL('web/styles.css', root), 'utf8');
await mkdir(new URL('assets/fonts/', output), { recursive: true });
for (const [name] of webAssets) {
  const content = await readFile(new URL(`web/assets/${name}`, root));
  const digest = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const dot = name.lastIndexOf('.');
  const versioned = `${name.slice(0, dot)}.${digest}${name.slice(dot)}`;
  await writeFile(new URL(`assets/${versioned}`, output), content);
  html = html.replaceAll(`./assets/${name}`, `./assets/${versioned}`);
  css = css.replaceAll(`./assets/${name}`, `./assets/${versioned}`);
}
// Version imported modules too; otherwise an unchanged app URL can load old evidence logic.
const moduleNames = new Map();
for (const name of ["core.mjs", "demo-data.mjs", "dom-inventory.mjs", "receipt-file.mjs"]) {
  let content = await readFile(new URL(`src/${name}`, root), "utf8");
  for (const [dependency, versionedDependency] of moduleNames) {
    content = content.replaceAll(`"./${dependency}"`, `"./${versionedDependency}"`);
  }
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const versioned = `${name.slice(0, -4)}.${digest}.mjs`;
  moduleNames.set(name, versioned);
  await writeFile(new URL(`src/${versioned}`, output), content);
  app = app.replace(`./src/${name}`, `./src/${versioned}`);
}
// Publishing HTML and assets under permanent names can mix releases in caches.
// Give every browser entry asset a content-derived URL.
for (const name of ["app.mjs", "styles.css"]) {
  const content = Buffer.from(name === 'app.mjs' ? app : css);
  const digest = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const dot = name.lastIndexOf(".");
  const versioned = `${name.slice(0, dot)}.${digest}${name.slice(dot)}`;
  await writeFile(new URL(versioned, output), content);
  html = html.replace(`./${name}`, `./${versioned}`);
}
await writeFile(new URL("index.html", output), html);
await writeFile(new URL(".nojekyll", output), "");
await mkdir(new URL('examples/', output), { recursive: true });
await writeFile(new URL('examples/ticket-booking.html', output), await readFile(new URL('examples/ticket-booking.html', root)));
