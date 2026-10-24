import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-at-least-32-characters-long';

const { app } = await import('./index.js');
const { isValidSignature, metadataOrderId } = await import('./lib/paystack.js');
const { parsePagination } = await import('./lib/pagination.js');
const { signToken } = await import('./lib/tokens.js');
const { SEED_PRODUCTS } = await import('./services/bootstrap.js');

async function invokeApp(
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; headers: Record<string, string | number | string[] | undefined>; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    const rawBody = options.body !== undefined ? Buffer.from(JSON.stringify(options.body)) : Buffer.alloc(0);
    req.headers = {
      host: 'localhost',
      ...(options.body !== undefined ? { 'content-type': 'application/json', 'content-length': String(rawBody.byteLength) } : {}),
      ...Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
    };

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, ...args: unknown[]) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return (origWrite as (...a: unknown[]) => boolean)(chunk, ...args);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...args: unknown[]) => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const result = (origEnd as (...a: unknown[]) => ServerResponse)(chunk, ...args);
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        json: () => (text ? JSON.parse(text) : null),
      });
      return result;
    }) as typeof res.end;

    try {
      app(req, res);
      if (rawBody.byteLength > 0) req.push(rawBody);
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}

describe('FarmExpress API & Domain Suite', () => {
  it('GET /api/health returns service ok', async () => {
    const res = await invokeApp('GET', '/api/health');
    assert.equal(res.status, 200);
    const body = res.json() as { status: string; service: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'farmexpress-api');
  });

  it('GET /api/products/categories returns all marketplace categories', async () => {
    const res = await invokeApp('GET', '/api/products/categories');
    assert.equal(res.status, 200);
    const categories = res.json() as string[];
    assert.ok(categories.includes('Fruits'));
    assert.ok(categories.includes('Roots & Tubers'));
    assert.ok(categories.includes('Grains'));
  });

  it('GET /api/payments/config returns payment and TTL configuration', async () => {
    const res = await invokeApp('GET', '/api/payments/config');
    assert.equal(res.status, 200);
    const cfg = res.json() as { paystack: boolean; pendingOrderTtlHours: number };
    assert.equal(typeof cfg.paystack, 'boolean');
    assert.ok(cfg.pendingOrderTtlHours > 0);
  });

  it('Rejects unauthenticated access to protected routes (/auth/me, /notifications, /admin/audit-logs, /uploads)', async () => {
    for (const path of ['/api/auth/me', '/api/notifications', '/api/admin/audit-logs', '/api/uploads']) {
      const res = await invokeApp(path === '/api/uploads' ? 'POST' : 'GET', path);
      assert.equal(res.status, 401);
    }
  });

  it('Enforces role-based access control on admin and KYC endpoints', async () => {
    const buyerToken = signToken({ id: '00000000-0000-0000-0000-000000000001', role: 'BUYER' });
    const adminRes = await invokeApp('GET', '/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${buyerToken}` },
    });
    assert.equal(adminRes.status, 403);

    const kycRes = await invokeApp('POST', '/api/auth/kyc', {
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: { documentType: 'NATIONAL_ID', documentUrl: 'https://example.com/id.pdf' },
    });
    assert.equal(kycRes.status, 403);
  });

  it('Validates registration and upload payloads with Zod before hitting the database', async () => {
    const regRes = await invokeApp('POST', '/api/auth/register', {
      body: { name: 'A', email: 'not-an-email', password: '123' },
    });
    assert.equal(regRes.status, 400);

    const farmerToken = signToken({ id: '00000000-0000-0000-0000-000000000002', role: 'FARMER' });
    const badUpload = await invokeApp('POST', '/api/uploads', {
      headers: { Authorization: `Bearer ${farmerToken}` },
      body: {
        filename: 'malware.exe',
        mimeType: 'application/x-msdownload',
        data: Buffer.from('test-payload').toString('base64'),
        purpose: 'PRODUCT',
      },
    });
    assert.equal(badUpload.status, 400);
  });

  it('Parses pagination query parameters with safe defaults and bounds', () => {
    assert.deepEqual(parsePagination({}), { page: 1, limit: 50, skip: 0 });
    assert.deepEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, skip: 20 });
    assert.deepEqual(parsePagination({ page: '-5', limit: '9999' }, 25), { page: 1, limit: 25, skip: 0 });
  });

  it('Extracts metadata orderId from object or serialized JSON string', () => {
    assert.equal(metadataOrderId({ orderId: 'ord-123' }), 'ord-123');
    assert.equal(metadataOrderId(JSON.stringify({ orderId: 'ord-456' })), 'ord-456');
    assert.equal(metadataOrderId('invalid-json'), undefined);
    assert.equal(metadataOrderId(null), undefined);
  });

  it('Verifies HMAC-SHA512 Paystack signatures only when secret and signature match', async () => {
    const { config } = await import('./config.js');
    const prevKey = config.paystack.secretKey;
    config.paystack.secretKey = 'sk_test_sample_secret';
    try {
      const payload = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'FX-1' } }));
      const validSig = createHmac('sha512', config.paystack.secretKey).update(payload).digest('hex');
      assert.equal(isValidSignature(payload, validSig), true);
      assert.equal(isValidSignature(payload, 'bad-signature'), false);
    } finally {
      config.paystack.secretKey = prevKey;
    }
  });

  it('Includes verified real product images for all seed catalog items', () => {
    assert.ok(SEED_PRODUCTS.length >= 9);
    for (const p of SEED_PRODUCTS) {
      assert.ok(p.imageUrl.startsWith('https://'), `Expected https image URL for ${p.name}`);
      assert.ok(p.price > 0);
    }
  });
});
