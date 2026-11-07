import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function generateAllIcons() {
  const logoPath = path.resolve('public/branding/alfanar-logo.png');
  if (!fs.existsSync(logoPath)) {
    console.error('Logo file not found:', logoPath);
    process.exit(1);
  }

  console.log('Loading logo from:', logoPath);

  // 1. Generate standard square PNG icons
  const targets = [
    { file: 'public/favicon-16x16.png', size: 16 },
    { file: 'public/favicon-32x32.png', size: 32 },
    { file: 'public/favicon-48x48.png', size: 48 },
    { file: 'public/apple-icon.png', size: 180 },
    { file: 'src/app/apple-icon.png', size: 180 },
    { file: 'public/icon.png', size: 512 },
    { file: 'src/app/icon.png', size: 512 },
    { file: 'public/icons/icon-192.png', size: 192 },
    { file: 'public/icons/icon-512.png', size: 512 },
  ];

  for (const t of targets) {
    const dir = path.dirname(t.file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await sharp(logoPath)
      .resize(t.size, t.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(t.file);
    console.log(`Generated: ${t.file} (${t.size}x${t.size})`);
  }

  // 2. Generate multi-resolution ICO file containing 16x16, 32x32, 48x48
  const icoSizes = [16, 32, 48];
  const pngBuffers = [];
  for (const size of icoSizes) {
    const buf = await sharp(logoPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
  }

  const count = pngBuffers.length;
  const headerLen = 6 + count * 16;
  let offset = headerLen;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = ICO
  header.writeUInt16LE(count, 4); // count

  const entries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(item.size, 0); // width
    entry.writeUInt8(item.size, 1); // height
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(item.buffer.length, 8); // size of image
    entry.writeUInt32LE(offset, 12); // offset
    entries.push(entry);
    offset += item.buffer.length;
  }

  const icoBuffer = Buffer.concat([
    header,
    ...entries,
    ...pngBuffers.map((p) => p.buffer),
  ]);

  fs.writeFileSync('public/favicon.ico', icoBuffer);
  fs.writeFileSync('src/app/favicon.ico', icoBuffer);
  console.log('Generated: public/favicon.ico and src/app/favicon.ico with sizes [16, 32, 48]');
}

generateAllIcons().catch((err) => {
  console.error(err);
  process.exit(1);
});
