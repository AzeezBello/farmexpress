import { useEffect, useState } from 'react';
import { storage } from './storage';
import type { Product } from './types';

// Lines keep a product snapshot so the cart still renders while search results change or the product list reloads.
export type CartLine = { product: Product; qty: number };
export type Cart = Record<string, CartLine>;
const KEY = 'farmexpress_cart_v2';

export function useCart() {
  const [cart, setCart] = useState<Cart>(() => {
    const saved = storage.get<Cart>(KEY, {});
    return Object.fromEntries(Object.entries(saved).filter(([, l]) => l && typeof l === 'object' && l.product && l.qty > 0));
  });
  useEffect(() => storage.set(KEY, cart), [cart]);

  const lines = Object.values(cart);
  return {
    cart, lines,
    count: lines.reduce((s, l) => s + l.qty, 0),
    total: lines.reduce((s, l) => s + Number(l.product.price) * l.qty, 0),
    add: (product: Product) => setCart((c) => ({ ...c, [product.id]: { product, qty: Math.min((c[product.id]?.qty ?? 0) + 1, product.quantity) } })),
    change: (id: string, delta: number) => setCart((c) => {
      const line = c[id]; if (!line) return c;
      const qty = Math.min(line.qty + delta, line.product.quantity);
      if (qty <= 0) { const { [id]: _removed, ...rest } = c; return rest; }
      return { ...c, [id]: { ...line, qty } };
    }),
    // Refresh snapshots with live prices/stock; drop lines for products that no longer exist when told to.
    sync: (fresh: Product[], pruneMissing: boolean) => setCart((c) => {
      const byId = new Map(fresh.map((p) => [p.id, p]));
      const next: Cart = {};
      for (const [id, line] of Object.entries(c)) {
        const p = byId.get(id);
        if (p) next[id] = { product: p, qty: Math.min(line.qty, p.quantity) };
        else if (!pruneMissing) next[id] = line;
      }
      return next;
    }),
    // Persist immediately: clear() is usually followed by navigation that unmounts the cart before the effect runs.
    clear: () => { storage.remove(KEY); setCart({}); },
  };
}
