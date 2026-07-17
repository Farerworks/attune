import { auth } from '@/auth';

export const runtime = 'nodejs';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSyncEnv(): { apiUrl: string; serviceToken: string } | null {
  const apiUrl = process.env.SYNC_API_URL;
  const serviceToken = process.env.SYNC_SERVICE_TOKEN;
  if (!apiUrl || !serviceToken) return null;
  return { apiUrl, serviceToken };
}

function upstreamHeaders(serviceToken: string, sub: string, email: string): HeadersInit {
  return {
    Authorization: `Bearer ${serviceToken}`,
    'X-User-Sub': sub,
    'X-User-Email': email,
  };
}

async function passThrough(res: Response): Promise<Response> {
  const data = await res.json().catch(() => null);
  return Response.json(data, { status: res.status });
}

// ── Route handlers ───────────────────────────────────────────────────────────

export async function GET() {
  const env = getSyncEnv();
  if (!env) return Response.json({ error: 'sync not configured' }, { status: 503 });

  const session = await auth();
  if (!session?.sub) return Response.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${env.apiUrl}/sync`, {
      method: 'GET',
      headers: upstreamHeaders(env.serviceToken, session.sub, session.user?.email ?? ''),
    });
    console.log('[sync] GET status:', res.status);
    return await passThrough(res);
  } catch {
    console.error('[sync] GET failed');
    return Response.json({ error: 'sync unavailable' }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  const env = getSyncEnv();
  if (!env) return Response.json({ error: 'sync not configured' }, { status: 503 });

  const session = await auth();
  if (!session?.sub) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();

  try {
    const res = await fetch(`${env.apiUrl}/sync`, {
      method: 'PUT',
      headers: {
        ...upstreamHeaders(env.serviceToken, session.sub, session.user?.email ?? ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    console.log('[sync] PUT status:', res.status);
    return await passThrough(res);
  } catch {
    console.error('[sync] PUT failed');
    return Response.json({ error: 'sync unavailable' }, { status: 502 });
  }
}

export async function DELETE() {
  const env = getSyncEnv();
  if (!env) return Response.json({ error: 'sync not configured' }, { status: 503 });

  const session = await auth();
  if (!session?.sub) return Response.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const res = await fetch(`${env.apiUrl}/account`, {
      method: 'DELETE',
      headers: upstreamHeaders(env.serviceToken, session.sub, session.user?.email ?? ''),
    });
    console.log('[sync] DELETE status:', res.status);
    return await passThrough(res);
  } catch {
    console.error('[sync] DELETE failed');
    return Response.json({ error: 'sync unavailable' }, { status: 502 });
  }
}
