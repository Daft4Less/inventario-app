const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'products.json');

const SEED = [
  { id: 1, name: 'Teclado mecanico', sku: 'TEC-001', stock: 25, price: 45.5 },
  { id: 2, name: 'Mouse inalambrico', sku: 'MOU-002', stock: 40, price: 18.0 },
  { id: 3, name: 'Monitor 24 pulgadas', sku: 'MON-003', stock: 8, price: 129.99 },
];

function ensureDbFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ nextId: SEED.length + 1, products: SEED }, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function canAccessDb() {
  try {
    ensureDbFile();
    fs.accessSync(DB_PATH, fs.constants.R_OK | fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function getAll() {
  return readDb().products;
}

function getById(id) {
  return readDb().products.find((p) => p.id === Number(id));
}

function create({ name, sku, stock, price }) {
  const db = readDb();
  const product = {
    id: db.nextId,
    name,
    sku,
    stock: Number(stock) || 0,
    price: Number(price) || 0,
  };
  db.products.push(product);
  db.nextId += 1;
  writeDb(db);
  return product;
}

function update(id, patch) {
  const db = readDb();
  const idx = db.products.findIndex((p) => p.id === Number(id));
  if (idx === -1) return null;
  db.products[idx] = { ...db.products[idx], ...patch, id: db.products[idx].id };
  writeDb(db);
  return db.products[idx];
}

function remove(id) {
  const db = readDb();
  const before = db.products.length;
  db.products = db.products.filter((p) => p.id !== Number(id));
  writeDb(db);
  return db.products.length < before;
}

module.exports = { getAll, getById, create, update, remove, canAccessDb, DB_PATH };
