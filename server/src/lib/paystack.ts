import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from './http.js';

export type PaystackTransaction = {
  id: number; status: string; reference: string; amount: number; currency: string;
  channel?: string; paid_at?: string | null; metadata?: unknown;
};

export const paystackEnabled = () => !!config.paystack.secretKey;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.paystack.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${config.paystack.secretKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, 'Payment provider is unreachable. Please try again.');
  }
  const body = await res.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null;
  if (!res.ok || !body?.status) throw new HttpError(502, body?.message ? `Payment provider: ${body.message}` : 'Payment provider error');
  return body.data as T;
}

export const initializeTransaction = (p: { email: string; amountKobo: number; reference: string; callbackUrl: string; metadata: Record<string, unknown> }) =>
  call<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({ email: p.email, amount: p.amountKobo, currency: 'NGN', reference: p.reference, callback_url: p.callbackUrl, metadata: p.metadata }),
  });

export const verifyTransaction = (reference: string) => call<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);

// Paystack signs the raw request body with HMAC-SHA512 using the secret key.
export function isValidSignature(rawBody: Buffer | undefined, signature: string | undefined) {
  if (!rawBody || !signature || !config.paystack.secretKey) return false;
  const expected = Buffer.from(createHmac('sha512', config.paystack.secretKey).update(rawBody).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

// metadata may arrive as an object, a JSON string, or an empty string.
export function metadataOrderId(metadata: unknown): string | undefined {
  let m = metadata;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return undefined; } }
  const id = m && typeof m === 'object' && 'orderId' in m ? (m as { orderId: unknown }).orderId : undefined;
  return typeof id === 'string' ? id : undefined;
}
