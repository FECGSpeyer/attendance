// Regenerates the Microsoft Teams app icons from the app favicon.
//   node scripts/teams-icons.mjs
// Produces teams/color.png (192x192) and teams/outline.png (32x32, transparent
// white silhouette). See teams/README.md.
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src/assets/icon/favicon.png');
const outDir = join(root, 'teams');

// Full-color icon.
await sharp(src).resize(192, 192, { fit: 'cover' }).png().toFile(join(outDir, 'color.png'));

// Outline icon: key out the teal background to transparency, flatten the
// (already white) foreground to pure white.
const { data, info } = await sharp(src)
  .resize(32, 32, { fit: 'cover' })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const px = Buffer.from(data);
for (let i = 0; i < px.length; i += 4) {
  const r = px[i], g = px[i + 1], b = px[i + 2];
  const isTeal = r < 130 && g > 110 && b > 110;
  if (isTeal) {
    px[i + 3] = 0;
  } else {
    px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
  }
}
await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toFile(join(outDir, 'outline.png'));

console.log('Teams icons written to teams/color.png and teams/outline.png');
