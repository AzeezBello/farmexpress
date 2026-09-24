import type { ReactNode } from 'react';
import { LogOut, Sprout, Store } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { navigate } from '../lib/hooks';
import type { User } from '../lib/types';

export type Tab = { id: string; label: string; icon: ReactNode; badge?: number };
const ROLE_LABEL = { BUYER: 'Buyer', FARMER: 'Farmer', INDUSTRY: 'Business', ADMIN: 'Admin' } as const;

export default function Layout({ user, tabs, tab, children }: { user: User; tabs: Tab[]; tab: string; children: ReactNode }) {
  const { logout } = useAuth();
  const active = tabs.find((t) => t.id === tab) ?? tabs[0];
  const link = (t: Tab, mobile = false) => <button key={t.id} onClick={() => navigate(`/dashboard/${t.id}`)} aria-current={t.id === active.id ? 'page' : undefined}
    className={mobile ? `flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${t.id === active.id ? 'bg-green-700 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`
      : `mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${t.id === active.id ? 'bg-green-50 text-green-700' : 'text-slate-500 hover:bg-slate-50'}`}>
    {!mobile && t.icon}<span className="flex-1 text-left">{t.label}</span>{!!t.badge && <span className="rounded-full bg-orange-500 px-2 text-xs font-bold text-white">{t.badge}</span>}
  </button>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-white"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
      <button onClick={() => navigate('')} className="flex items-center gap-2 font-black text-green-900"><span className="grid h-9 w-9 place-items-center rounded-xl bg-green-700 text-white"><Sprout size={19} /></span>FarmExpress</button>
      <div className="flex items-center gap-2">
        <span className="hidden rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 sm:block">{ROLE_LABEL[user.role]} · {user.name}</span>
        <button onClick={() => navigate('')} aria-label="Back to marketplace" className="rounded-xl border p-2"><Store size={18} /></button>
        <button onClick={() => { logout(); navigate(''); }} aria-label="Sign out" className="rounded-xl border p-2"><LogOut size={18} /></button>
      </div>
    </div></header>
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] lg:py-8">
      <aside className="hidden self-start rounded-2xl border bg-white p-3 lg:block">{tabs.map((t) => link(t))}</aside>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">{tabs.map((t) => link(t, true))}</div>
      <main className="min-w-0">{children}</main>
    </div>
  </div>;
}

export const PageTitle = ({ title, text, action }: { title: string; text?: string; action?: ReactNode }) =>
  <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-black sm:text-3xl">{title}</h1>{text && <p className="mt-1 text-slate-500">{text}</p>}</div>{action}</div>;

export const Stat = ({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) =>
  <div className="rounded-2xl border bg-white p-5"><span className="text-sm text-slate-500">{label}</span><b className="mt-2 block text-2xl font-black">{value}</b>{hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}</div>;
