'use client';

import { useEffect, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ELEMENT_INSIGHT, getArchetype } from '@/lib/interpretGuide';
import type { TenStem } from '@/lib/saju';
import { ArchetypeGlyph } from './ArchetypeGlyph';
import { drawElementPentagon } from '@/lib/shareChart';

// ── Constants ─────────────────────────────────────────────────────────────────

const EL_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'] as const;

const DARK_TONES: Record<string, string> = {
  wood:  '#8FBF93',
  fire:  '#E8825F',
  earth: '#D9B65A',
  metal: '#AEB4B8',
  water: '#7FA3D0',
};

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  startSize: number,
  minSize: number,
): number {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `500 ${size}px Fraunces`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 4;
  }
  return Math.max(size, minSize);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 'wood'/'Yang' → 'Yang Wood', matching ArchetypeGlyph's TenStem keys. */
function toStemKey(element: string, polarity: string): TenStem | null {
  const el = element.charAt(0).toUpperCase() + element.slice(1).toLowerCase();
  const pol = polarity.charAt(0).toUpperCase() + polarity.slice(1).toLowerCase();
  const key = `${pol} ${el}`;
  const valid: string[] = [
    'Yang Wood', 'Yin Wood', 'Yang Fire', 'Yin Fire', 'Yang Earth',
    'Yin Earth', 'Yang Metal', 'Yin Metal', 'Yang Water', 'Yin Water',
  ];
  return valid.includes(key) ? (key as TenStem) : null;
}

