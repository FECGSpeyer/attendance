// Surgically regenerates ONLY the iOS splash images (Splash.imageset) from
// resources/splash.png and splash-dark.png.
//
// Android no longer uses per-density splash.png bitmaps — it uses
// drawable/splash_screen.xml (layer-list) + drawable-*/splash_icon.png. See
// scripts/build-splash-icon.js for the icon regeneration.
//
// Why not `npx capacitor-assets generate`? It also rewrites launcher icon
// XMLs, which Android Studio locks while the project is open (EBUSY). Splash
// images aren't locked, so we can write them directly.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC_LIGHT = path.join(ROOT, 'resources', 'splash.png');
const SRC_DARK = path.join(ROOT, 'resources', 'splash-dark.png');

// iOS uses one universal-anyany set at 2732x2732 (square). The splash storyboard
// scales it to fill, so the icon stays centered at the right proportion.
const IOS_SPLASH_DIR = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset');
const iosTargets = [
  { name: 'Default@1x~universal~anyany.png', w: 2732, h: 2732 },
  { name: 'Default@2x~universal~anyany.png', w: 2732, h: 2732 },
  { name: 'Default@3x~universal~anyany.png', w: 2732, h: 2732 },
  { name: 'Default@1x~universal~anyany-dark.png', w: 2732, h: 2732, dark: true },
  { name: 'Default@2x~universal~anyany-dark.png', w: 2732, h: 2732, dark: true },
  { name: 'Default@3x~universal~anyany-dark.png', w: 2732, h: 2732, dark: true },
];

async function generate(srcLight, srcDark, target, outPath) {
  const src = target.dark ? srcDark : srcLight;
  const bg = target.dark
    ? { r: 17, g: 17, b: 17, alpha: 1 }
    : { r: 255, g: 255, b: 255, alpha: 1 };

  await sharp(src)
    .resize(target.w, target.h, { fit: 'contain', background: bg })
    .png()
    .toFile(outPath);
}

(async () => {
  if (!fs.existsSync(IOS_SPLASH_DIR)) fs.mkdirSync(IOS_SPLASH_DIR, { recursive: true });
  for (const t of iosTargets) {
    const out = path.join(IOS_SPLASH_DIR, t.name);
    await generate(SRC_LIGHT, SRC_DARK, t, out);
  }
  console.log(`generated ${iosTargets.length} iOS splash files`);
})().catch((e) => { console.error(e); process.exit(1); });

