// seed.js — populate demo data for "Fashion Point" so the dashboard is meaningful on first run
const db = require('./db');
const authLib = require('./auth');

function paise(rupees) { return Math.round(Number(rupees) * 100); }

function randomDate(daysAgoMax, daysAgoMin = 0) {
  const days = daysAgoMin + Math.random() * (daysAgoMax - daysAgoMin);
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function seed() {
  const already = db.prepare("SELECT id FROM users WHERE email = ?").get('owner@fashionpoint.demo');
  if (already) {
    console.log('Demo data already seeded. Login: owner@fashionpoint.demo / demo1234');
    return;
  }

  const bizId = Number(db.prepare('INSERT INTO businesses (name) VALUES (?)').run('Fashion Point').lastInsertRowid);
  const { hash, salt } = authLib.hashPassword('demo1234');
  db.prepare('INSERT INTO users (business_id, name, email, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(bizId, 'Demo Owner', 'owner@fashionpoint.demo', hash, salt, 'Owner');

  const categories = ['Shirts', 'Jeans', 'T-Shirts', 'Jackets', 'Trousers'];
  const catIds = {};
  for (const c of categories) {
    catIds[c] = Number(db.prepare('INSERT INTO categories (business_id, name) VALUES (?, ?)').run(bizId, c).lastInsertRowid);
  }

  const sizes = ['S', 'M', 'L', 'XL'];
  const colors = ['Blue', 'Black', 'White', 'Grey'];
  const productNames = {
    Shirts: ['Slim Fit Oxford Shirt', 'Formal Cotton Shirt', 'Checked Casual Shirt'],
    Jeans: ['Slim Fit Jeans', 'Straight Fit Jeans'],
    'T-Shirts': ['Round Neck Tee', 'Polo T-Shirt'],
    Jackets: ['Denim Jacket', 'Bomber Jacket'],
    Trousers: ['Chino Trousers', 'Formal Trousers'],
  };

  const insertProduct = db.prepare('INSERT INTO products (business_id, name, category_id, brand) VALUES (?, ?, ?, ?)');
  const insertVariant = db.prepare(
    `INSERT INTO variants (product_id, business_id, size, color, sku, barcode, cost_price_paise, sell_price_paise, qty_on_hand, reorder_level, last_sold_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const allVariantIds = [];
  let skuCounter = 1000;
  for (const [cat, names] of Object.entries(productNames)) {
    for (const name of names) {
      const productId = Number(insertProduct.run(bizId, name, catIds[cat], 'Fashion Point House Brand').lastInsertRowid);
      const costBase = cat === 'Jackets' ? 900 : cat === 'Jeans' ? 700 : 350;
      const sellBase = cat === 'Jackets' ? 2499 : cat === 'Jeans' ? 1799 : 899;
      for (const size of sizes) {
        for (const color of colors.slice(0, 2 + Math.floor(Math.random() * 2))) {
          skuCounter++;
          const qty = Math.floor(Math.random() * 25);
          const lastSold = Math.random() > 0.3 ? randomDate(120, 0) : null;
          const info = insertVariant.run(
            productId, bizId, size, color, `FP-${skuCounter}`, `890${skuCounter}`,
            paise(costBase + Math.random() * 100),
            paise(sellBase + Math.random() * 200),
            qty, 5, lastSold
          );
          allVariantIds.push({ id: Number(info.lastInsertRowid), cost: costBase, sell: sellBase, qty });
        }
      }
    }
  }

  // Customers
  const firstNames = ['Rahul', 'Priya', 'Aman', 'Simran', 'Neha', 'Vikram', 'Anjali', 'Karan', 'Pooja', 'Rohit',
    'Divya', 'Sanjay', 'Meera', 'Arjun', 'Kavya', 'Suresh', 'Ritu', 'Manoj', 'Shreya', 'Ajay',
    'Nisha', 'Gaurav', 'Swati', 'Deepak', 'Anita', 'Vivek', 'Pallavi', 'Rajesh', 'Sneha', 'Amit'];
  const insertCustomer = db.prepare('INSERT INTO customers (business_id, name, phone, notes, created_at) VALUES (?, ?, ?, ?, ?)');
  const customerIds = [];
  firstNames.forEach((name, i) => {
    const info = insertCustomer.run(bizId, name, `98${String(10000000 + i * 137).slice(0, 8)}`, null, randomDate(300, 30));
    customerIds.push(Number(info.lastInsertRowid));
  });

  // Sales (100+ transactions across the last 120 days, weighted recent)
  const insertSale = db.prepare(
    `INSERT INTO sales (business_id, customer_id, subtotal_paise, discount_paise, total_paise, cogs_paise, profit_paise, payment_method, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSaleItem = db.prepare('INSERT INTO sale_items (sale_id, variant_id, qty, unit_price_paise, unit_cost_paise) VALUES (?, ?, ?, ?, ?)');
  const paymentMethods = ['cash', 'upi', 'upi', 'card', 'cash'];

  for (let i = 0; i < 110; i++) {
    const numItems = 1 + Math.floor(Math.random() * 3);
    let subtotal = 0, cogs = 0;
    const lines = [];
    for (let j = 0; j < numItems; j++) {
      const v = allVariantIds[Math.floor(Math.random() * allVariantIds.length)];
      const qty = 1 + Math.floor(Math.random() * 2);
      const unitPrice = paise(v.sell + Math.random() * 200);
      const unitCost = paise(v.cost + Math.random() * 100);
      subtotal += unitPrice * qty;
      cogs += unitCost * qty;
      lines.push({ variantId: v.id, qty, unitPrice, unitCost });
    }
    const discount = Math.random() > 0.8 ? Math.round(subtotal * 0.1) : 0;
    const total = subtotal - discount;
    const profit = total - cogs;
    const customerId = Math.random() > 0.15 ? customerIds[Math.floor(Math.random() * customerIds.length)] : null;
    const createdAt = i < 6 ? randomDate(0, 0) : randomDate(120, 1); // keep a handful "today"
    const saleId = Number(
      insertSale.run(bizId, customerId, subtotal, discount, total, cogs, profit, paymentMethods[i % paymentMethods.length], createdAt)
        .lastInsertRowid
    );
    for (const line of lines) {
      insertSaleItem.run(saleId, line.variantId, line.qty, line.unitPrice, line.unitCost);
    }
  }

  console.log('Seeded Fashion Point demo data.');
  console.log('Login: owner@fashionpoint.demo / demo1234');
}

seed();