/** Serializes ArchetypeGlyph's SVG for the given stem into a loaded Image, via Blob URL. */
async function loadGlyphImage(stem: TenStem, color: string, sizePx: number): Promise<HTMLImageElement | null> {
  try {
    const markup = renderToStaticMarkup(
      <ArchetypeGlyph stem={stem} color={color} size={sizePx} strokeWidth={1} />,
    );
    const svg = markup.includes('xmlns=')
      ? markup
      : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('glyph image failed to load'));
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

function drawMyCard(
  ctx: CanvasRenderingContext2D,
  archetypeName: string,
  element: string,
  polarity: string,
  elements: Record<string, number>,
  tagline: string,
  glyphImg: HTMLImageElement | null,
) {
  const W = 1080, H = 1920, PAD = 96;
  const CW = W - 2 * PAD;

  const domEl = EL_ORDER.reduce((a, b) => (elements[b] ?? 0) > (elements[a] ?? 0) ? b : a);
  const insight = ELEMENT_INSIGHT[domEl] ?? '';
  const kickerColor = DARK_TONES[element.toLowerCase()] ?? '#AEB4B8';

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#17130E');
  grad.addColorStop(1, '#100E0B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 2. Large glyph watermark — drawn first so all text sits above it
  if (glyphImg) {
    const gSize = Math.round(W * 0.55);
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.drawImage(glyphImg, W - gSize + 70, 10, gSize, gSize);
    ctx.restore();
  }

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // 3. Wordmark
  ctx.font = '400 30px "Space Mono"';
  ctx.letterSpacing = '6px';
  ctx.fillStyle = '#9A8F7C';
  ctx.fillText('ATTUNE', PAD, 150);
  ctx.letterSpacing = '0px';

  // 4~7. Center block (top-baseline, cursor-based so nothing overlaps)
  ctx.textBaseline = 'top';

  const nameFontSize = fitFontSize(ctx, archetypeName, CW, 116, 76);
  ctx.font = `500 ${nameFontSize}px Fraunces`;
  const nameLines = wrapText(ctx, archetypeName, CW);
  const nameLineHeight = nameFontSize * 1.06;

  let cursor = 268;

  // kicker
  ctx.font = '400 34px "Space Mono"';
  ctx.fillStyle = kickerColor;
  ctx.fillText(`${element} · ${polarity}`.toUpperCase(), PAD, cursor);
  cursor += 34 + 26;

  // name
  ctx.font = `500 ${nameFontSize}px Fraunces`;
  ctx.fillStyle = '#F5F1E8';
  nameLines.forEach((line, i) => ctx.fillText(line, PAD, cursor + i * nameLineHeight));
  cursor += nameLines.length * nameLineHeight + 30;

  // tagline
  if (tagline) {
    ctx.font = 'italic 46px Fraunces';
    ctx.fillStyle = '#CFC5B4';
    const taglineLines = wrapText(ctx, tagline, CW);
    taglineLines.forEach((line, i) => ctx.fillText(line, PAD, cursor + i * 58));
    cursor += taglineLines.length * 58 + 84;
  }

  // 5. Mini element pentagon — centered
  const pentaRadius = 320;
  const pentaCx = W / 2;
  const pentaCy = cursor + pentaRadius;
  drawElementPentagon(ctx, {
    cx: pentaCx, cy: pentaCy, radius: pentaRadius,
    series: [{ elements, color: '#D96A45' }],
  });
  cursor = pentaCy + pentaRadius + 90;

  // 6. Dominant-element insight, under its own "DOMINANT CURRENT" label
  if (insight) {
    ctx.font = '400 27px "Space Mono"';
    ctx.letterSpacing = '4px';
    ctx.fillStyle = '#9A8F7C';
    ctx.fillText('DOMINANT CURRENT', PAD, cursor);
    ctx.letterSpacing = '0px';
    cursor += 27 + 30;

    ctx.font = '400 52px Fraunces';
    ctx.fillStyle = '#EDE4D2';
    const insightLines = wrapText(ctx, insight, CW);
    insightLines.forEach((line, i) => ctx.fillText(line, PAD, cursor + i * 70));
  }

  ctx.textBaseline = 'alphabetic';   // 푸터 계산 원상복구

  // 7. Footer
  const footerHairlineY = H - 150;
  ctx.strokeStyle = '#332C22';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, footerHairlineY);
  ctx.lineTo(W - PAD, footerHairlineY);
  ctx.stroke();

  const footerTextY = footerHairlineY + 70;
  ctx.font = '400 26px "Space Mono"';
  ctx.fillStyle = '#9A8F7C';
  ctx.textAlign = 'left';
  ctx.fillText('attune-silk.vercel.app', PAD, footerTextY);

  ctx.font = '400 26px "Space Mono"';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = kickerColor;
  ctx.textAlign = 'right';
  ctx.fillText('MY READ', W - PAD, footerTextY);
  ctx.textAlign = 'left';
  ctx.letterSpacing = '0px';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  archetypeName: string;
  element: string;
  polarity: string;
  elements: Record<string, number>;
  onClose: () => void;
}

export function MyCardModal({ archetypeName, element, polarity, elements, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      await document.fonts.ready;
      try {
        await Promise.all([
          document.fonts.load('500 116px Fraunces'),
          document.fonts.load('italic 46px Fraunces'),
          document.fonts.load('400 52px Fraunces'),
          document.fonts.load('400 30px "Space Mono"'),
          document.fonts.load('400 34px "Space Mono"'),
          document.fonts.load('400 27px "Space Mono"'),
        ]);
      } catch { /* fonts fall back gracefully */ }

      if (cancelled) return;

      const stem = toStemKey(element, polarity);
      const glyphImg = stem ? await loadGlyphImage(stem, '#F5F1E8', 640).catch(() => null) : null;
      const tagline = stem ? getArchetype(stem).tagline : '';

      if (cancelled) return;

      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setRendering(false); return; }

      drawMyCard(ctx, archetypeName, element, polarity, elements, tagline, glyphImg);

      if (!cancelled) {
        setDataUrl(canvas.toDataURL('image/png'));
        setRendering(false);
      }
    }

    void render();
    return () => { cancelled = true; };
  }, [archetypeName, element, polarity, elements]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'attune-mycard.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        background: 'rgba(8,7,5,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 20px', gap: 20,
        animation: 'fade-in 200ms ease backwards',
      }}
    >
      {/* 9:16 preview */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', minHeight: 0,
      }}>
        {rendering ? (
          <span style={{
            fontFamily: "var(--font-space-mono,'Courier New')",
            fontSize: 11, letterSpacing: '0.12em', color: '#948B7C',
          }}>
            RENDERING…
          </span>
        ) : dataUrl ? (
          <img
            src={dataUrl}
            alt="My card preview"
            style={{
              maxHeight: '60vh', maxWidth: '100%',
              width: 'auto', borderRadius: 8, objectFit: 'contain',
            }}
          />
        ) : (
          <span style={{ fontFamily: "var(--font-inter,system-ui)", fontSize: 14, color: '#C4502E' }}>
            Could not render card.
          </span>
        )}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 360, animation: 'sheet-up var(--dur-slow) var(--ease-sheet) backwards' }}>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!dataUrl}
          style={{
            height: 52, borderRadius: 999,
            background: dataUrl ? '#C4502E' : 'rgba(255,255,255,0.08)',
            color: '#fff',
            fontFamily: "var(--font-inter,system-ui)", fontSize: 16, fontWeight: 600,
            border: 'none', cursor: dataUrl ? 'pointer' : 'default',
          }}
        >
          Download PNG
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            height: 44, borderRadius: 999,
            background: 'none', color: '#948B7C',
            fontFamily: "var(--font-inter,system-ui)", fontSize: 14,
            border: '1px solid rgba(148,139,124,0.3)', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
