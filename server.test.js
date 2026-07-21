const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TEST_DB = path.join(__dirname, 'data', 'test-products.json');
process.env.DB_PATH = TEST_DB;

const { createApp } = require('./server');

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function request(server, method, urlPath, body) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          const parsed = raw ? JSON.parse(raw) : null;
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

after(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

test('GET /health responde 200 y status ok', async () => {
  const app = createApp();
  const server = await startServer(app);
  const res = await request(server, 'GET', '/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
  server.close();
});

test('GET /version responde con version y color', async () => {
  const app = createApp();
  const server = await startServer(app);
  const res = await request(server, 'GET', '/version');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.version);
  assert.ok(res.body.color);
  server.close();
});

test('POST /api/products crea un producto y GET /api/products lo lista', async () => {
  const app = createApp();
  const server = await startServer(app);

  const created = await request(server, 'POST', '/api/products', {
    name: 'Producto de prueba',
    sku: 'TST-999',
    stock: 5,
    price: 9.99,
  });
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.name, 'Producto de prueba');

  const list = await request(server, 'GET', '/api/products');
  assert.strictEqual(list.status, 200);
  assert.ok(list.body.some((p) => p.sku === 'TST-999'));

  server.close();
});

test('DELETE /api/products/:id elimina el producto', async () => {
  const app = createApp();
  const server = await startServer(app);

  const created = await request(server, 'POST', '/api/products', {
    name: 'Para borrar',
    sku: 'DEL-001',
    stock: 1,
    price: 1,
  });

  const del = await request(server, 'DELETE', '/api/products/' + created.body.id);
  assert.strictEqual(del.status, 204);

  const get = await request(server, 'GET', '/api/products/' + created.body.id);
  assert.strictEqual(get.status, 404);

  server.close();
});

test('POST /api/products sin name/sku responde 400', async () => {
  const app = createApp();
  const server = await startServer(app);
  const res = await request(server, 'POST', '/api/products', { stock: 1 });
  assert.strictEqual(res.status, 400);
  server.close();
});
