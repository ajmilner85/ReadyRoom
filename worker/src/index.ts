export interface Env {
  R2_BUCKET: R2Bucket;
  SUPABASE_JWT_SECRET: string;
  ALLOWED_ORIGINS: string;
  R2_PUBLIC_URL: string;
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif'
]);

function corsHeaders(origin: string, env: Env): HeadersInit {
  const allowed = env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

async function verifySupabaseJwt(token: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const [headerB64, payloadB64, signatureB64] = token.split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) return false;

  const signature = Uint8Array.from(
    atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
    c => c.charCodeAt(0)
  );

  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!valid) return false;

  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
  return payload.exp > Math.floor(Date.now() / 1000);
}

function sanitizePath(path: string): string | null {
  if (!path || path.includes('..') || path.startsWith('/')) return null;
  if (!/^[a-zA-Z0-9._\-/]+$/.test(path)) return null;
  return path;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';

    // Defensive check: if secrets are missing, return a useful error with CORS headers
    if (!env.ALLOWED_ORIGINS || !env.SUPABASE_JWT_SECRET || !env.R2_PUBLIC_URL) {
      const fallbackCors = { 'Access-Control-Allow-Origin': origin || '*' };
      return new Response('Worker misconfigured: missing secrets', { status: 500, headers: fallbackCors });
    }

    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // GET /object/* - Public CORS proxy for R2 objects (no auth required, bucket is already public)
    const requestUrl = new URL(request.url);
    if (request.method === 'GET' && requestUrl.pathname.startsWith('/object/')) {
      const objectPath = requestUrl.pathname.slice('/object/'.length);
      const safePath = sanitizePath(objectPath);
      const corsForGet = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
      if (!safePath) return new Response('Invalid path', { status: 400, headers: corsForGet });

      const object = await env.R2_BUCKET.get(safePath);
      if (!object) return new Response('Not found', { status: 404, headers: corsForGet });

      return new Response(object.body, {
        headers: {
          'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=2592000',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Auth
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || !(await verifySupabaseJwt(token, env.SUPABASE_JWT_SECRET))) {
      return new Response('Unauthorized', { status: 401, headers: cors });
    }

    const url = new URL(request.url);

    // POST /upload
    if (request.method === 'POST' && url.pathname === '/upload') {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const path = formData.get('path') as string | null;

      if (!file || !path) return new Response('Missing file or path', { status: 400, headers: cors });
      if (!ALLOWED_MIME_TYPES.has(file.type)) return new Response('Invalid file type', { status: 400, headers: cors });
      if (file.size > 10 * 1024 * 1024) return new Response('File too large', { status: 413, headers: cors });

      const safePath = sanitizePath(path);
      if (!safePath) return new Response('Invalid path', { status: 400, headers: cors });

      await env.R2_BUCKET.put(safePath, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=2592000' },
      });

      const publicUrl = `${env.R2_PUBLIC_URL}/${safePath}`;
      return Response.json({ url: publicUrl }, { headers: cors });
    }

    // DELETE /delete
    if (request.method === 'DELETE' && url.pathname === '/delete') {
      const { path } = await request.json() as { path?: string };
      const safePath = path ? sanitizePath(path) : null;
      if (!safePath) return new Response('Invalid path', { status: 400, headers: cors });

      await env.R2_BUCKET.delete(safePath);
      return Response.json({ success: true }, { headers: cors });
    }

    return new Response('Not found', { status: 404, headers: cors });
  }
};
