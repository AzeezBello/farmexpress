import { useState, type FormEvent } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { api, resolveAssetUrl, uploadFile } from '../lib/api';
import { CATEGORIES } from '../lib/format';
import type { Product } from '../lib/types';
import { Button, ErrorText, Field, Modal, Select, TextArea } from '../components/ui';

export default function ProductForm({ product, defaultLocation, onClose, onSaved }: { product?: Product; defaultLocation?: string | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? String(Number(product.price)) : '',
    quantity: product ? String(product.quantity) : '',
    category: product?.category ?? CATEGORIES[0],
    imageUrl: product?.imageUrl ?? '',
    location: product?.location ?? defaultLocation ?? '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadFile(file, 'PRODUCT');
      setForm((f) => ({ ...f, imageUrl: uploaded.url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload image');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(product ? `/products/${product.id}` : '/products', {
        method: product ? 'PUT' : 'POST',
        json: { ...form, price: Number(form.price), quantity: Number(form.quantity) },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save product');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal eyebrow={product ? 'Edit listing' : 'New listing'} title={product ? product.name : 'Add a product'} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Product name" name="name" value={form.name} onChange={set('name')} required minLength={2} maxLength={120} />
        </div>
        <div className="sm:col-span-2">
          <TextArea label="Description" name="description" value={form.description} onChange={set('description')} required minLength={5} maxLength={2000} />
        </div>
        <Field label="Price per unit (₦)" name="price" type="number" inputMode="decimal" min="1" step="0.01" value={form.price} onChange={set('price')} required />
        <Field label="Units in stock" name="quantity" type="number" inputMode="numeric" min="0" step="1" value={form.quantity} onChange={set('quantity')} required />
        <Select label="Category" name="category" value={form.category} onChange={set('category')}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Field label="Location" name="location" value={form.location} onChange={set('location')} maxLength={120} />

        <div className="sm:col-span-2 space-y-2 rounded-2xl border bg-slate-50 p-4">
          <span className="block text-sm font-semibold text-slate-700">Product photo</span>
          <div className="flex flex-wrap items-center gap-3">
            {form.imageUrl && (
              <img src={resolveAssetUrl(form.imageUrl)} alt="Product preview" className="h-16 w-16 rounded-xl border bg-white object-cover" />
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              {uploading ? 'Uploading…' : 'Upload photo (JPG, PNG, WebP)'}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onFileSelected} disabled={uploading} className="sr-only" />
            </label>
            {form.imageUrl && (
              <button type="button" onClick={() => setForm((f) => ({ ...f, imageUrl: '' }))} className="text-xs font-semibold text-red-600 hover:underline">
                Remove photo
              </button>
            )}
          </div>
          <Field
            label="Or paste image URL (optional)"
            name="imageUrl"
            value={form.imageUrl}
            onChange={set('imageUrl')}
            placeholder="https://… or /api/uploads/…"
          />
        </div>

        <div className="sm:col-span-2 space-y-3">
          <ErrorText>{error}</ErrorText>
          <Button type="submit" busy={busy || uploading} className="w-full py-3">
            {product ? 'Save changes' : 'Publish listing'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
