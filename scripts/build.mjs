import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const config = `/* LNReader RPG Formatter v${pkg.version} | MIT
   Optional configuration, BEFORE this bundle:
   window.LNReaderRPGConfig = { theme: "classic", onlineRates: false };
   Manual rates: exchangeRates: { KRW: { value: YOUR_RATE, date: "YYYY-MM-DD" } }
   Values mean USD per 1 unit. No rate is supplied by default.
*/`;
await mkdir('dist', { recursive: true });
for (const minify of [false, true]) {
  await build({
    entryPoints: ['src/index.ts'], outfile: `dist/lnreader-rpg${minify ? '.min' : ''}.js`,
    bundle: true, format: 'iife', target: ['chrome61'], minify,
    legalComments: 'none', banner: { js: config },
    plugins: [{ name: 'inline-css', setup(builder) {
      builder.onLoad({ filter: /\.css$/ }, async args => ({
        contents: await readFile(args.path, 'utf8'), loader: 'text',
      }));
    } }],
  });
}
const styles = await Promise.all(['classic', 'medieval', 'minimal', 'base', 'rarity'].map(name => readFile(`src/themes/${name}.css`, 'utf8')));
await writeFile('dist/lnreader-rpg.css', styles.join('\n'));
const files = ['lnreader-rpg.js', 'lnreader-rpg.min.js', 'lnreader-rpg.css'];
const sums = await Promise.all(files.map(async file => `${createHash('sha256').update(await readFile('dist/' + file)).digest('hex')}  ${file}`));
await writeFile('dist/SHA256SUMS.txt', sums.join('\n') + '\n');
console.log(`Built v${pkg.version}: standalone JS, minified JS, CSS and SHA256SUMS.`);
