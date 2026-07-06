'use client';

import type { SVGProps } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const ELEMENT_ORDER = ['wood', 'fire', 'earth', 'metal', 'water'] as const;
type ElementKey = (typeof ELEMENT_ORDER)[number];

const FG: Record<ElementKey, string> = {
  wood:  '#4E8A52',
  fire:  '#C4502E',
  earth: '#A8842C',
  metal: '#6E7A80',
  water: '#4A76AC',
};

// WOOD at top (-90°), then clockwise every 72°
const ANGLES = ELEMENT_ORDER.map((_, i) => -Math.PI / 2 + (2 * Math.PI * i) / 5);

// ── Helpers ──────────────────────────────────────────────────────────────────

function radarPts(
  elements: Record<string, number>,
  normMax: number,
  cx: number, cy: number, r: number,
): Array<{ x: number; y: number }> {
  const minR = 0.12; // even 0-count keeps a small blob
  return ELEMENT_ORDER.map((key, i) => {
    const val = Math.max(0, elements[key] ?? 0);
    const ratio = minR + (1 - minR) * (val / normMax);
    return {
      x: cx + r * ratio * Math.cos(ANGLES[i]),
      y: cy + r * ratio * Math.sin(ANGLES[i]),
    };
  });
}

function smoothPath(pts: Array<{ x: number; y: number }>): string {
  const n = pts.length;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d + ' Z';
}

function pentagonPath(cx: number, cy: number, r: number): string {
  return ANGLES.map((a, i) => {
    const x = (cx + r * Math.cos(a)).toFixed(2);
    const y = (cy + r * Math.sin(a)).toFixed(2);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ') + ' Z';
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ElementChartData {
  elements: Record<string, number>;
  pillarsKnown: number;
  color: string; // element fg hex color
}

interface ElementChartProps extends SVGProps<SVGSVGElement> {
  datasets: ElementChartData[];   // 1 = single blob, 2 = overlap
  size?: number;
  showGrid?: boolean;
  darkMode?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ElementChart({
  datasets,
  size = 200,
  showGrid = true,
  darkMode = false,
  style,
  ...svgProps
}: ElementChartProps) {
  // Fixed internal coordinate space; SVG element is scaled by size prop
  const CX = 100, CY = 100, R = 68;
  const LABEL_R = R + 18;

  const normMax = Math.max(
    ...datasets.flatMap(ds => ELEMENT_ORDER.map(k => ds.elements[k] ?? 0)),
    3,
  );
  const gridStroke = darkMode
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.07)';
  const fillOpacity = datasets.length === 1 ? 0.25 : 0.22;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      overflow="visible"
      style={{ display: 'block', ...style }}
      {...svgProps}
    >
      {/* Grid rings */}
      {showGrid && [0.33, 0.66, 1].map((ratio, i) => (
        <path
          key={i}
          d={pentagonPath(CX, CY, R * ratio)}
          fill="none"
          stroke={gridStroke}
          strokeWidth={1}
        />
      ))}

      {/* Grid spokes */}
      {showGrid && ANGLES.map((a, i) => (
        <line
          key={i}
          x1={CX} y1={CY}
          x2={(CX + R * Math.cos(a)).toFixed(2)}
          y2={(CY + R * Math.sin(a)).toFixed(2)}
          stroke={gridStroke}
          strokeWidth={1}
        />
      ))}

      {/* Blobs */}
      {datasets.map((ds, di) => (
        <path
          key={di}
          d={smoothPath(radarPts(ds.elements, normMax, CX, CY, R))}
          fill={ds.color}
          fillOpacity={fillOpacity}
          stroke={ds.color}
          strokeWidth={2.5}
          strokeOpacity={0.85}
        />
      ))}

      {/* Axis labels */}
      {ELEMENT_ORDER.map((key, i) => {
        const a = ANGLES[i];
        const lx = CX + LABEL_R * Math.cos(a);
        const ly = CY + LABEL_R * Math.sin(a);
        const anchor =
          Math.abs(Math.cos(a)) < 0.25 ? 'middle'
          : Math.cos(a) > 0 ? 'start'
          : 'end';
        return (
          <text
            key={key}
            x={lx.toFixed(2)}
            y={ly.toFixed(2)}
            textAnchor={anchor}
            dominantBaseline="central"
            fontSize={9}
            fontFamily="var(--font-space-mono, 'Courier New')"
            fill={darkMode ? `rgba(${parseInt(FG[key].slice(1,3),16)},${parseInt(FG[key].slice(3,5),16)},${parseInt(FG[key].slice(5,7),16)},0.7)` : FG[key]}
            letterSpacing="0.06em"
          >
            {key.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
