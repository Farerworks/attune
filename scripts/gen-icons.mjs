/**
 * Generates PWA icon PNGs from SVG.
 * Run once: node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.resolve(__dirname, '../public');

function makeSvg(size) {
  const cx = size / 2;

  // "A" — italic serif, 55% of icon height
  const fontSize = Math.round(size * 0.55);

  // Baseline position: cap-height ≈ 72% of font-size, dots below.
  // Place baseline so visual content is centered in safe area (80%).
  const safeInset = size * 0.10;          // 10% inset = safe area top/bottom
  const capH = fontSize * 0.72;
  const dotDiam = Math.round(size * 0.06);
  const dotR = dotDiam / 2;
  const dotGap = Math.round(size * 0.015);
  const innerGap = Math.round(size * 0.03); // gap between "A" baseline and dots

  // Total content height
  const contentH = capH + innerGap + dotDiam;
  const contentTop = (size - contentH) / 2 - size * 0.02; // very slight upward shift
  const textBaseline = contentTop + capH;
  const dotCY = textBaseline + innerGap + dotR;

  // Dot x-positions (5 dots, centered)
  const dotColors = ['#4E8A52', '#C4502E', '#A8842C', '#6E7A80', '#4A76AC'];
  const totalDotsW = 5 * dotDiam + 4 * dotGap;
  const dot0X = cx - totalDotsW / 2 + dotR;

  const dots = dotColors.map((color, i) => {
    const x = (dot0X + i * (dotDiam + dotGap)).toFixed(2);
    return `<circle cx="${x}" cy="${dotCY.toFixed(2)}" r="${dotR}" fill="${color}"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#F1EDE6"/>
  <text
    x="${cx}"
    y="${textBaseline.toFixed(2)}"
    font-family="'Liberation Serif','DejaVu Serif',Georgia,serif"
    font-style="italic"
    font-size="${fontSize}"
    fill="#C4502E"
    text-anchor="middle"
  >A</text>
  ${dots}
</svg>`;
}

async function main() {
  const svg = Buffer.from(makeSvg(512));

  await sharp(svg).resize(512, 512).png().toFile(`${OUT}/icon-512.png`);
  console.log('✓ public/icon-512.png');

  await sharp(svg).resize(192, 192).png().toFile(`${OUT}/icon-192.png`);
  console.log('✓ public/icon-192.png');

  await sharp(svg).resize(180, 180).png().toFile(`${OUT}/apple-touch-icon.png`);
  console.log('✓ public/apple-touch-icon.png');
}

main().catch(err => { console.error(err); process.exit(1); });
