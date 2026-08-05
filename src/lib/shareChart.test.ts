import { describe, it, expect } from 'vitest';
import { drawElementPentagon, computeBlobPoints, type PentagonSeries } from './shareChart';

interface PathCall { type: 'moveTo' | 'lineTo' | 'bezierCurveTo' | 'closePath'; args: number[] }

function makeFakeCtx() {
  const calls: PathCall[] = [];
  const ctx = {
    calls,
    beginPath: () => {},
    moveTo: (x: number, y: number) => calls.push({ type: 'moveTo', args: [x, y] }),
    lineTo: (x: number, y: number) => calls.push({ type: 'lineTo', args: [x, y] }),
    bezierCurveTo: (...args: number[]) => calls.push({ type: 'bezierCurveTo', args }),
    closePath: () => calls.push({ type: 'closePath', args: [] }),
    stroke: () => {},
    fill: () => {},
    fillText: () => {},
    strokeStyle: '', fillStyle: '', lineWidth: 0,
    shadowColor: '', shadowBlur: 0, globalAlpha: 1,
    font: '', letterSpacing: '0px', textAlign: 'left', textBaseline: 'alphabetic',
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: PathCall[] };
}

/** Splits the recorded call log into path segments, one per moveTo...closePath run. */
function splitPaths(calls: PathCall[]): PathCall[][] {
  const paths: PathCall[][] = [];
  let current: PathCall[] = [];
  for (const c of calls) {
    if (c.type === 'moveTo' && current.length > 0) { paths.push(current); current = []; }
    current.push(c);
  }
  if (current.length > 0) paths.push(current);
  return paths;
}

describe('drawElementPentagon — straight blob (BRIEF-093C)', () => {
  it('never calls bezierCurveTo, and each series path is 1 moveTo + 4 lineTo (5-point pentagon)', () => {
    const ctx = makeFakeCtx();
    const series: PentagonSeries[] = [
      { elements: { wood: 2, fire: 3, earth: 1, metal: 4, water: 2 }, color: '#D96A45' },
      { elements: { wood: 1, fire: 1, earth: 1, metal: 1, water: 1 }, color: '#AEB4B8' },
    ];
    drawElementPentagon(ctx, { cx: 540, cy: 1050, radius: 440, series });

    expect(ctx.calls.some(c => c.type === 'bezierCurveTo')).toBe(false);

    const paths = splitPaths(ctx.calls);
    // 2 grid rings + 2 series = 4 paths total; the last 2 are the series blobs.
    expect(paths.length).toBe(4);
    const seriesPaths = paths.slice(-2);
    for (const path of seriesPaths) {
      const moveTos = path.filter(c => c.type === 'moveTo');
      const lineTos = path.filter(c => c.type === 'lineTo');
      expect(moveTos.length).toBe(1);
      expect(lineTos.length).toBe(4);
    }
  });

  it('extreme input (all weight on one element): blob path coordinates match computeBlobPoints exactly', () => {
    const ctx = makeFakeCtx();
    const elements = { wood: 5, fire: 0, earth: 0, metal: 0, water: 0 };
    const cx = 540, cy = 1050, radius = 440;
    const series: PentagonSeries[] = [{ elements, color: '#D96A45' }];
    drawElementPentagon(ctx, { cx, cy, radius, series });

    const expectedPts = computeBlobPoints(elements, cx, cy, radius, Math.max(...Object.values(elements), 3));

    const paths = splitPaths(ctx.calls);
    const seriesPath = paths[paths.length - 1]; // grid (2 rings) + 1 series
    const actualPts = seriesPath
      .filter(c => c.type === 'moveTo' || c.type === 'lineTo')
      .map(c => ({ x: c.args[0], y: c.args[1] }));

    expect(actualPts).toEqual(expectedPts);
  });
});
