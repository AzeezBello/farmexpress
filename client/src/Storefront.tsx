import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, LayoutDashboard, Menu, Search, ShieldCheck, ShoppingCart, Sprout, Truck } from 'lucide-react';
import AuthModal from './components/AuthModal';
import CartDrawer from './components/CartDrawer';
import CheckoutModal from './components/CheckoutModal';
import ProductCard from './components/ProductCard';
import Toast from './components/Toast';
import { api } from './lib/api';
import { useAuth } from './lib/auth';
import { useCart } from './lib/cart';
import { CATEGORIES, isUuid } from './lib/format';
import { navigate, useDebounced, useToast } from './lib/hooks';
import type { Product, User } from './lib/types';

const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;
const demoProducts: Product[] = [
  { id: 'demo-1', name: 'Fresh Plantain', description: 'Freshly harvested ripe and unripe plantain from a verified farm.', price: 6500, quantity: 80, category: 'Fruits', imageUrl: img('photo-1603833665858-e61d17a86224'), location: 'Ogun State', farmer: { name: 'Green Valley Farm', kycStatus: 'APPROVED' } },
  { id: 'demo-2', name: 'Premium Cassava', description: 'Quality cassava roots suitable for household and processing use.', price: 8500, quantity: 120, category: 'Roots & Tubers', imageUrl: img('photo-1603048297172-c92544798d5a'), location: 'Oyo State', farmer: { name: 'Oyo Harvest Co-op', kycStatus: 'APPROVED' } },
  { id: 'demo-3', name: 'Yellow Maize', description: 'Clean, carefully dried yellow maize supplied directly by farmers.', price: 12000, quantity: 60, category: 'Grains', imageUrl: img('photo-1551754655-cd27e38d2076'), location: 'Kaduna State', farmer: { name: 'Northern Grain Farm', kycStatus: 'APPROVED' } },
  { id: 'demo-4', name: 'Fresh Tomatoes', description: 'Farm-fresh tomatoes packed for local and diaspora orders.', price: 9500, quantity: 45, category: 'Vegetables', imageUrl: img('photo-1546094096-0df4bcaaa337'), location: 'Kano State', farmer: { name: 'Sunrise Farms', kycStatus: 'APPROVED' } },
  { id: 'demo-5', name: 'Dried Pepper', description: 'Aromatic dried pepper sourced from smallholder farmers.', price: 7200, quantity: 90, category: 'Spices', imageUrl: img('photo-1583663848850-46af132dc08a'), location: 'Kaduna State', farmer: { name: 'Northern Grain Farm', kycStatus: 'APPROVED' } },
  { id: 'demo-6', name: 'Cocoa Beans', description: 'Quality Nigerian cocoa beans available for bulk and industry orders.', price: 28000, quantity: 35, category: 'Grains', imageUrl: img('photo-1511381939415-e44015466834'), location: 'Ondo State', farmer: { name: 'Ondo Cocoa Collective', kycStatus: 'APPROVED' } },
];

type AuthPrompt = { role?: 'BUYER' | 'FARMER' | 'INDUSTRY'; mode?: 'login' | 'register'; reason?: string; then?: 'checkout' | 'dashboard' };

