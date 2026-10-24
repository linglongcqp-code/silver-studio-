import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../src/server.js';

const originalFetch = globalThis.fetch;
const origin = 'https://silver.example';
const key = 'test-only-secret-do-not-leak';
const image = 'data:image/png;base64,aGVsbG8=';
const valid = { prompt: '展示参考产品的完整外观，保持所有细节。', images: [image], ratio: '1:1', quality: 'medium' };
const env = { OPENAI_API_KEY: key };

afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.assets; });

function request(body = valid, headers = {}, method = 'POST') {
  return new Request(`${origin}/api/generate`, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...headers }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}

test('status safely describes whether server credentials are configured', async () => {
  const missing = await handler.fetch(new Request(`${origin}/api/status`));
  assert.equal(missing.status, 200);
  assert.equal(missing.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await missing.json()).configured, false);
  const response = await handler.fetch(new Request(`${origin}/api/status`), env);
  const body = await response.text();
  assert.equal(JSON.parse(body).configured, true);
  assert.equal(JSON.parse(body).model, 'gpt-image-2');
  assert.equal(JSON.parse(body).message, '服务端密钥已配置，可先测试一张图确认连接和权限。');
  assert.ok(!body.includes(key));
});

test('generation without a key returns an actionable Chinese error without calling provider', async () => {
  globalThis.fetch = () => { throw new Error('must not call provider'); };
  const response = await handler.fetch(request(), {});
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENAI_API_KEY/);
});

test('cross-origin generation is rejected before any provider call', async () => {
  globalThis.fetch = () => { throw new Error('must not call provider'); };
  const response = await handler.fetch(request(valid, { Origin: 'https://malicious.example' }), env);
  assert.equal(response.status, 403);
});

test('malformed inputs are rejected before generation', async () => {
  globalThis.fetch = () => { throw new Error('must not call provider'); };
  const examples = [null, [], {}, { ...valid, prompt: ' ' }, { ...valid, prompt: 'a'.repeat(16001) }, { ...valid, images: [] }, { ...valid, images: Array(13).fill(image) }, { ...valid, images: ['https://example.com/private.png'] }, { ...valid, images: ['data:image/svg+xml;base64,aGVsbG8='] }, { ...valid, images: ['data:image/png;base64,aGVsbG8'] }, { ...valid, ratio: '16:9' }, { ...valid, quality: 'ultra' }];
  for (const input of examples) {
    const response = await handler.fetch(request(input), env);
    assert.equal(response.status, 400, `invalid case: ${JSON.stringify(input)?.slice(0, 120)}`);
  }
  const malformed = await handler.fetch(new Request(`${origin}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }), env);
  assert.equal(malformed.status, 400);
  const wrongType = await handler.fetch(request(valid, { 'Content-Type': 'text/plain' }), env);
  assert.equal(wrongType.status, 415);
});

test('reference images are limited to 20 MB combined', async () => {
  const oversizedImage = `data:image/png;base64,${Buffer.alloc(20 * 1024 * 1024 + 1).toString('base64')}`;
  const response = await handler.fetch(request({ ...valid, images: [oversizedImage] }), env);
  assert.equal(response.status, 413);
});

test('generation uses fixed official endpoint and reference edit schema, keeping key on server', async () => {
  let called = false;
  globalThis.fetch = async (url, options) => {
    called = true;
    assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${key}`);
    assert.ok(options.signal instanceof AbortSignal);
    const payload = JSON.parse(options.body);
    assert.deepEqual(payload, { model: 'gpt-image-2', images: [{ image_url: image }], prompt: valid.prompt, n: 1, size: '1024x1024', quality: 'medium', output_format: 'png' });
    assert.ok(!options.body.includes(key));
    return Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] });
  };
  const response = await handler.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { dataUrl: 'data:image/png;base64,aW1hZ2U=' });
  assert.ok(called);
});

test('portrait size and gpt-image-1.5 use high input fidelity', async () => {
  globalThis.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'gpt-image-1.5');
    assert.equal(payload.input_fidelity, 'high');
    assert.equal(payload.size, '1024x1536');
    assert.equal(payload.quality, 'high');
    return Response.json({ data: [{ b64_json: 'aW1hZ2U=' }] });
  };
  const response = await handler.fetch(request({ ...valid, ratio: '3:4', quality: 'high' }), { ...env, OPENAI_IMAGE_MODEL: 'gpt-image-1.5' });
  assert.equal(response.status, 200);
});

test('provider failures never expose upstream bodies or secrets', async () => {
  for (const code of [400, 401, 403, 429, 500]) {
    globalThis.fetch = async () => Response.json({ error: { message: `raw provider diagnostic ${key}` } }, { status: code });
    const response = await handler.fetch(request(), env);
    assert.equal(response.status, code === 429 ? 429 : 502);
    const body = await response.text();
    assert.ok(!body.includes(key));
    assert.ok(!body.includes('raw provider diagnostic'));
    assert.ok(JSON.parse(body).error);
  }
});

test('network failures, timeout, and invalid results return safe errors', async () => {
  globalThis.fetch = async () => { throw new Error(key); };
  let response = await handler.fetch(request(), env);
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(key));
  globalThis.fetch = async () => { throw new DOMException(key, 'TimeoutError'); };
  response = await handler.fetch(request(), env);
  assert.equal(response.status, 504);
  for (const result of [{ data: [] }, { data: [{ url: 'https://example.com/result.png' }] }, { data: [{ b64_json: '<script>' }] }]) {
    globalThis.fetch = async () => Response.json(result);
    response = await handler.fetch(request(), env);
    assert.equal(response.status, 502);
  }
});

test('static routes have correct MIME types and do not cache', async () => {
  globalThis.assets = { 'index.html': '<!doctype html>', 'app.js': 'export {};', 'style.css': 'body{}', 'media.js': 'export {};', 'planner.js': 'export {};' };
  for (const [pathname, contentType] of [['/', 'text/html'], ['/index.html', 'text/html'], ['/app.js', 'text/javascript'], ['/style.css', 'text/css'], ['/media.js', 'text/javascript'], ['/planner.js', 'text/javascript']]) {
    const response = await handler.fetch(new Request(`${origin}${pathname}`));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('Content-Type').startsWith(contentType));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.ok((await response.text()).length > 0);
  }
  const head = await handler.fetch(new Request(origin, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  delete globalThis.assets;
  assert.equal((await handler.fetch(new Request(origin))).status, 404);
  assert.equal((await handler.fetch(new Request(`${origin}/missing`))).status, 404);
});

test('route methods are constrained', async () => {
  assert.equal((await handler.fetch(new Request(`${origin}/api/status`, { method: 'POST' }))).status, 405);
  assert.equal((await handler.fetch(request(valid, {}, 'GET'), env)).status, 405);
  assert.equal((await handler.fetch(new Request(origin, { method: 'POST' }))).status, 405);
});
