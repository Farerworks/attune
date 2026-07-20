// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IljuSheet } from './IljuSheet';
import { ILJU_PROFILES } from '@/lib/iljuProfiles';

afterEach(cleanup);

describe('IljuSheet', () => {
  it('renders name, subtitle, gifts (3), and all 5 section labels for 甲子', () => {
    const profile = ILJU_PROFILES['甲子'];
    render(
      <IljuSheet
        profile={profile}
        stemHanja="甲"
        branchHanja="子"
        stemElement="wood"
        branchElement="water"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(profile.name)).toBeTruthy();
    expect(screen.getByText(profile.subtitle)).toBeTruthy();
    expect(screen.getByText(profile.essence)).toBeTruthy();

    for (const gift of profile.gifts) {
      expect(screen.getByText(gift)).toBeTruthy();
    }
    expect(profile.gifts).toHaveLength(3);

    for (const label of ['CORE', 'RELATING', 'GIFTS', 'UNDER PRESSURE', 'REACHING THEM']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('does not render a traditionNote footnote for 甲子 (no traditionNote)', () => {
    const profile = ILJU_PROFILES['甲子'];
    expect(profile.traditionNote).toBeUndefined();
    render(
      <IljuSheet
        profile={profile}
        stemHanja="甲"
        branchHanja="子"
        stemElement="wood"
        branchElement="water"
        onClose={vi.fn()}
      />,
    );
    // no italic footnote paragraph text should exist since traditionNote is absent
    expect(screen.queryByText(/Old texts/i)).toBeNull();
  });

  it('renders the traditionNote footnote for 癸丑 (has traditionNote)', () => {
    const profile = ILJU_PROFILES['癸丑'];
    expect(profile.traditionNote).toBeTruthy();
    render(
      <IljuSheet
        profile={profile}
        stemHanja="癸"
        branchHanja="丑"
        stemElement="water"
        branchElement="earth"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(profile.traditionNote as string)).toBeTruthy();
  });
});
