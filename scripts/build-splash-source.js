// Composes resources/splash.png and resources/splash-dark.png as 2732x2732
// squares with icon-only.png centered at ~30% canvas width. Run after the
// icon design changes; outputs feed `npx capacitor-assets generate`.
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const ICON = path.join(ROOT, 'resources', 'icon-rounded.png');
const OUT_LIGHT = path.join(ROOT, 'resources', 'splash.png');
const OUT_DARK = path.join(ROOT, 'resources', 'splash-dark.png');

const CANVAS = 2732;
const ICON_WIDTH = Math.round(CANVAS * 0.30); // 819px

async function compose(bg, outPath) {
  const iconBuf = await sharp(ICON)
    .resize(ICON_WIDTH, ICON_WIDTH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS - ICON_WIDTH) / 2);
  const top = Math.round((CANVAS - ICON_WIDTH) / 2);

  await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: bg },
  })
    .composite([{ input: iconBuf, left, top }])
    .png()
    .toFile(outPath);

  console.log('wrote', outPath);
}

(async () => {
  await compose({ r: 255, g: 255, b: 255, alpha: 1 }, OUT_LIGHT);
  await compose({ r: 30, g: 30, b: 30, alpha: 1 }, OUT_DARK);
})().catch((e) => { console.error(e); process.exit(1); });
