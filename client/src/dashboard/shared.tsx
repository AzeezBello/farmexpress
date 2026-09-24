import { useState, type FormEvent } from 'react';
import { ShieldAlert, ShieldCheck, ShieldX, Star } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { KycStatus, Order, OrderStatus, User } from '../lib/types';
import { Button, ErrorText, Field, Modal, TextArea } from '../components/ui';
import { PageTitle } from './Layout';

export const setOrderStatus = (id: string, status: OrderStatus) => api<Order>(`/orders/${id}/status`, { method: 'PUT', json: { status } });

export function KycBanner({ status, role }: { status: KycStatus; role: User['role'] }) {
  if (status === 'APPROVED') return null;
  const rejected = status === 'REJECTED';
  const what = role === 'FARMER' ? 'list products on the marketplace' : 'unlock business features';
  return <div className={`mb-6 flex gap-3 rounded-2xl p-4 text-sm ${rejected ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
    {rejected ? <ShieldX className="shrink-0" size={20} /> : <ShieldAlert className="shrink-0" size={20} />}
    <p>{rejected ? `Your verification was not approved, so you can't ${what} yet. Update your profile details and contact support to be reviewed again.` : `Your account is awaiting verification. Once approved you can ${what}.`}</p>
  </div>;
}

export function ProfilePanel({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, businessName: user.businessName ?? '', farmLocation: user.farmLocation ?? '' });
  const [msg, setMsg] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMsg('');
    try { setUser(await api<User>('/auth/me', { method: 'PATCH', json: form })); setMsg('Profile saved'); } catch (err) { setError(err instanceof Error ? err.message : 'Could not save'); } finally { setBusy(false); }
  }
  const KycIcon = user.kycStatus === 'APPROVED' ? ShieldCheck : user.kycStatus === 'REJECTED' ? ShieldX : ShieldAlert;
  return <>
    <PageTitle title="Profile" text={user.email} />
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <form onSubmit={save} className="space-y-4 rounded-2xl border bg-white p-5">
        <Field label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
        {user.role !== 'BUYER' && <Field label={user.role === 'FARMER' ? 'Farm name' : 'Company name'} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />}
        {user.role === 'FARMER' && <Field label="Farm location" value={form.farmLocation} onChange={(e) => setForm({ ...form, farmLocation: e.target.value })} />}
        <ErrorText>{error}</ErrorText>{msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
        <Button type="submit" busy={busy}>Save changes</Button>
      </form>
      {user.role !== 'BUYER' && <section className="self-start rounded-2xl bg-green-950 p-6 text-white">
        <KycIcon className="text-lime-300" />
        <h2 className="mt-4 text-lg font-black">Verification: {user.kycStatus.toLowerCase()}</h2>
        <p className="mt-2 text-sm leading-6 text-green-100">{user.kycStatus === 'APPROVED' ? 'Your account is verified. Buyers see a verified badge on your listings.' : 'Our team reviews new farm and business accounts. Document upload is coming in the next release.'}</p>
      </section>}
    </div>
  </>;
}

export function ReviewModal({ productName, productId, onClose, onDone }: { productName: string; productId: string; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5); const [comment, setComment] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/reviews', { method: 'POST', json: { productId, rating, comment } }); onDone(); } catch (err) { setError(err instanceof Error ? err.message : 'Could not submit review'); } finally { setBusy(false); }
  }
  return <Modal eyebrow="Review" title={productName} onClose={onClose}>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) =>
        <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)}><Star size={30} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'} /></button>)}</div>
      <TextArea label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="How was the quality and freshness?" />
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} className="w-full">Submit review</Button>
    </form>
  </Modal>;
}
