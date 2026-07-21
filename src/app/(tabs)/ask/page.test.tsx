// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

// jsdom doesn't implement scrollIntoView — the page calls it on new messages.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('AskPage', () => {
  it('renders the Settings link in the header (BRIEF-077)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByLabelText('Settings')).toBeTruthy();
    });
    expect(screen.getByLabelText('Settings').getAttribute('href')).toBe('/settings');
  });

  it('includes an "at" date field (from createdAt) in each serialized history entry (BRIEF-078)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.ask.threads', JSON.stringify({
      me: [
        { id: 'u1', role: 'user', text: 'hi', createdAt: '2026-07-19T10:00:00.000Z' },
        { id: 'a1', role: 'assistant', mode: 'me', text: 'hello', createdAt: '2026-07-19T10:00:05.000Z' },
      ],
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: { text: 'mocked reply' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask anything…')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'a follow-up question' } });
    fireEvent.click(screen.getByLabelText('Send'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.history).toEqual([
      { role: 'user', text: 'hi', at: '2026-07-19' },
      { role: 'assistant', text: 'hello', at: '2026-07-19' },
    ]);
  });
});
