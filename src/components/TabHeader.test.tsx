// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TabHeader } from './TabHeader';

afterEach(cleanup);

describe('TabHeader', () => {
  it('renders the given title', () => {
    render(<TabHeader title="People" />);
    expect(screen.getByText('People')).toBeTruthy();
  });

  it('no longer renders a Settings link — moved to the top bar avatar (BRIEF-080)', () => {
    render(<TabHeader title="Home" />);
    expect(screen.queryByLabelText('Settings')).toBeNull();
  });
});
