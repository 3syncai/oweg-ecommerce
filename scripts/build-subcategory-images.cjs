const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve('public/subcategory-banners');
  const out = path.join(root, 'responsive');
  await fs.mkdir(out, { recursive: true });
  for (const file of await fs.readdir(root)) {
    if (!/\.(jpeg|webp)$/i.test(file)) continue;
    for (const width of [160, 240, 320]) {
      await sharp(path.join(root, file)).rotate().resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 }).toFile(path.join(out, `${path.parse(file).name}-${width}.webp`));
    }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
