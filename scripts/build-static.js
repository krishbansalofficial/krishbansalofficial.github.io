// Builds a server-less copy of the site into dist/ for GitHub Pages.
// Every read endpoint is pre-rendered to JSON using the same catalog code the
// Express server runs, so "More Like This" and profile rows are identical.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from '../server/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const catalog = loadCatalog(path.join(ROOT, 'data', 'portfolio.json'));

async function writeJson(rel, data) {
  const file = path.join(DIST, 'api', rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

await rm(DIST, { recursive: true, force: true });
await cp(path.join(ROOT, 'public'), DIST, { recursive: true });

const profiles = catalog.listProfiles();
await writeJson('profiles.json', { owner: catalog.owner, profiles });
for (const { id } of profiles) await writeJson(`browse/${id}.json`, catalog.browse(id));

const items = catalog.listItems();
for (const item of items) await writeJson(`items/${item.id}.json`, { item, similar: catalog.similar(item.id) });
await writeJson('search.json', { items });

// Flag the page as static so the client skips POST endpoints.
const indexFile = path.join(DIST, 'index.html');
const html = await readFile(indexFile, 'utf8');
if (!html.includes('<html lang="en">')) throw new Error('index.html <html> tag changed; update build-static.js');
await writeFile(indexFile, html.replace('<html lang="en">', '<html lang="en" data-mode="static">'));

// Serve files as-is (no Jekyll processing).
await writeFile(path.join(DIST, '.nojekyll'), '');

console.log(`Built dist/ with ${profiles.length} profiles and ${items.length} titles.`);
