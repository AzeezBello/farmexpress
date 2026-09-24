import { useEffect } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { CartLine } from '../lib/cart';
import { naira } from '../lib/format';
import { FALLBACK_IMAGE } from './ProductCard';

export default function CartDrawer({ lines, total, onClose, onChange, onCheckout }: { lines: CartLine[]; total: number; onClose: () => void; onChange: (id: string, d: number) => void; onCheckout: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  return <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose}>
    <aside aria-label="Cart" className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between p-5"><div><p className="text-xs font-bold uppercase tracking-wider text-orange-600">Basket</p><h2 className="text-2xl font-black">Your cart</h2></div><button aria-label="Close cart" className="rounded-xl border p-2" onClick={onClose}><X /></button></div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
        {lines.length === 0 ? <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">Your cart is empty.</div> : lines.map(({ product, qty }) =>
          <div className="flex gap-3 rounded-2xl border p-3" key={product.id}>
            <img src={product.imageUrl || FALLBACK_IMAGE} alt="" className="h-20 w-20 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <b className="block truncate">{product.name}</b>
              <span className="text-sm text-slate-500">{naira(product.price)} each</span>
              <div className="mt-2 flex items-center gap-2">
                <button aria-label={`Remove one ${product.name}`} className="rounded-lg border p-1" onClick={() => onChange(product.id, -1)}><Minus size={14} /></button>
                <span className="w-6 text-center text-sm font-bold">{qty}</span>
                <button aria-label={`Add one ${product.name}`} disabled={qty >= product.quantity} className="rounded-lg border p-1 disabled:opacity-40" onClick={() => onChange(product.id, 1)}><Plus size={14} /></button>
                {qty >= product.quantity && <span className="text-xs text-amber-600">Max stock</span>}
              </div>
            </div>
            <b className="text-sm">{naira(Number(product.price) * qty)}</b>
          </div>)}
      </div>
      <div className="border-t bg-white p-5">
        <div className="mb-4 flex justify-between"><span className="text-slate-500">Subtotal</span><b className="text-xl">{naira(total)}</b></div>
        <button disabled={!lines.length} onClick={onCheckout} className="w-full rounded-xl bg-green-700 py-3.5 font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">Proceed to checkout</button>
      </div>
    </aside>
  </div>;
}
