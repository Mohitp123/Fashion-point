// db.js — zero-dependency data layer using Node's built-in node:sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Owner',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    category_id INTEGER REFERENCES categories(id),
    brand TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    size TEXT,
    color TEXT,
    sku TEXT,
    barcode TEXT,
    cost_price_paise INTEGER NOT NULL DEFAULT 0,
    sell_price_paise INTEGER NOT NULL DEFAULT 0,
    qty_on_hand INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 3,
    last_sold_at TEXT
  );

  CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    variant_id INTEGER NOT NULL REFERENCES variants(id),
    type TEXT NOT NULL, -- purchase | sale | return | adjustment
    qty_change INTEGER NOT NULL,
    ref_type TEXT,
    ref_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    name TEXT NOT NULL,
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    supplier_name TEXT,
    total_paise INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id),
    variant_id INTEGER NOT NULL REFERENCES variants(id),
    qty INTEGER NOT NULL,
    unit_cost_paise INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL REFERENCES businesses(id),
    customer_id INTEGER REFERENCES customers(id),
    subtotal_paise INTEGER NOT NULL,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    total_paise INTEGER NOT NULL,
    cogs_paise INTEGER NOT NULL,
    profit_paise INTEGER NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL REFERENCES sales(id),
    variant_id INTEGER NOT NULL REFERENCES variants(id),
    qty INTEGER NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    unit_cost_paise INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_variants_business ON variants(business_id);
  CREATE INDEX IF NOT EXISTS idx_variants_sku ON variants(sku);
  CREATE INDEX IF NOT EXISTS idx_customers_business_phone ON customers(business_id, phone);
  CREATE INDEX IF NOT EXISTS idx_sales_business_date ON sales(business_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_invtx_variant ON inventory_transactions(variant_id);
`);

module.exports = db;
