// Builds the uploadable Microsoft Teams app package.
//   node scripts/teams-package.mjs
// Zips manifest.json + color.png + outline.png at the archive root into
// teams/attendix-teams.zip. Uses jszip (already a project dependency) so it
// works cross-platform without the `zip` CLI.
import JSZip from 'jszip';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const teamsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'teams');
const files = ['manifest.json', 'color.png', 'outline.png'];

const zip = new JSZip();
for (const name of files) {
  zip.file(name, await readFile(join(teamsDir, name)));
}

const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
const out = join(teamsDir, 'attendix-teams.zip');
await writeFile(out, buf);
console.log(`Wrote ${out} (${files.join(', ')})`);
