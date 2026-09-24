import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { CATEGORIES } from '../lib/format';
import type { Product } from '../lib/types';
import { Button, ErrorText, Field, Modal, Select, TextArea } from '../components/ui';

export default function ProductForm({ product, defaultLocation, onClose, onSaved }: { product?: Product; defaultLocation?: string | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? '', description: product?.description ?? '', price: product ? String(Number(product.price)) : '', quantity: product ? String(product.quantity) : '',
    category: product?.category ?? CATEGORIES[0], imageUrl: product?.imageUrl ?? '', location: product?.location ?? defaultLocation ?? '',
  });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await api(product ? `/products/${product.id}` : '/products', { method: product ? 'PUT' : 'POST', json: { ...form, price: Number(form.price), quantity: Number(form.quantity) } });
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save product'); } finally { setBusy(false); }
  }

  return <Modal eyebrow={product ? 'Edit listing' : 'New listing'} title={product ? product.name : 'Add a product'} onClose={onClose} wide>
    <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Product name" value={form.name} onChange={set('name')} required minLength={2} maxLength={120} /></div>
      <div className="sm:col-span-2"><TextArea label="Description" value={form.description} onChange={set('description')} required minLength={5} maxLength={2000} /></div>
      <Field label="Price per unit (₦)" type="number" inputMode="decimal" min="1" step="0.01" value={form.price} onChange={set('price')} required />
      <Field label="Units in stock" type="number" inputMode="numeric" min="0" step="1" value={form.quantity} onChange={set('quantity')} required />
      <Select label="Category" value={form.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
      <Field label="Location" value={form.location} onChange={set('location')} maxLength={120} />
      <div className="sm:col-span-2"><Field label="Image URL (optional)" type="url" value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" /></div>
      <div className="sm:col-span-2 space-y-3"><ErrorText>{error}</ErrorText><Button type="submit" busy={busy} className="w-full py-3">{product ? 'Save changes' : 'Publish listing'}</Button></div>
    </form>
  </Modal>;
}
