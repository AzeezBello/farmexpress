import { api } from './api';
import { storage } from './storage';

// Hands the browser to Paystack's hosted checkout. Resolves only if the redirect didn't happen.
export async function payForOrder(orderId: string) {
  const { authorizationUrl } = await api<{ authorizationUrl: string }>(`/payments/orders/${orderId}/initialize`, { method: 'POST' });
  window.location.assign(authorizationUrl);
  await new Promise(() => { /* page is navigating away */ });
}

export type VerifyResult = { status: string; outcome?: 'paid' | 'already-paid' | 'refund-due' };
export const verifyPayment = (reference: string) => api<VerifyResult>(`/payments/verify/${encodeURIComponent(reference)}`);

// One-shot message carried across a navigation or full page load (e.g. the Paystack round trip).
const FLASH_KEY = 'farmexpress_flash';
export const flash = {
  set: (message: string) => { try { sessionStorage.setItem(FLASH_KEY, message); } catch { storage.set(FLASH_KEY, message); } },
  take: () => {
    try { const m = sessionStorage.getItem(FLASH_KEY); sessionStorage.removeItem(FLASH_KEY); return m; }
    catch { const m = storage.get<string | null>(FLASH_KEY, null); storage.remove(FLASH_KEY); return m; }
  },
};
