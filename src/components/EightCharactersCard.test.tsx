// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { EightCharactersCard } from './EightCharactersCard';
import type { ChartSummary } from '@/lib/store';

afterEach(cleanup);

const pillar = (stem: string, stemHanja: string, branch: string, branchHanja: string) => ({
  stem, stemHanja, branch, branchHanja,
});

describe('EightCharactersCard — day sheet defensive guard', () => {
  it('does not make the DAY column tappable when getIljuProfile(dayStem, dayBranch) is null', () => {
    // 甲(Yang Wood) + 丑(Ox) is not a real sexagenary pair — yang stems only pair with yang branches —
    // so getIljuProfile('甲', '丑') resolves to null even though both hanja individually exist.
    const pillars: ChartSummary['pillars'] = {
      year:  pillar('Yang Wood', '甲', 'Ox', '丑'),
      month: pillar('Yang Wood', '甲', 'Ox', '丑'),
      day:   pillar('Yang Wood', '甲', 'Ox', '丑'),
      hour:  null,
    };

    render(<EightCharactersCard pillars={pillars} pillarsKnown={6} />);

    const dayLabel = screen.getByText('DAY');
    const dayColumn = dayLabel.closest('div');
    expect(dayColumn?.className).not.toContain('pressable');
    expect(dayColumn?.getAttribute('role')).not.toBe('button');

    if (dayColumn) fireEvent.click(dayColumn);
    // No sheet should appear — its close button ("×") would only exist if the sheet opened.
    expect(screen.queryByLabelText('Close')).toBeNull();
  });

  it('makes the DAY column tappable and opens the sheet for a real sexagenary pair (甲子)', () => {
    const pillars: ChartSummary['pillars'] = {
      year:  pillar('Yang Wood', '甲', 'Rat', '子'),
      month: pillar('Yang Wood', '甲', 'Rat', '子'),
      day:   pillar('Yang Wood', '甲', 'Rat', '子'),
      hour:  null,
    };

    render(<EightCharactersCard pillars={pillars} pillarsKnown={6} />);

    const dayColumn = screen.getByRole('button');
    expect(dayColumn.className).toContain('pressable');

    fireEvent.click(dayColumn);
    expect(screen.getByLabelText('Close')).toBeTruthy();
    expect(screen.getByText('The First Light of the Rat')).toBeTruthy();
  });
});
