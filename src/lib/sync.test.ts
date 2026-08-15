// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { markReplaceAck, hasReplaceAck, pushBackup } from './sync';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(opts: { session: { sub?: string; user?: { email?: string } } | null; pushOk?: boolean }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/auth/session') {
      return { ok: true, json: async () => opts.session } as Response;
    }
    if (url === '/api/sync' && init?.method === 'PUT') {
      if (opts.pushOk === false) return { ok: false, status: 500, json: async () => ({}) } as Response;
      return { ok: true, json: async () => ({ updatedAt: '2026-08-20T00:00:00.000Z' }) } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('BRIEF-107 §1 — pushBackup account-scoped replace-ack gate', () => {
  it('계정 귀속: 계정 A로 승인 → 계정 B 세션 → pushBackup()이 PUT을 보내지 않는다', async () => {
    markReplaceAck('account-A-sub');

    const fetchMock = stubFetch({ session: { sub: 'account-B-sub', user: { email: 'b@example.com' } } });
    const res = await pushBackup();

    expect(res.ok).toBe(false);
    expect((res as { blocked?: true }).blocked).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/sync' && (init as RequestInit)?.method === 'PUT')).toBe(false);
  });

  it('우회 방지: 승인 없이 person/[id]처럼 pushBackup()을 직접 호출해도 fetch(/api/sync, PUT)이 0회다', async () => {
    const fetchMock = stubFetch({ session: { sub: 'fresh-sub' } });

    const res = await pushBackup();

    expect(res.ok).toBe(false);
    expect(fetchMock.mock.calls.filter(([url, init]) => url === '/api/sync' && (init as RequestInit)?.method === 'PUT')).toHaveLength(0);
  });

  it('승인된 계정이면 pushBackup()이 정상적으로 PUT을 보낸다', async () => {
    markReplaceAck('sub-1');
    const fetchMock = stubFetch({ session: { sub: 'sub-1' } });

    const res = await pushBackup();

    expect(res.ok).toBe(true);
    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/sync' && (init as RequestInit)?.method === 'PUT')).toBe(true);
  });

  it('세션이 없으면(비로그인) 기존대로 처리한다 — 게이트 없이 PUT을 시도한다', async () => {
    const fetchMock = stubFetch({ session: null });

    await pushBackup();

    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/sync' && (init as RequestInit)?.method === 'PUT')).toBe(true);
  });

  it('Settings 수동 백업(explicitReplace:true): 승인 없이도 PUT이 성공하고, 성공 시 그 sub로 승인이 기록된다', async () => {
    stubFetch({ session: { sub: 'new-sub' } });

    expect(hasReplaceAck('new-sub')).toBe(false);
    const res = await pushBackup({ explicitReplace: true });

    expect(res.ok).toBe(true);
    expect(hasReplaceAck('new-sub')).toBe(true);
  });

  it('explicitReplace:true라도 PUT이 실패하면 승인을 기록하지 않는다', async () => {
    stubFetch({ session: { sub: 'new-sub-2' }, pushOk: false });

    const res = await pushBackup({ explicitReplace: true });

    expect(res.ok).toBe(false);
    expect(hasReplaceAck('new-sub-2')).toBe(false);
  });

  it('hasReplaceAck는 저장된 sub와 정확히 일치할 때만 true다', async () => {
    markReplaceAck('exact-sub');

    expect(hasReplaceAck('exact-sub')).toBe(true);
    expect(hasReplaceAck('other-sub')).toBe(false);
    expect(hasReplaceAck('')).toBe(false);
  });
});
