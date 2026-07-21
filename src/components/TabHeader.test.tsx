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

  it('renders a Settings link by default', () => {
    render(<TabHeader title="Home" />);
    const link = screen.getByLabelText('Settings');
    expect(link.getAttribute('href')).toBe('/settings');
  });

  it('omits the Settings link when showSettings is false', () => {
    render(<TabHeader title="Settings" showSettings={false} />);
    expect(screen.queryByLabelText('Settings')).toBeNull();
  });
});
