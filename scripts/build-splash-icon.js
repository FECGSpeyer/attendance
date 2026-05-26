// Generates Android splash_icon.png at launcher-icon densities from
// resources/icon-only.png. Used by drawable/splash_screen.xml (layer-list)
// to render a properly centered, density-scaled icon on API 24-35. Replaces
// the previous full-screen splash.png bitmaps that pre-API-31 devices were
// stretching.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'resources', 'icon-only.png');
const ANDROID_RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Standard launcher-icon densities. Sized so the icon renders at ~108dp
// (matching AndroidX SplashScreen's icon size guideline).
const targets = [
  { dir: 'drawable-mdpi', size: 108 },
  { dir: 'drawable-hdpi', size: 162 },
  { dir: 'drawable-xhdpi', size: 216 },
  { dir: 'drawable-xxhdpi', size: 324 },
  { dir: 'drawable-xxxhdpi', size: 432 },
];

(async () => {
  for (const t of targets) {
    const dir = path.join(ANDROID_RES, t.dir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, 'splash_icon.png');
    await sharp(SRC)
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(out);
    console.log('wrote', out);
  }
})().catch((e) => { console.error(e); process.exit(1); });