export default function Storefront({ promptSignIn }: { promptSignIn: boolean }) {
  const { user, logout } = useAuth();
  const cart = useCart();
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const debouncedSearch = useDebounced(search.trim());
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [auth, setAuth] = useState<AuthPrompt | null>(promptSignIn ? { mode: 'login', reason: 'Sign in to open your dashboard.', then: 'dashboard' } : null);
  const [toast, showToast] = useToast();

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams({ ...(debouncedSearch && { search: debouncedSearch }), ...(category && { category }) });
    api<Product[]>(`/products?${qs}`, { signal: ctrl.signal })
      .then((d) => { setProducts(d); setApiOnline(true); cart.sync(d, !debouncedSearch && !category); })
      .catch((e) => { if (e?.name !== 'AbortError') { setApiOnline(false); setProducts(demoProducts); } })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
    // cart.sync is stable in behaviour; re-running on every cart change would refetch needlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, category]);

  // The API filters server-side; demo mode filters locally.
  const visible = useMemo(() => apiOnline ? products : products.filter((p) => {
    const q = debouncedSearch.toLowerCase();
    return (!q || `${p.name} ${p.description} ${p.category}`.toLowerCase().includes(q)) && (!category || p.category === category);
  }), [products, apiOnline, debouncedSearch, category]);

  const canBuy = (u: User | null) => !!u && (u.role === 'BUYER' || u.role === 'INDUSTRY');
  function startCheckout(u: User | null = user) {
    setCartOpen(false);
    if (!apiOnline || cart.lines.some((l) => !isUuid(l.product.id))) return showToast('Demo products can’t be ordered — connect the API to check out');
    if (!u) return setAuth({ mode: 'login', reason: 'Sign in or create a buyer account to complete your order.', then: 'checkout' });
    if (!canBuy(u)) return showToast('Orders are placed from buyer or business accounts');
    setCheckoutOpen(true);
  }
  function onAuthed(u: User) {
    const then = auth?.then;
    setAuth(null);
    showToast(`Welcome, ${u.name.split(' ')[0]}`);
    if (then === 'checkout') startCheckout(u);
    // When sent here from a dashboard deep link the hash is already right; the shell re-renders into it.
    else if (then !== 'dashboard' && u.role !== 'BUYER') navigate('/dashboard');
  }
  const sell = () => user ? navigate('/dashboard') : setAuth({ role: 'FARMER', mode: 'register' });

  const accountButton = user
    ? <button onClick={() => navigate('/dashboard')} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:flex"><LayoutDashboard size={17} /> {user.name.split(' ')[0]}</button>
    : <button onClick={() => setAuth({ mode: 'login' })} className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:block">Sign in</button>;

  return <div className="min-h-screen bg-[#f7faf6] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button className="flex items-center gap-2" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}><span className="grid h-9 w-9 place-items-center rounded-xl bg-green-700 text-white"><Sprout size={20} /></span><span className="text-xl font-black tracking-tight text-green-900">Farm<span className="text-orange-500">Express</span></span></button>
        <nav className="hidden items-center gap-7 md:flex"><a href="#marketplace" className="text-sm font-medium text-slate-600 hover:text-green-700">Marketplace</a><a href="#how" className="text-sm font-medium text-slate-600 hover:text-green-700">How it works</a><a href="#sell" className="text-sm font-medium text-slate-600 hover:text-green-700">Sell on FarmExpress</a></nav>
        <div className="flex items-center gap-2">
          {accountButton}
          <button aria-label={`Cart, ${cart.count} items`} onClick={() => setCartOpen(true)} className="relative rounded-xl border border-slate-200 p-2.5"><ShoppingCart size={19} />{cart.count > 0 && <span className="absolute -right-2 -top-2 min-w-5 rounded-full bg-orange-500 px-1.5 text-center text-xs font-bold text-white">{cart.count}</span>}</button>
          <button aria-label="Menu" aria-expanded={menu} className="rounded-xl border p-2 md:hidden" onClick={() => setMenu((v) => !v)}><Menu size={20} /></button>
        </div>
      </div>
      {menu && <div className="border-t bg-white p-4 md:hidden" onClick={() => setMenu(false)}>
        <a className="block rounded-lg p-3" href="#marketplace">Marketplace</a><a className="block rounded-lg p-3" href="#how">How it works</a><a className="block rounded-lg p-3" href="#sell">Sell on FarmExpress</a>
        {user ? <><button className="w-full rounded-lg p-3 text-left font-semibold" onClick={() => navigate('/dashboard')}>My dashboard</button><button className="w-full rounded-lg p-3 text-left text-slate-500" onClick={logout}>Sign out</button></>
          : <button className="w-full rounded-lg p-3 text-left font-semibold" onClick={() => setAuth({ mode: 'login' })}>Sign in</button>}
      </div>}
    </header>
    <main>
      <section className="overflow-hidden bg-green-950 text-white"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.05fr_.95fr] md:items-center lg:px-8 lg:py-20"><div><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-lime-400/30 bg-lime-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-lime-300"><ShieldCheck size={14} /> Trusted African marketplace</div><h1 className="max-w-3xl text-4xl font-black leading-[1.05] sm:text-5xl lg:text-6xl">Fresh from African farms. <span className="text-lime-300">Delivered with trust.</span></h1><p className="mt-5 max-w-2xl text-base leading-7 text-green-100 sm:text-lg">Buy quality produce directly from verified farmers, or grow your farm business by reaching diaspora families and industry buyers.</p><div className="mt-7 flex flex-wrap gap-3"><a href="#marketplace" className="rounded-xl bg-lime-300 px-5 py-3 font-bold text-green-950 hover:bg-lime-200">Shop fresh produce</a><button onClick={sell} className="rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-bold backdrop-blur hover:bg-white/15">Sell your produce</button></div><div className="mt-8 flex flex-wrap gap-6 text-sm text-green-100"><span>✓ Verified farmers</span><span>✓ Stock reserved at checkout</span><span>✓ Delivery & pickup</span></div></div><div className="relative"><img src="https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=85" alt="Farmland at sunrise" className="h-[330px] w-full rounded-[2rem] object-cover shadow-2xl ring-1 ring-white/10 sm:h-[430px]" /><div className="absolute -bottom-4 left-4 rounded-2xl bg-white p-4 text-slate-900 shadow-xl sm:left-6"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-green-100 text-green-700"><Truck size={20} /></div><div><b className="block text-sm">Flexible fulfillment</b><span className="text-xs text-slate-500">Delivery or pickup hubs</span></div></div></div></div></div></section>
      <section id="marketplace" className="mx-auto max-w-7xl scroll-mt-16 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-bold uppercase tracking-wider text-orange-600">Marketplace</p><h2 className="mt-1 text-3xl font-black tracking-tight">Fresh produce from verified farms</h2><p className="mt-2 text-slate-500">Shop by product, category, or farming region.</p></div>
          {apiOnline !== null && <div className="flex items-center gap-2 text-xs text-slate-500"><span className={`h-2 w-2 rounded-full ${apiOnline ? 'bg-green-500' : 'bg-amber-400'}`} />{apiOnline ? 'Live marketplace' : 'Demo marketplace — API offline'}</div>}</div>
        <div className="mb-8 grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm focus-within:border-green-600"><Search size={20} className="text-slate-400" /><input type="search" aria-label="Search produce" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plantain, cassava, maize..." className="w-full bg-transparent outline-none" /></label>
          <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-2xl border bg-white px-4 py-3 shadow-sm outline-none"><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className={`grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>{visible.map((p) => <ProductCard key={p.id} p={p} inCart={cart.cart[p.id]?.qty ?? 0} onAdd={() => { cart.add(p); showToast(`${p.name} added to cart`); }} />)}</div>
        {!loading && visible.length === 0 && <div className="rounded-3xl border border-dashed bg-white p-12 text-center"><h3 className="font-bold">No products found</h3><p className="mt-1 text-sm text-slate-500">Try a different search or category.</p></div>}
      </section>
      <section id="how" className="scroll-mt-16 border-y bg-white"><div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"><div className="text-center"><p className="text-sm font-bold uppercase tracking-wider text-orange-600">How it works</p><h2 className="mt-2 text-3xl font-black">From farm to your basket</h2></div><div className="mt-10 grid gap-5 md:grid-cols-3">{[['01', 'Browse', 'Discover fresh produce from verified African farmers.'], ['02', 'Order & pay', 'Choose quantities and delivery or pickup. Your stock is reserved instantly.'], ['03', 'Track & review', 'Follow your order status and review produce after delivery.']].map(([n, t, d]) => <div className="rounded-3xl border p-6" key={n}><span className="text-4xl font-black text-green-200">{n}</span><h3 className="mt-5 text-xl font-bold">{t}</h3><p className="mt-2 leading-6 text-slate-500">{d}</p></div>)}</div></div></section>
      <section id="sell" className="scroll-mt-16 bg-orange-50"><div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div><p className="text-sm font-bold uppercase tracking-wider text-orange-600">For farmers & businesses</p><h2 className="mt-2 text-3xl font-black">Turn your harvest into a bigger market.</h2><p className="mt-3 max-w-2xl text-slate-600">Create listings, manage inventory, receive orders and track sales from one simple dashboard.</p></div><button onClick={sell} className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-800 px-5 py-3 font-bold text-white">Start selling <ChevronRight size={18} /></button></div></section>
    </main>
    <footer className="bg-slate-950 text-slate-300"><div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8"><div className="flex items-center gap-2 font-bold text-white"><Sprout size={18} /> FarmExpress</div><p className="text-sm">Connecting African farms with global demand.</p><p className="text-xs text-slate-500">© {new Date().getFullYear()} FarmExpress</p></div></footer>
    {cartOpen && <CartDrawer lines={cart.lines} total={cart.total} onClose={() => setCartOpen(false)} onChange={cart.change} onCheckout={() => startCheckout()} />}
    {checkoutOpen && <CheckoutModal lines={cart.lines} total={cart.total} onClose={() => setCheckoutOpen(false)} onPlaced={() => cart.clear()} />}
    {auth && <AuthModal initialRole={auth.role} initialMode={auth.mode} reason={auth.reason} onClose={() => { setAuth(null); if (promptSignIn) navigate(''); }} onSuccess={onAuthed} />}
    <Toast message={toast} />
  </div>;
}
