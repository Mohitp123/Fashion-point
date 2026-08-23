// server.js — Fashion Point API. Zero external dependencies (Node built-ins only).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db');
const authLib = require('./auth');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- helpers ----------
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) req.destroy(); // 2MB cap
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getAuthContext(req) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = authLib.verify(token);
  if (!payload) return null;
  return { userId: payload.uid, businessId: payload.bid, role: payload.role };
}

function requireAuth(req, res) {
  const ctx = getAuthContext(req);
  if (!ctx) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return ctx;
}

function paise(rupees) {
  return Math.round(Number(rupees) * 100);
}
function rupees(paiseVal) {
  return Math.round(paiseVal) / 100;
}

// ---------- route table ----------
const routes = [];
function route(method, pattern, handler) {
  // pattern like /api/products/:id -> regex with named groups
  const paramNames = [];
  const regexStr = pattern
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  const regex = new RegExp(`^${regexStr}/?$`);
  routes.push({ method, regex, paramNames, handler });
}

function matchRoute(method, urlPath) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.regex.exec(urlPath);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => (params[name] = m[i + 1]));
      return { handler: r.handler, params };
    }
  }
  return null;
}

// ================= AUTH =================

route('POST', '/api/auth/register', async (req, res) => {
  const body = await readBody(req);
  const { businessName, ownerName, email, password } = body;
  if (!businessName || !ownerName || !email || !password) {
    return sendJson(res, 400, { error: 'businessName, ownerName, email, password are required' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return sendJson(res, 409, { error: 'Email already registered' });

  const insertBiz = db.prepare('INSERT INTO businesses (name) VALUES (?)').run(businessName);
  const businessId = Number(insertBiz.lastInsertRowid);

  const { hash, salt } = authLib.hashPassword(password);
  const insertUser = db
    .prepare(
      'INSERT INTO users (business_id, name, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(businessId, ownerName, email.toLowerCase(), hash, salt, 'Owner');
  const userId = Number(insertUser.lastInsertRowid);

  const token = authLib.sign({ uid: userId, bid: businessId, role: 'Owner' });
  sendJson(res, 201, { token, business: { id: businessId, name: businessName }, user: { id: userId, name: ownerName, role: 'Owner' } });
});

route('POST', '/api/auth/login', async (req, res) => {
  const body = await readBody(req);
  const { email, password } = body;
  if (!email || !password) return sendJson(res, 400, { error: 'email and password required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !authLib.verifyPassword(password, user.password_hash, user.password_salt)) {
    return sendJson(res, 401, { error: 'Invalid credentials' });
  }
  const business = db.prepare('SELECT * FROM businesses WHERE id = ?').get(user.business_id);
  const token = authLib.sign({ uid: user.id, bid: user.business_id, role: user.role });
  sendJson(res, 200, { token, business: { id: business.id, name: business.name }, user: { id: user.id, name: user.name, role: user.role } });
});

// ================= PRODUCTS & VARIANTS =================

route('GET', '/api/products', async (req, res, params, query) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const search = query.get('search') || '';
  const products = db
    .prepare(
      `SELECT p.id, p.name, p.brand, c.name AS category
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.business_id = ? AND p.name LIKE ?
       ORDER BY p.id DESC`
    )
    .all(ctx.businessId, `%${search}%`);

  const variantStmt = db.prepare('SELECT * FROM variants WHERE product_id = ?');
  const result = products.map((p) => ({
    ...p,
    variants: variantStmt.all(p.id).map((v) => ({
      id: v.id,
      size: v.size,
      color: v.color,
      sku: v.sku,
      barcode: v.barcode,
      costPrice: rupees(v.cost_price_paise),
      sellPrice: rupees(v.sell_price_paise),
      qtyOnHand: v.qty_on_hand,
      reorderLevel: v.reorder_level,
    })),
  }));
  sendJson(res, 200, result);
});

route('POST', '/api/products', async (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await readBody(req);
  const { name, brand, category, variants } = body;
  if (!name || !Array.isArray(variants) || variants.length === 0) {
    return sendJson(res, 400, { error: 'name and at least one variant are required' });
  }

  let categoryId = null;
  if (category) {
    const existingCat = db
      .prepare('SELECT id FROM categories WHERE business_id = ? AND name = ?')
      .get(ctx.businessId, category);
    categoryId = existingCat
      ? existingCat.id
      : Number(db.prepare('INSERT INTO categories (business_id, name) VALUES (?, ?)').run(ctx.businessId, category).lastInsertRowid);
  }

  const insertProduct = db
    .prepare('INSERT INTO products (business_id, name, category_id, brand) VALUES (?, ?, ?, ?)')
    .run(ctx.businessId, name, categoryId, brand || null);
  const productId = Number(insertProduct.lastInsertRowid);

  const insertVariant = db.prepare(
    `INSERT INTO variants (product_id, business_id, size, color, sku, barcode, cost_price_paise, sell_price_paise, qty_on_hand, reorder_level)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const createdVariants = [];
  for (const v of variants) {
    const info = insertVariant.run(
      productId,
      ctx.businessId,
      v.size || null,
      v.color || null,
      v.sku || null,
      v.barcode || null,
      paise(v.costPrice || 0),
      paise(v.sellPrice || 0),
      Number(v.qtyOnHand || 0),
      Number(v.reorderLevel ?? 3)
    );
    createdVariants.push(Number(info.lastInsertRowid));
  }

  sendJson(res, 201, { id: productId, variantIds: createdVariants });
});

// ================= INVENTORY / PURCHASES =================

route('GET', '/api/inventory', async (req, res, params, query) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const lowStockOnly = query.get('lowStock') === 'true';
  const rows = db
    .prepare(
      `SELECT v.id AS variant_id, p.name AS product_name, v.size, v.color, v.sku,
              v.qty_on_hand, v.reorder_level, v.cost_price_paise, v.sell_price_paise, v.last_sold_at
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.business_id = ?
       ORDER BY v.qty_on_hand ASC`
    )
    .all(ctx.businessId);

  const shaped = rows.map((r) => ({
    variantId: r.variant_id,
    product: r.product_name,
    size: r.size,
    color: r.color,
    sku: r.sku,
    qtyOnHand: r.qty_on_hand,
    reorderLevel: r.reorder_level,
    stockValue: rupees(r.qty_on_hand * r.cost_price_paise),
    lastSoldAt: r.last_sold_at,
    lowStock: r.qty_on_hand <= r.reorder_level,
  }));

  sendJson(res, 200, lowStockOnly ? shaped.filter((s) => s.lowStock) : shaped);
});

route('POST', '/api/purchases', async (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await readBody(req);
  const { supplierName, items } = body; // items: [{variantId, qty, unitCost}]
  if (!Array.isArray(items) || items.length === 0) {
    return sendJson(res, 400, { error: 'items are required' });
  }

  let totalPaise = 0;
  db.exec('BEGIN');
  try {
    const insertPurchase = db.prepare('INSERT INTO purchases (business_id, supplier_name, total_paise) VALUES (?, ?, 0)');
    const purchaseId = Number(insertPurchase.run(ctx.businessId, supplierName || null).lastInsertRowid);

    const insertItem = db.prepare('INSERT INTO purchase_items (purchase_id, variant_id, qty, unit_cost_paise) VALUES (?, ?, ?, ?)');
    const bumpStock = db.prepare('UPDATE variants SET qty_on_hand = qty_on_hand + ? WHERE id = ? AND business_id = ?');
    const logTx = db.prepare(
      'INSERT INTO inventory_transactions (business_id, variant_id, type, qty_change, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const item of items) {
      const variant = db.prepare('SELECT * FROM variants WHERE id = ? AND business_id = ?').get(item.variantId, ctx.businessId);
      if (!variant) throw new Error(`Variant ${item.variantId} not found for this business`);
      const unitCostP = paise(item.unitCost ?? rupees(variant.cost_price_paise));
      insertItem.run(purchaseId, item.variantId, item.qty, unitCostP);
      bumpStock.run(item.qty, item.variantId, ctx.businessId);
      logTx.run(ctx.businessId, item.variantId, 'purchase', item.qty, 'purchase', purchaseId);
      totalPaise += unitCostP * item.qty;
    }
    db.prepare('UPDATE purchases SET total_paise = ? WHERE id = ?').run(totalPaise, purchaseId);
    db.exec('COMMIT');
    sendJson(res, 201, { id: purchaseId, total: rupees(totalPaise) });
  } catch (err) {
    db.exec('ROLLBACK');
    sendJson(res, 400, { error: err.message });
  }
});

// ================= CUSTOMERS =================

route('GET', '/api/customers', async (req, res, params, query) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const search = query.get('search') || '';
  const rows = db
    .prepare(
      `SELECT * FROM customers WHERE business_id = ? AND (name LIKE ? OR phone LIKE ?) ORDER BY id DESC`
    )
    .all(ctx.businessId, `%${search}%`, `%${search}%`);
  sendJson(res, 200, rows);
});

route('POST', '/api/customers', async (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await readBody(req);
  if (!body.name) return sendJson(res, 400, { error: 'name is required' });
  const info = db
    .prepare('INSERT INTO customers (business_id, name, phone, notes) VALUES (?, ?, ?, ?)')
    .run(ctx.businessId, body.name, body.phone || null, body.notes || null);
  sendJson(res, 201, { id: Number(info.lastInsertRowid) });
});

route('GET', '/api/customers/:id', async (req, res, params) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const customer = db.prepare('SELECT * FROM customers WHERE id = ? AND business_id = ?').get(params.id, ctx.businessId);
  if (!customer) return sendJson(res, 404, { error: 'Not found' });
  const sales = db
    .prepare(
      `SELECT id, total_paise, profit_paise, created_at FROM sales WHERE customer_id = ? AND business_id = ? ORDER BY created_at DESC`
    )
    .all(params.id, ctx.businessId)
    .map((s) => ({ id: s.id, total: rupees(s.total_paise), profit: rupees(s.profit_paise), createdAt: s.created_at }));
  const totalSpent = sales.reduce((sum, s) => sum + s.total, 0);
  sendJson(res, 200, { ...customer, purchaseHistory: sales, lifetimeValue: totalSpent, totalPurchases: sales.length });
});

// ================= SALES (POS) =================

route('POST', '/api/sales', async (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const body = await readBody(req);
  const { customerId, items, discount, paymentMethod } = body; // items: [{variantId, qty, unitPrice?}]
  if (!Array.isArray(items) || items.length === 0) {
    return sendJson(res, 400, { error: 'items are required' });
  }

  db.exec('BEGIN');
  try {
    let subtotalPaise = 0;
    let cogsPaise = 0;
    const lineItems = [];

    const getVariant = db.prepare('SELECT * FROM variants WHERE id = ? AND business_id = ?');
    const decrementStock = db.prepare('UPDATE variants SET qty_on_hand = qty_on_hand - ?, last_sold_at = datetime(\'now\') WHERE id = ?');
    const logTx = db.prepare(
      'INSERT INTO inventory_transactions (business_id, variant_id, type, qty_change, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const item of items) {
      const variant = getVariant.get(item.variantId, ctx.businessId);
      if (!variant) throw new Error(`Variant ${item.variantId} not found for this business`);
      if (variant.qty_on_hand < item.qty) {
        throw new Error(`Insufficient stock for ${variant.sku || variant.id}: have ${variant.qty_on_hand}, need ${item.qty}`);
      }
      const unitPriceP = item.unitPrice != null ? paise(item.unitPrice) : variant.sell_price_paise;
      const unitCostP = variant.cost_price_paise;
      subtotalPaise += unitPriceP * item.qty;
      cogsPaise += unitCostP * item.qty;
      lineItems.push({ variantId: variant.id, qty: item.qty, unitPriceP, unitCostP });
    }

    const discountPaise = paise(discount || 0);
    const totalPaise = subtotalPaise - discountPaise;
    const profitPaise = totalPaise - cogsPaise;

    const insertSale = db.prepare(
      `INSERT INTO sales (business_id, customer_id, subtotal_paise, discount_paise, total_paise, cogs_paise, profit_paise, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const saleId = Number(
      insertSale.run(ctx.businessId, customerId || null, subtotalPaise, discountPaise, totalPaise, cogsPaise, profitPaise, paymentMethod || 'cash')
        .lastInsertRowid
    );

    const insertSaleItem = db.prepare(
      'INSERT INTO sale_items (sale_id, variant_id, qty, unit_price_paise, unit_cost_paise) VALUES (?, ?, ?, ?, ?)'
    );
    for (const li of lineItems) {
      insertSaleItem.run(saleId, li.variantId, li.qty, li.unitPriceP, li.unitCostP);
      decrementStock.run(li.qty, li.variantId);
      logTx.run(ctx.businessId, li.variantId, 'sale', -li.qty, 'sale', saleId);
    }

    db.exec('COMMIT');
    sendJson(res, 201, {
      id: saleId,
      subtotal: rupees(subtotalPaise),
      discount: rupees(discountPaise),
      total: rupees(totalPaise),
      cogs: rupees(cogsPaise),
      profit: rupees(profitPaise),
    });
  } catch (err) {
    db.exec('ROLLBACK');
    sendJson(res, 400, { error: err.message });
  }
});

route('GET', '/api/sales', async (req, res, params, query) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;
  const rows = db
    .prepare(
      `SELECT s.id, s.total_paise, s.profit_paise, s.payment_method, s.created_at, c.name AS customer_name
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.business_id = ? ORDER BY s.created_at DESC LIMIT 100`
    )
    .all(ctx.businessId);
  sendJson(
    res,
    200,
    rows.map((r) => ({
      id: r.id,
      total: rupees(r.total_paise),
      profit: rupees(r.profit_paise),
      paymentMethod: r.payment_method,
      customer: r.customer_name,
      createdAt: r.created_at,
    }))
  );
});

// ================= DASHBOARD =================

route('GET', '/api/dashboard/today', async (req, res) => {
  const ctx = requireAuth(req, res);
  if (!ctx) return;

  const today = db
    .prepare(
      `SELECT COUNT(*) AS bills, COALESCE(SUM(total_paise),0) AS revenue, COALESCE(SUM(profit_paise),0) AS profit
       FROM sales WHERE business_id = ? AND date(created_at) = date('now')`
    )
    .get(ctx.businessId);

  const customersServedToday = db
    .prepare(
      `SELECT COUNT(DISTINCT customer_id) AS n FROM sales WHERE business_id = ? AND date(created_at) = date('now') AND customer_id IS NOT NULL`
    )
    .get(ctx.businessId).n;

  const lowStockCount = db
    .prepare('SELECT COUNT(*) AS n FROM variants WHERE business_id = ? AND qty_on_hand <= reorder_level')
    .get(ctx.businessId).n;

  const outOfStockCount = db
    .prepare('SELECT COUNT(*) AS n FROM variants WHERE business_id = ? AND qty_on_hand <= 0')
    .get(ctx.businessId).n;

  const inactiveCustomers = db
    .prepare(
      `SELECT COUNT(*) AS n FROM customers c
       WHERE c.business_id = ? AND c.id NOT IN (
         SELECT customer_id FROM sales WHERE business_id = ? AND customer_id IS NOT NULL AND created_at >= datetime('now','-90 days')
       )`
    )
    .get(ctx.businessId, ctx.businessId).n;

  const totalCustomers = db.prepare('SELECT COUNT(*) AS n FROM customers WHERE business_id = ?').get(ctx.businessId).n;

  const deadStock = db
    .prepare(
      `SELECT p.name, v.size, v.color, v.qty_on_hand, v.cost_price_paise
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.business_id = ? AND v.qty_on_hand > 0
         AND (v.last_sold_at IS NULL OR v.last_sold_at < datetime('now','-60 days'))
       ORDER BY v.qty_on_hand * v.cost_price_paise DESC LIMIT 5`
    )
    .all(ctx.businessId)
    .map((r) => ({ product: `${r.name}${r.size ? ' ' + r.size : ''}${r.color ? ' ' + r.color : ''}`, qtyOnHand: r.qty_on_hand, stockValue: rupees(r.qty_on_hand * r.cost_price_paise) }));

  sendJson(res, 200, {
    today: {
      revenue: rupees(today.revenue),
      grossProfit: rupees(today.profit),
      bills: today.bills,
      avgBillValue: today.bills > 0 ? rupees(today.revenue) / today.bills : 0,
      customersServed: customersServedToday,
    },
    inventory: { lowStockCount, outOfStockCount, deadStock },
    customers: { total: totalCustomers, inactive90d: inactiveCustomers },
  });
});

// ================= STATIC FILES =================

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.join(PUBLIC_DIR, filePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, data2) => {
        if (err2) return sendJson(res, 404, { error: 'Not found' });
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(data2);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ================= SERVER =================

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const urlPath = parsedUrl.pathname;
  const query = parsedUrl.searchParams;

  if (!urlPath.startsWith('/api/')) {
    return serveStatic(req, res, urlPath);
  }

  const match = matchRoute(req.method, urlPath);
  if (!match) return sendJson(res, 404, { error: 'Not found' });

  try {
    await match.handler(req, res, match.params, query);
  } catch (err) {
    console.error(err);
    if (err.message === 'INVALID_JSON') return sendJson(res, 400, { error: 'Invalid JSON body' });
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Fashion Point API listening on port ${PORT}`);
});

module.exports = server;
