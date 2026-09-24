import { useState, type FormEvent } from 'react';
import { MapPin, Truck } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { navigate } from '../lib/hooks';
import { flash, payForOrder } from '../lib/payments';
import type { CartLine } from '../lib/cart';
import { naira } from '../lib/format';
import type { Order } from '../lib/types';
import { Button, ErrorText, Modal, Spinner, TextArea } from './ui';

export default function CheckoutModal({ lines, total, onClose, onPlaced }: { lines: CartLine[]; total: number; onClose: () => void; onPlaced: (o: Order) => void }) {
  const [deliveryOption, setOption] = useState<'DELIVERY' | 'PICKUP'>('DELIVERY');
  const [deliveryAddress, setAddress] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const order = await api<Order>('/orders', { method: 'POST', json: { deliveryOption, deliveryAddress: deliveryOption === 'DELIVERY' ? deliveryAddress : undefined, items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })) } });
      onPlaced(order);
      setRedirecting(true);
      try { await payForOrder(order.id); }
      catch (err) {
        // The order exists and stock is reserved either way; payment can be retried from the orders page.
        flash.set(err instanceof ApiError && err.status === 503 ? 'Order placed! Our team will contact you with payment details.' : `Order placed, but payment couldn't start: ${err instanceof Error ? err.message : 'unknown error'}. Tap “Pay now” to retry.`);
        navigate('/dashboard/orders');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not place order'); } finally { setBusy(false); }
  }

  if (redirecting) return <Modal eyebrow="Checkout" title="Taking you to payment" onClose={() => navigate('/dashboard/orders')}>
    <Spinner /><p className="text-center text-sm text-slate-500">Redirecting to Paystack’s secure checkout…</p>
  </Modal>;

  const option = (value: typeof deliveryOption, icon: React.ReactNode, title: string, text: string) =>
    <button type="button" onClick={() => setOption(value)} aria-pressed={deliveryOption === value} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${deliveryOption === value ? 'border-green-700 bg-green-50' : 'hover:bg-slate-50'}`}>
      <span className="text-green-700">{icon}</span><span><b className="block text-sm">{title}</b><span className="text-xs text-slate-500">{text}</span></span>
    </button>;

  return <Modal eyebrow="Checkout" title="Confirm your order" onClose={onClose} wide>
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">{option('DELIVERY', <Truck size={20} />, 'Home delivery', 'We deliver to your address')}{option('PICKUP', <MapPin size={20} />, 'Pickup hub', 'Collect from the nearest hub')}</div>
      {deliveryOption === 'DELIVERY' && <TextArea label="Delivery address" value={deliveryAddress} onChange={(e) => setAddress(e.target.value)} required maxLength={500} placeholder="Street, city, state and a phone number for the rider" />}
      <div className="rounded-2xl bg-slate-50 p-4">
        {lines.map((l) => <div key={l.product.id} className="flex justify-between py-1 text-sm"><span>{l.qty} × {l.product.name}</span><span>{naira(Number(l.product.price) * l.qty)}</span></div>)}
        <div className="mt-2 flex justify-between border-t pt-3"><b>Total</b><b className="text-lg">{naira(total)}</b></div>
      </div>
      <p className="text-xs text-slate-500">Stock is reserved as soon as you place the order. You’ll pay securely with card, bank transfer or USSD via Paystack.</p>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} className="w-full py-3.5 text-base">Place order & pay · {naira(total)}</Button>
    </form>
  </Modal>;
}
