// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { ElementChart, type ElementChartData } from './ElementChart';

afterEach(cleanup);

const CX = 100, CY = 100, R = 68;

function makeDataset(elements: Record<string, number>, color: string): ElementChartData {
  return { elements, pillarsKnown: 8, color };
}

describe('ElementChart — straight polygon (BRIEF-092)', () => {
  it('blob path has no cubic-curve ("C") commands — straight lines only', () => {
    const { container } = render(
      <ElementChart datasets={[makeDataset({ wood: 2, fire: 3, earth: 1, metal: 4, water: 2 }, '#4E8A52')]} />,
    );
    const paths = Array.from(container.querySelectorAll('svg > g > path'));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      const d = p.getAttribute('d') ?? '';
      expect(d).not.toContain('C');
    }
  });

  it('renders one vertex circle per element, per series (2 series -> 10 circles)', () => {
    const { container } = render(
      <ElementChart
        datasets={[
          makeDataset({ wood: 2, fire: 3, earth: 1, metal: 4, water: 2 }, '#4E8A52'),
          makeDataset({ wood: 1, fire: 1, earth: 1, metal: 1, water: 1 }, '#4A76AC'),
        ]}
      />,
    );
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2 * 5);
  });

  it('renders 5 vertex circles for a single series', () => {
    const { container } = render(
      <ElementChart datasets={[makeDataset({ wood: 2, fire: 3, earth: 1, metal: 4, water: 2 }, '#4E8A52')]} />,
    );
    expect(container.querySelectorAll('circle').length).toBe(5);
  });

  it('extreme input (all weight on one element) keeps every path coordinate within radius R of center', () => {
    const { container } = render(
      <ElementChart datasets={[makeDataset({ wood: 5, fire: 0, earth: 0, metal: 0, water: 0 }, '#4E8A52')]} />,
    );
    const path = container.querySelector('svg > g > path');
    const d = path?.getAttribute('d') ?? '';
    const coordPairs = d.match(/-?\d+\.\d+ -?\d+\.\d+/g) ?? [];
    expect(coordPairs.length).toBeGreaterThan(0);
    for (const pair of coordPairs) {
      const [x, y] = pair.split(' ').map(Number);
      const dist = Math.hypot(x - CX, y - CY);
      expect(dist).toBeLessThanOrEqual(R + 0.01);
    }
  });
});
