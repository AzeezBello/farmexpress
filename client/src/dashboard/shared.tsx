import { useState, type FormEvent } from 'react';
import { ExternalLink, FileUp, Loader2, ShieldAlert, ShieldCheck, ShieldX, Star } from 'lucide-react';
import { api, resolveAssetUrl, uploadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { CARRIERS, KYC_DOC_LABELS, shortDate, shortId } from '../lib/format';
import type { KycDocType, KycStatus, Order, OrderStatus, User } from '../lib/types';
import { Button, ErrorText, Field, Modal, Select, TextArea } from '../components/ui';
import { PageTitle } from './Layout';

export type OrderStatusPayload = {
  status: OrderStatus;
  carrier?: string;
  trackingNumber?: string;
  trackingNote?: string;
  location?: string;
  estimatedDelivery?: string;
};

export const setOrderStatus = (id: string, status: OrderStatus, extra?: Omit<OrderStatusPayload, 'status'>) =>
  api<Order>(`/orders/${id}/status`, { method: 'PUT', json: { status, ...extra } });

export const updateOrderTracking = (id: string, tracking: Omit<OrderStatusPayload, 'status'>) =>
  api<Order>(`/orders/${id}/tracking`, { method: 'PATCH', json: tracking });

export function KycBanner({ status, role, note }: { status: KycStatus; role: User['role']; note?: string | null }) {
  if (status === 'APPROVED') return null;
  const rejected = status === 'REJECTED';
  const what = role === 'FARMER' ? 'list products on the marketplace' : 'unlock business features';
  return (
    <div className={`mb-6 flex gap-3 rounded-2xl p-4 text-sm ${rejected ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'}`}>
      {rejected ? <ShieldX className="shrink-0" size={20} /> : <ShieldAlert className="shrink-0" size={20} />}
      <div>
        <p>
          {rejected
            ? `Your verification was not approved, so you can't ${what} yet. Upload an updated KYC document under Profile & KYC to request another review.`
            : `Your account is awaiting verification. Upload your KYC document under Profile & KYC so our team can approve your account to ${what}.`}
        </p>
        {note && <p className="mt-1 font-semibold">Reviewer note: “{note}”</p>}
      </div>
    </div>
  );
}

export function ProfilePanel({ user }: { user: User }) {
  const { setUser } = useAuth();
  const [form, setForm] = useState({ name: user.name, businessName: user.businessName ?? '', farmLocation: user.farmLocation ?? '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [docType, setDocType] = useState<KycDocType>(user.kycDocumentType ?? (user.role === 'FARMER' ? 'FARM_PERMIT' : 'CAC_CERTIFICATE'));
  const [docUrl, setDocUrl] = useState(user.kycDocumentUrl ?? '');
  const [kycBusy, setKycBusy] = useState(false);
  const [kycUploading, setKycUploading] = useState(false);
  const [kycMsg, setKycMsg] = useState('');
  const [kycErr, setKycErr] = useState('');

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMsg('');
    try {
      setUser(await api<User>('/auth/me', { method: 'PATCH', json: form }));
      setMsg('Profile saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function onKycFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setKycErr('');
    setKycMsg('');
    setKycUploading(true);
    try {
      const uploaded = await uploadFile(file, 'KYC');
      setDocUrl(uploaded.url);
      setKycMsg(`Uploaded ${uploaded.filename} — click "Submit for verification" to send.`);
    } catch (err) {
      setKycErr(err instanceof Error ? err.message : 'Could not upload document');
    } finally {
      setKycUploading(false);
      e.target.value = '';
    }
  }

  async function submitKyc(e: FormEvent) {
    e.preventDefault();
    if (!docUrl.trim()) {
      setKycErr('Upload a verification document or provide a document URL first.');
      return;
    }
    setKycBusy(true);
    setKycErr('');
    setKycMsg('');
    try {
      const updated = await api<User>('/auth/kyc', {
        method: 'POST',
        json: { documentType: docType, documentUrl: docUrl.trim() },
      });
      setUser(updated);
      setKycMsg('Verification document submitted for review.');
    } catch (err) {
      setKycErr(err instanceof Error ? err.message : 'Could not submit KYC document');
    } finally {
      setKycBusy(false);
    }
  }

  const KycIcon = user.kycStatus === 'APPROVED' ? ShieldCheck : user.kycStatus === 'REJECTED' ? ShieldX : ShieldAlert;

  return (
    <>
      <PageTitle title="Profile & verification" text={user.email} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <form onSubmit={save} className="space-y-4 self-start rounded-2xl border bg-white p-5">
          <h2 className="text-lg font-bold">Account details</h2>
          <Field label="Full name" name="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          {user.role !== 'BUYER' && (
            <Field
              label={user.role === 'FARMER' ? 'Farm name' : 'Company name'}
              name="businessName"
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
            />
          )}
          {user.role === 'FARMER' && (
            <Field label="Farm location" name="farmLocation" value={form.farmLocation} onChange={(e) => setForm({ ...form, farmLocation: e.target.value })} />
          )}
          <ErrorText>{error}</ErrorText>
          {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
          <Button type="submit" busy={busy}>
            Save changes
          </Button>
        </form>

        {user.role !== 'BUYER' && (
          <section className="self-start space-y-4 rounded-2xl bg-green-950 p-6 text-white">
            <div className="flex items-center justify-between">
              <KycIcon className="text-lime-300" />
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-lime-300">
                {user.kycStatus.toLowerCase()}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-black">KYC verification</h2>
              <p className="mt-1 text-sm leading-6 text-green-100">
                {user.kycStatus === 'APPROVED'
                  ? 'Your account is verified. Buyers see a verified badge on your listings.'
                  : 'Upload an official registration or identity document so our compliance team can verify your account.'}
              </p>
              {user.kycNote && (
                <p className="mt-2 rounded-xl bg-red-500/20 p-3 text-xs text-red-100">
                  <b>Admin note:</b> {user.kycNote}
                </p>
              )}
              {user.kycSubmittedAt && (
                <p className="mt-2 text-xs text-green-200">
                  Last submitted: {shortDate(user.kycSubmittedAt)}
                  {user.kycDocumentType ? ` (${KYC_DOC_LABELS[user.kycDocumentType] ?? user.kycDocumentType})` : ''}
                </p>
              )}
              {user.kycDocumentUrl && (
                <a
                  href={resolveAssetUrl(user.kycDocumentUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-lime-300 underline"
                >
                  View submitted document <ExternalLink size={13} />
                </a>
              )}
            </div>

            <form onSubmit={submitKyc} className="space-y-3 border-t border-white/15 pt-4 text-slate-900">
              <Select label="Document type" value={docType} onChange={(e) => setDocType(e.target.value as KycDocType)}>
                {(Object.keys(KYC_DOC_LABELS) as KycDocType[]).map((k) => (
                  <option key={k} value={k}>
                    {KYC_DOC_LABELS[k]}
                  </option>
                ))}
              </Select>

              <div className="rounded-xl bg-white/95 p-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100">
                  {kycUploading ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                  {kycUploading ? 'Uploading…' : 'Choose file (PDF, JPG, PNG)'}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    onChange={onKycFileChange}
                    disabled={kycUploading}
                    className="sr-only"
                  />
                </label>
                {docUrl && <p className="mt-2 truncate text-xs text-slate-500">Selected: {docUrl}</p>}
              </div>

              {kycErr && <p role="alert" className="rounded-xl bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-100">{kycErr}</p>}
              {kycMsg && <p className="rounded-xl bg-lime-400/20 px-3 py-2 text-xs font-semibold text-lime-200">{kycMsg}</p>}

              <Button type="submit" busy={kycBusy || kycUploading} className="w-full bg-lime-300 text-green-950 hover:bg-lime-200">
                {user.kycDocumentUrl ? 'Update verification document' : 'Submit for verification'}
              </Button>
            </form>
          </section>
        )}
      </div>
    </>
  );
}

export function DispatchModal({
  order,
  mode,
  onClose,
  onSaved,
}: {
  order: Order;
  mode: 'dispatch' | 'update';
  onClose: () => void;
  onSaved: (updated: Order) => void;
}) {
  const [carrier, setCarrier] = useState(order.carrier || CARRIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState(order.trackingNumber || '');
  const [estimatedDelivery, setEstimatedDelivery] = useState(order.estimatedDelivery ? order.estimatedDelivery.slice(0, 10) : '');
  const [location, setLocation] = useState('');
  const [trackingNote, setTrackingNote] = useState(order.trackingNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        carrier: carrier.trim() || undefined,
        trackingNumber: trackingNumber.trim() || undefined,
        estimatedDelivery: estimatedDelivery || undefined,
        location: location.trim() || undefined,
        trackingNote: trackingNote.trim() || undefined,
      };
      const updated =
        mode === 'dispatch'
          ? await setOrderStatus(order.id, 'SHIPPED', payload)
          : await updateOrderTracking(order.id, payload);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update delivery tracking');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal eyebrow={shortId(order.id)} title={mode === 'dispatch' ? 'Dispatch order' : 'Update delivery tracking'} onClose={onClose}>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Select label="Logistics carrier / rider" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Field
          label="Tracking number or rider phone"
          name="trackingNumber"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
          placeholder="e.g. FX-TRK-90210 or +234 803..."
          maxLength={80}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Estimated delivery date"
            name="estimatedDelivery"
            type="date"
            value={estimatedDelivery}
            onChange={(e) => setEstimatedDelivery(e.target.value)}
          />
          <Field
            label="Current hub / location"
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Ibadan Dispatch Hub"
            maxLength={120}
          />
        </div>
        <TextArea
          label="Delivery note for buyer (optional)"
          name="trackingNote"
          value={trackingNote}
          onChange={(e) => setTrackingNote(e.target.value)}
          placeholder="Rider contact details or pickup instructions"
          maxLength={400}
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" busy={busy} className="w-full">
          {mode === 'dispatch' ? 'Confirm dispatch & notify buyer' : 'Save tracking update'}
        </Button>
      </form>
    </Modal>
  );
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
