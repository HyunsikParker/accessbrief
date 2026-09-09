import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

export async function browserBundle() {
  const notices = await Promise.all(['parse5', 'entities'].map(name => readFile(new URL(`../node_modules/${name}/LICENSE`, import.meta.url), 'utf8')));
  const result = await build({ entryPoints: [fileURLToPath(new URL('../web/app.mjs', import.meta.url))], bundle: true,
    write: false, format: 'esm', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'inline',
    loader: { '.html': 'text' }, banner: { js: '/*! Bundled parser licenses:\n' + notices.join('\n\n') + '\n*/' } });
  return result.outputFiles[0].contents;
}
