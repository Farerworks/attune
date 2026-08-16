// Five-element pentagon chart drawing — shared by MyCardModal (1 series) and
// ShareModal (2 series). Extracted verbatim from ShareModal's drawRadarLayer /
// computeBlobPoints so both cards render pixel-identical output.

export const EL_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'] as const;
const ANGLES = EL_ORDER.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 5);

export function computeBlobPoints(
  elements: Record<string, number>,
  cx: number, cy: number, r: number, normMax: number,
): Array<{ x: number; y: number }> {
  return EL_ORDER.map((k, i) => {
    const val = Math.max(0, elements[k] ?? 0);
    const ratio = 0.12 + 0.88 * (val / normMax);
    return { x: cx + r * ratio * Math.cos(ANGLES[i]), y: cy + r * ratio * Math.sin(ANGLES[i]) };
  });
}

export interface PentagonSeries {
  elements: Record<string, number>;
  color: string;
}

export interface DrawElementPentagonOptions {
  cx: number;
  cy: number;
  radius: number;
  series: PentagonSeries[];
  labelColor?: string;
  guideColorInner?: string;
  guideColorOuter?: string;
  axisLabels?: readonly string[];
  axisFont?: string;
  axisLetterSpacing?: string;
}

/** Draws the 5-axis guide grid + labels + filled series polygons. 1 series (solo card) or 2 (dynamic card). */
export function drawElementPentagon(
  ctx: CanvasRenderingContext2D,
  {
    cx, cy, radius, series,
    labelColor = 'rgba(154,143,124,0.95)',
    guideColorInner = 'rgba(245,241,232,0.16)',
    guideColorOuter = 'rgba(245,241,232,0.24)',
    axisLabels = EL_ORDER,
    axisFont = '400 30px "Space Mono"',
    axisLetterSpacing = '4px',
  }: DrawElementPentagonOptions,
) {
  const labels = axisLabels.length === 5 ? axisLabels : EL_ORDER;

  const normMax = Math.max(...series.flatMap(s => EL_ORDER.map(k => s.elements[k] ?? 0)), 3);

  // Grid rings
  [0.5, 1].forEach((ratio, idx) => {
    ctx.beginPath();
    ANGLES.forEach((a, j) => {
      const x = cx + radius * ratio * Math.cos(a);
      const y = cy + radius * ratio * Math.sin(a);
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = idx === 0 ? guideColorInner : guideColorOuter;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Axis labels
  ctx.font = axisFont;
  ctx.letterSpacing = axisLetterSpacing;
  ctx.fillStyle = labelColor;
  ctx.textBaseline = 'middle';
  EL_ORDER.forEach((_k, i) => {
    const lx = cx + radius * 0.78 * Math.cos(ANGLES[i]);
    const ly = cy + radius * 0.78 * Math.sin(ANGLES[i]);
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], lx, ly);
  });
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  for (const { elements, color } of series) {
    const pts = computeBlobPoints(elements, cx, cy, radius, normMax);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
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
