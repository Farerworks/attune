// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';

// jsdom doesn't implement scrollIntoView — the page calls it on new messages.
Element.prototype.scrollIntoView = vi.fn();

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  mockReplace.mockReset();
  window.history.pushState({}, '', '/ask');
});

describe('AskPage', () => {
  it('renders exactly one Settings link, in the top bar (avatar), not in TabHeader (BRIEF-080)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    const { container } = render(<AskPage />);

    await waitFor(() => {
      expect(screen.getAllByLabelText('Settings')).toHaveLength(1);
    });
    const link = screen.getByLabelText('Settings');
    expect(link.getAttribute('href')).toBe('/settings');
    expect(container.querySelector('header')?.contains(link)).toBe(false);
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ask', expect.anything()));

    const askCall = fetchMock.mock.calls.find(([url]) => url === '/api/ask') as [string, RequestInit];
    const body = JSON.parse(askCall[1].body as string);

    expect(body.history).toEqual([
      { role: 'user', text: 'hi', at: '2026-07-19' },
      { role: 'assistant', text: 'hello', at: '2026-07-19' },
    ]);
  });

  it('composer textarea has fontSize 16 — prevents iOS Safari auto-zoom on focus (BRIEF-091)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask anything…')).toBeTruthy();
    });

    const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;
    expect(textarea.style.fontSize).toBe('16px');
  });

  it('first-visit examples: 0 saved people -> self/general examples, no person-oriented ones (BRIEF-089)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByText("What's today like for me?")).toBeTruthy();
    });
    expect(screen.getByText('Is this a good stretch to start something?')).toBeTruthy();
    expect(screen.getByText('What should I watch for this week?')).toBeTruthy();
    expect(screen.queryByText('How do I ask them out?')).toBeNull();
    expect(screen.queryByText('Why the slow replies?')).toBeNull();
    expect(screen.queryByText('How do I raise a hard topic?')).toBeNull();
  });

  it('first-visit examples: 1+ saved people -> the original person-oriented examples (BRIEF-089)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    localStorage.setItem('attune.readings', JSON.stringify([
      { id: 'r1', name: 'Sam', date: '1988-03-02', time: '09:00', createdAt: new Date().toISOString() },
    ]));

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      expect(screen.getByText('How do I ask them out?')).toBeTruthy();
    });
    expect(screen.getByText('Why the slow replies?')).toBeTruthy();
    expect(screen.getByText('How do I raise a hard topic?')).toBeTruthy();
    expect(screen.queryByText("What's today like for me?")).toBeNull();
  });

  it('?prefill=... fills the composer with the phrase and does not auto-send (BRIEF-094B)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ answer: { text: 'x' } }) });
    vi.stubGlobal('fetch', fetchMock);

    window.history.pushState({}, '', `/ask?prefill=${encodeURIComponent('Is today good for a big ask?')}`);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Ask anything…') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Is today good for a big ask?');
    });

    expect(fetchMock.mock.calls.some(([url]) => url === '/api/ask')).toBe(false);
  });

  it('?prefill=... strips the param from the URL after consuming it (BRIEF-094B)', async () => {
    localStorage.setItem('attune.profile', JSON.stringify({
      date: '1990-06-15', time: '14:30', gender: 'other', createdAt: new Date().toISOString(),
    }));
    window.history.pushState({}, '', `/ask?prefill=${encodeURIComponent('Is today good for a big ask?')}`);

    const { default: AskPage } = await import('./page');
    render(<AskPage />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/ask'));
  });
});
