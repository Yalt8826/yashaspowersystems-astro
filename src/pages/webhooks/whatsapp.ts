/**
 * WhatsApp Cloud API webhook endpoint — POST/GET /webhooks/whatsapp
 *
 * Meta requires two things from this endpoint:
 *
 *   GET  — one-off verification. Echo back `hub.challenge` (as plain text,
 *          status 200) *only* if `hub.verify_token` matches our stored secret.
 *          Anything else and Meta marks the endpoint unverified and never
 *          sends events.
 *
 *   POST — event delivery. Validate `X-Hub-Signature-256`, which is an
 *          HMAC-SHA256 of the **raw request body** keyed with the Meta App
 *          Secret. Then return 200 FAST.
 *
 * Two details that quietly break implementations:
 *
 *   1. The signature is computed over the raw bytes. Parsing to JSON and
 *      re-stringifying changes whitespace/key order and invalidates it —
 *      so we read `request.text()` once and use exactly that string.
 *   2. Meta retries failed deliveries for up to 7 days and does not expose
 *      historical webhooks. Anything not captured here is gone, so the
 *      payload must be persisted (see `persist()`).
 *
 * Secrets are Worker secrets, never in this repo:
 *   WHATSAPP_VERIFY_TOKEN  — a string you invent
 *   WHATSAPP_APP_SECRET    — Meta App Dashboard → App Settings → Basic
 */

export const prerender = false;

import type { APIRoute } from 'astro';

const encoder = new TextEncoder();

/**
 * Compare two strings without leaking their contents through response timing.
 * A plain `===` short-circuits on the first differing byte, which lets an
 * attacker recover a secret one character at a time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < ab.byteLength; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * HMAC-SHA256 the raw body with the app secret and compare to the header.
 * Uses WebCrypto, which is native to the Workers runtime.
 */
async function hasValidSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header) return false;

  const prefix = 'sha256=';
  if (!header.startsWith(prefix)) return false;
  const received = header.slice(prefix.length);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  return timingSafeEqual(toHex(digest), received);
}

/**
 * Persistence hook.
 *
 * NOT YET DURABLE — currently emits to Workers Logs (observability is enabled
 * in wrangler.json, so these are retained and searchable in the dashboard).
 *
 * To make it durable, create a KV namespace or D1 database, bind it in
 * wrangler.json, and write here. Keep it inside `waitUntil` so it never
 * delays the 200 that Meta is waiting for.
 */
async function persist(rawBody: string, summary: EventSummary): Promise<void> {
  console.log(
    JSON.stringify({
      evt: 'whatsapp.webhook',
      receivedAt: new Date().toISOString(),
      object: summary.object,
      fieldCount: summary.fieldCount,
      messageIds: summary.messageIds,
      statuses: summary.statusCount,
      bytes: encoder.encode(rawBody).byteLength,
    }),
  );
}

interface EventSummary {
  object: string | null;
  fieldCount: number;
  messageIds: string[];
  statusCount: number;
}

/**
 * Pull out just enough to log and de-duplicate on.
 *
 * Meta batches up to 1000 updates per POST and retries anything that fails,
 * so the same message id CAN legitimately arrive more than once. Dedupe on
 * `messageIds` once persistence is wired up.
 */
function summarise(payload: unknown): EventSummary {
  const summary: EventSummary = {
    object: null,
    fieldCount: 0,
    messageIds: [],
    statusCount: 0,
  };

  if (typeof payload !== 'object' || payload === null) return summary;
  const body = payload as Record<string, any>;
  summary.object = typeof body.object === 'string' ? body.object : null;

  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      summary.fieldCount++;
      const value = change?.value ?? {};

      for (const msg of Array.isArray(value.messages) ? value.messages : []) {
        if (msg?.id) summary.messageIds.push(String(msg.id));
      }
      for (const st of Array.isArray(value.statuses) ? value.statuses : []) {
        summary.statusCount++;
        if (st?.id) summary.messageIds.push(String(st.id));
      }
    }
  }
  return summary;
}

/* ── GET: verification handshake ─────────────────────────────────────────── */

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  const expected = locals.runtime?.env?.WHATSAPP_VERIFY_TOKEN;

  if (!expected) {
    console.error('[whatsapp] WHATSAPP_VERIFY_TOKEN is not configured');
    return new Response('Server misconfiguration', { status: 500 });
  }

  const ok =
    mode === 'subscribe' &&
    typeof token === 'string' &&
    timingSafeEqual(token, expected);

  if (!ok) {
    console.warn('[whatsapp] verification rejected — token mismatch');
    return new Response('Forbidden', { status: 403 });
  }

  // Meta requires the challenge echoed back verbatim as plain text.
  return new Response(challenge ?? '', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};

/* ── POST: event delivery ────────────────────────────────────────────────── */

export const POST: APIRoute = async ({ request, locals }) => {
  // Read the body ONCE, as text. See the note at the top of this file.
  const rawBody = await request.text();

  const appSecret = locals.runtime?.env?.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[whatsapp] WHATSAPP_APP_SECRET is not configured');
    return new Response('Server misconfiguration', { status: 500 });
  }

  const signature = request.headers.get('x-hub-signature-256');
  if (!(await hasValidSignature(rawBody, signature, appSecret))) {
    console.warn('[whatsapp] rejected POST — invalid X-Hub-Signature-256');
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    console.warn('[whatsapp] rejected POST — body is not valid JSON');
    return new Response('Malformed payload', { status: 400 });
  }

  const summary = summarise(payload);

  // Acknowledge immediately; do the slow work after the response is sent.
  // Meta retries anything it does not see a prompt 200 for.
  locals.runtime?.ctx?.waitUntil(persist(rawBody, summary));

  return new Response('EVENT_RECEIVED', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
