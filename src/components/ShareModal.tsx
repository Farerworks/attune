'use client';

import { useEffect, useState } from 'react';
import type { Reading } from '@/lib/store';
import type { Archetype } from '@/lib/interpretGuide';

// ── Constants ─────────────────────────────────────────────────────────────────

const EL_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'];
const ANGLES = EL_ORDER.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 5);

const DARK_TONES: Record<string, string> = {
  wood:  '#8FBF93',
  fire:  '#E8825F',
  earth: '#D9B65A',
  metal: '#AEB4B8',
  water: '#7FA3D0',
};

const RESONANCE_POSTER: Record<string, string> = {
  'strong-current': 'STRONG CURRENT',
  'mixed-signals':  'MIXED SIGNALS',
  'slow-build':     'SLOW BUILD',
};

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

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

function drawRadarLayer(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  blobs: Array<{ elements: Record<string, number>; color: string }>,
) {
  const normMax = Math.max(...blobs.flatMap(b => EL_ORDER.map(k => b.elements[k] ?? 0)), 3);

  // Grid rings
  [0.5, 1].forEach((ratio, idx) => {
    ctx.beginPath();
    ANGLES.forEach((a, j) => {
      const x = cx + r * ratio * Math.cos(a);
      const y = cy + r * ratio * Math.sin(a);
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = idx === 0 ? 'rgba(245,241,232,0.08)' : 'rgba(245,241,232,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  for (const { elements, color } of blobs) {
    const pts = EL_ORDER.map((k, i) => {
      const val = Math.max(0, elements[k] ?? 0);
      const ratio = 0.12 + 0.88 * (val / normMax);
      return { x: cx + r * ratio * Math.cos(ANGLES[i]), y: cy + r * ratio * Math.sin(ANGLES[i]) };
    });

    const n = pts.length;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      ctx.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
        p2.x, p2.y,
      );
    }
    ctx.closePath();
    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.11;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawShareCard(
  ctx: CanvasRenderingContext2D,
  reading: Reading,
  myArchetype: Archetype | null,
  theirArchetype: Archetype | null,
) {
  const W = 1080, H = 1920, PAD = 84;

  // 1. Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#17130E');
  grad.addColorStop(1, '#100E0B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // 2. Background radar (offscreen → composite at 55%)
  if (reading.myChart && reading.themChart) {
    const theirEl = reading.themChart.dayMaster.element.toLowerCase();
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = W; bgCanvas.height = H;
    const bgCtx = bgCanvas.getContext('2d');
    if (bgCtx) {
      drawRadarLayer(bgCtx, 540, 1050, 575, [
        { elements: reading.myChart.elements, color: '#D96A45' },
        { elements: reading.themChart.elements, color: DARK_TONES[theirEl] ?? '#AEB4B8' },
      ]);
    }
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.drawImage(bgCanvas, 0, 0);
    ctx.restore();
  }

  // 3. Foreground text
  const b = reading.briefing;

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // "our dynamic" label
  ctx.font = '400 33px "Space Mono"';
  ctx.letterSpacing = '8px';
  ctx.fillStyle = '#9A8F7C';
  ctx.fillText('our dynamic', PAD, 173);
  ctx.letterSpacing = '0px';

  // My archetype name
  if (myArchetype) {
    const myFontSize = fitFontSize(ctx, myArchetype.name, W - 2 * PAD, 108, 56);
    ctx.font = `500 ${myFontSize}px Fraunces`;
    ctx.fillStyle = '#F5F1E8';
    ctx.fillText(myArchetype.name, PAD, 360);
    ctx.shadowBlur = 0;
  }

  // "×"
  ctx.shadowBlur = 0;
  ctx.font = 'italic 90px Fraunces';
  ctx.fillStyle = '#D96A45';
  ctx.fillText('×', PAD, 472);

  // Their archetype name
  if (theirArchetype) {
    const theirFontSize = fitFontSize(ctx, theirArchetype.name, W - 2 * PAD, 108, 56);
    ctx.font = `500 ${theirFontSize}px Fraunces`;
    ctx.fillStyle = '#F5F1E8';
    ctx.fillText(theirArchetype.name, PAD, 582);
    ctx.shadowBlur = 0;
  }

  // Resonance pill
  const resonanceText = RESONANCE_POSTER[b?.dynamic?.resonance ?? ''] ?? '';
  if (resonanceText) {
    ctx.font = '700 30px "Space Mono"';
    ctx.letterSpacing = '6px';
    const textW = ctx.measureText(resonanceText).width;
    const pillW = textW + 52;
    const pillH = 68;
    const pillX = PAD, pillY = 664;

    ctx.strokeStyle = 'rgba(217,106,69,0.5)';
    ctx.lineWidth = 2.5;
    roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();

    ctx.fillStyle = '#D96A45';
    ctx.textBaseline = 'middle';
    ctx.fillText(resonanceText, pillX + 26, pillY + pillH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = '0px';
  }

  // Quote, rotated –1.5°
  const quoteText = b?.dynamic?.click?.takeaway ?? b?.dynamic?.clash?.takeaway ?? '';
  if (quoteText) {
    ctx.save();
    ctx.font = 'italic 57px Fraunces';
    ctx.fillStyle = '#CFC5B4';
    ctx.letterSpacing = '0px';
    const displayText = `“${quoteText}”`;
    const lines = wrapText(ctx, displayText, 812);
    ctx.translate(PAD, 1500);
    ctx.rotate(-1.5 * Math.PI / 180);
    lines.forEach((line, i) => ctx.fillText(line, 0, i * 82));
    ctx.restore();
  }

  // "not a verdict on anyone"
  ctx.font = '400 27px "Space Mono"';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = '#9A8F7C';
  ctx.fillText('not a verdict on anyone', PAD, 1720);
  ctx.letterSpacing = '0px';

  // Hairline
  ctx.strokeStyle = 'rgba(245,241,232,0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, 1760);
  ctx.lineTo(W - PAD, 1760);
  ctx.stroke();

  // Footer
  ctx.textBaseline = 'middle';
  ctx.font = '700 27px "Space Mono"';
  ctx.letterSpacing = '10px';
  ctx.fillStyle = '#9A8F7C';
  ctx.fillText('ATTUNE', PAD, 1840);

  ctx.font = '400 24px "Space Mono"';
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'right';
  ctx.fillText('POWERED BY SAJU', W - PAD, 1840);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0px';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  reading: Reading;
  myArchetype: Archetype | null;
  theirArchetype: Archetype | null;
  onClose: () => void;
}

export function ShareModal({ reading, myArchetype, theirArchetype, onClose }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      await document.fonts.ready;
      try {
        await Promise.all([
          document.fonts.load('500 108px Fraunces'),
          document.fonts.load('italic 90px Fraunces'),
          document.fonts.load('italic 57px Fraunces'),
          document.fonts.load('400 33px "Space Mono"'),
          document.fonts.load('700 30px "Space Mono"'),
        ]);
      } catch { /* fonts fall back gracefully */ }

      if (cancelled) return;

      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setRendering(false); return; }

      drawShareCard(ctx, reading, myArchetype, theirArchetype);

      if (!cancelled) {
        setDataUrl(canvas.toDataURL('image/png'));
        setRendering(false);
      }
    }

    void render();
    return () => { cancelled = true; };
  }, [reading, myArchetype, theirArchetype]);

  function handleDownload() {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'attune-dynamic.png';
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
            alt="Share card preview"
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
