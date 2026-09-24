import { MapPin, Plus, ShieldCheck, Star } from 'lucide-react';
import { naira } from '../lib/format';
import type { Product } from '../lib/types';

export const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=900&q=80';

export default function ProductCard({ p, inCart, onAdd }: { p: Product; inCart: number; onAdd: () => void }) {
  const verified = p.farmer?.kycStatus === 'APPROVED';
  const soldOut = inCart >= p.quantity;
  return <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
    <div className="relative overflow-hidden">
      <img src={p.imageUrl || FALLBACK_IMAGE} alt={p.name} loading="lazy" className="h-56 w-full object-cover transition duration-500 group-hover:scale-105" />
      <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-green-700 shadow-sm">{p.category}</span>
      {verified && <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-green-900/90 px-2.5 py-1 text-xs font-bold text-white"><ShieldCheck size={13} /> Verified farm</span>}
    </div>
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold">{p.name}</h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={13} />{p.location || p.farmer?.farmLocation || p.farmer?.name}</div>
        </div>
        {p.rating != null && <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold"><Star size={15} className="fill-amber-400 text-amber-400" />{p.rating}<span className="font-normal text-slate-400">({p.reviewCount})</span></span>}
      </div>
      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">{p.description}</p>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div><span className="block text-xs text-slate-400">Per unit</span><strong className="text-xl">{naira(p.price)}</strong></div>
        <button onClick={onAdd} disabled={soldOut} className="flex items-center gap-1.5 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={17} /> {soldOut ? 'Max in cart' : inCart ? `Add (${inCart})` : 'Add'}</button>
      </div>
      <div className="mt-3 text-xs text-slate-400">{p.quantity} units available · {p.farmer?.name}</div>
    </div>
  </article>;
}
