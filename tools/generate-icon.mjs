import fs from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const root = process.cwd();
const sourcePng = path.join(root, 'logo.png');
const buildDir = path.join(root, 'build');
const targetIco = path.join(buildDir, 'icon.ico');

async function main() {
  try {
    await fs.access(sourcePng);
  } catch {
    throw new Error(`No se encontro logo en: ${sourcePng}`);
  }

  await fs.mkdir(buildDir, { recursive: true });

  const image = sharp(sourcePng);
  const metadata = await image.metadata();
  const width = metadata.width || 512;
  const height = metadata.height || 512;
  const side = Math.max(width, height);

  const squaredPngBuffer = await image
    .resize(side, side, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();

  const icoBuffer = await pngToIco(squaredPngBuffer);
  await fs.writeFile(targetIco, icoBuffer);

  console.log(`Icono generado en: ${targetIco}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
