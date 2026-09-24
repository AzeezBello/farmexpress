import { useState, type FormEvent } from 'react';
import { ShoppingBasket, Sprout, Factory } from 'lucide-react';
import { useAuth, type RegisterInput } from '../lib/auth';
import type { User } from '../lib/types';
import { Button, ErrorText, Field, Modal } from './ui';

type SignupRole = RegisterInput['role'];
const ROLES: { value: SignupRole; label: string; icon: React.ReactNode }[] = [
  { value: 'BUYER', label: 'Buyer', icon: <ShoppingBasket size={18} /> },
  { value: 'FARMER', label: 'Farmer', icon: <Sprout size={18} /> },
  { value: 'INDUSTRY', label: 'Business', icon: <Factory size={18} /> },
];

export default function AuthModal({ initialRole = 'BUYER', initialMode = 'register', reason, onClose, onSuccess }: {
  initialRole?: SignupRole; initialMode?: 'login' | 'register'; reason?: string; onClose: () => void; onSuccess: (u: User) => void;
}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState<SignupRole>(initialRole);
  const [form, setForm] = useState({ name: '', email: '', password: '', businessName: '', farmLocation: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const user = mode === 'login'
        ? await login(form.email, form.password)
        : await register({ role, name: form.name, email: form.email, password: form.password, businessName: form.businessName || undefined, farmLocation: role === 'FARMER' ? form.farmLocation : undefined });
      onSuccess(user);
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); } finally { setBusy(false); }
  }

  return <Modal eyebrow="FarmExpress account" title={mode === 'login' ? 'Welcome back' : 'Create your account'} onClose={onClose}>
    {reason && <p className="mt-3 text-sm text-slate-500">{reason}</p>}
    <form onSubmit={submit} className="mt-5 space-y-4">
      {mode === 'register' && <fieldset>
        <legend className="mb-1.5 text-sm font-semibold text-slate-700">I want to</legend>
        <div className="grid grid-cols-3 gap-2">{ROLES.map((r) =>
          <button type="button" key={r.value} onClick={() => setRole(r.value)} aria-pressed={r.value === role} className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition ${r.value === role ? 'border-green-700 bg-green-50 text-green-800' : 'text-slate-500 hover:bg-slate-50'}`}>{r.icon}{r.value === 'BUYER' ? 'Buy produce' : r.value === 'FARMER' ? 'Sell produce' : 'Buy in bulk'}</button>)}
        </div>
      </fieldset>}
      {mode === 'register' && <Field label="Full name" value={form.name} onChange={set('name')} autoComplete="name" required minLength={2} />}
      <Field label="Email address" type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
      <Field label="Password" type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} placeholder={mode === 'register' ? 'At least 8 characters' : undefined} />
      {mode === 'register' && role !== 'BUYER' && <Field label={role === 'FARMER' ? 'Farm name (optional)' : 'Company name'} value={form.businessName} onChange={set('businessName')} autoComplete="organization" required={role === 'INDUSTRY'} />}
      {mode === 'register' && role === 'FARMER' && <Field label="Farm location" value={form.farmLocation} onChange={set('farmLocation')} placeholder="e.g. Oyo, Nigeria" required />}
      {mode === 'register' && role !== 'BUYER' && <p className="text-xs text-slate-500">{role === 'FARMER' ? 'Farm accounts are verified by our team before products go live.' : 'Business accounts are verified before bulk pricing is unlocked.'}</p>}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" busy={busy} className="w-full py-3.5 text-base">{mode === 'login' ? 'Sign in' : 'Create account'}</Button>
    </form>
    <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }} className="mt-4 w-full text-center text-sm font-semibold text-green-700">{mode === 'login' ? 'New to FarmExpress? Create an account' : 'Already have an account? Sign in'}</button>
  </Modal>;
}
