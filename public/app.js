// app.js — Fashion Point frontend. Vanilla JS, no framework, no build step.
const state = {
  token: localStorage.getItem('fp_token') || null,
  business: JSON.parse(localStorage.getItem('fp_business') || 'null'),
  user: JSON.parse(localStorage.getItem('fp_user') || 'null'),
  route: 'dashboard',
  cart: [], // { variantId, name, qty, unitPrice }
};

const app = document.getElementById('app');

function fmtInr(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setAuth({ token, business, user }) {
  state.token = token; state.business = business; state.user = user;
  localStorage.setItem('fp_token', token);
  localStorage.setItem('fp_business', JSON.stringify(business));
  localStorage.setItem('fp_user', JSON.stringify(user));
}

function logout() {
  state.token = null; state.business = null; state.user = null; state.cart = [];
  localStorage.clear();
  render();
}

function nav(route) { state.route = route; render(); }

// ---------- AUTH VIEWS ----------
function renderAuth() {
  app.innerHTML = `
    <div class="auth-wrap">
      <div class="card">
        <h1 style="text-align:center;margin-bottom:4px;">Fashion Point</h1>
        <p class="muted" style="text-align:center;margin-bottom:20px;">Business OS for your shop</p>
        <div id="authError" class="error"></div>
        <div id="authTabs">
          <div class="row" style="margin-bottom:16px;">
            <button id="tabLogin" class="secondary">Login</button>
            <button id="tabRegister">Register Shop</button>
          </div>
        </div>
        <div id="authForm"></div>
      </div>
    </div>`;

  let mode = 'register';
  const err = document.getElementById('authError');
  const formEl = document.getElementById('authForm');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');

  function draw() {
    err.textContent = '';
    tabLogin.className = mode === 'login' ? '' : 'secondary';
    tabRegister.className = mode === 'register' ? '' : 'secondary';
    if (mode === 'login') {
      formEl.innerHTML = `
        <label>Email</label><input id="email" type="email" placeholder="owner@yourshop.com" />
        <label>Password</label><input id="password" type="password" placeholder="••••••••" />
        <button id="submitBtn" style="width:100%">Log in</button>
        <p class="muted" style="margin-top:10px;">Demo: owner@fashionpoint.demo / demo1234</p>`;
    } else {
      formEl.innerHTML = `
        <label>Shop Name</label><input id="businessName" placeholder="e.g. Rahul Fashion Store" />
        <label>Your Name</label><input id="ownerName" placeholder="Owner name" />
        <label>Email</label><input id="email" type="email" />
        <label>Password</label><input id="password" type="password" />
        <button id="submitBtn" style="width:100%">Create my shop</button>`;
    }
    document.getElementById('submitBtn').onclick = submit;
  }

  async function submit() {
    err.textContent = '';
    try {
      if (mode === 'login') {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setAuth(data);
      } else {
        const businessName = document.getElementById('businessName').value.trim();
        const ownerName = document.getElementById('ownerName').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ businessName, ownerName, email, password }) });
        setAuth(data);
      }
      state.route = 'dashboard';
      render();
    } catch (e) {
      err.textContent = e.message;
    }
  }

  tabLogin.onclick = () => { mode = 'login'; draw(); };
  tabRegister.onclick = () => { mode = 'register'; draw(); };
  draw();
}

// ---------- SHELL ----------
function renderShell(contentHtml) {
  app.innerHTML = `
    <div class="topbar">
      <div><h1>${state.business.name}</h1><div class="biz">Hi ${state.user.name} (${state.user.role})</div></div>
      <button class="secondary small" id="logoutBtn">Log out</button>
    </div>
    <div id="content">${contentHtml}</div>
    <div class="nav">
      <button data-r="dashboard">Dashboard</button>
      <button data-r="pos">POS / Sell</button>
      <button data-r="products">Products</button>
      <button data-r="customers">Customers</button>
    </div>`;
  document.getElementById('logoutBtn').onclick = logout;
  document.querySelectorAll('.nav button').forEach((b) => {
    if (b.dataset.r === state.route) b.classList.add('active');
    b.onclick = () => nav(b.dataset.r);
  });
}

// ---------- DASHBOARD ----------
async function renderDashboard() {
  renderShell('<div class="muted">Loading…</div>');
  try {
    const d = await api('/dashboard/today');
    const html = `
      <div class="card">
        <h2>Today</h2>
        <div class="grid">
          <div class="stat"><div class="label">Revenue</div><div class="value">${fmtInr(d.today.revenue)}</div></div>
          <div class="stat"><div class="label">Gross Profit</div><div class="value good">${fmtInr(d.today.grossProfit)}</div></div>
          <div class="stat"><div class="label">Bills</div><div class="value">${d.today.bills}</div></div>
          <div class="stat"><div class="label">Avg Bill</div><div class="value">${fmtInr(d.today.avgBillValue)}</div></div>
          <div class="stat"><div class="label">Customers Served</div><div class="value">${d.today.customersServed}</div></div>
        </div>
      </div>
      <div class="card">
        <h2>Inventory</h2>
        <div class="grid">
          <div class="stat"><div class="label">Low Stock</div><div class="value warn">${d.inventory.lowStockCount}</div></div>
          <div class="stat"><div class="label">Out of Stock</div><div class="value bad">${d.inventory.outOfStockCount}</div></div>
        </div>
        ${d.inventory.deadStock.length ? `
          <h2 style="margin-top:16px;">Dead / Slow-Moving Stock (60+ days)</h2>
          <table><thead><tr><th>Product</th><th>Qty</th><th>Value</th></tr></thead><tbody>
            ${d.inventory.deadStock.map((s) => `<tr><td>${s.product}</td><td>${s.qtyOnHand}</td><td>${fmtInr(s.stockValue)}</td></tr>`).join('')}
          </tbody></table>` : ''}
      </div>
      <div class="card">
        <h2>Customers</h2>
        <div class="grid">
          <div class="stat"><div class="label">Total</div><div class="value">${d.customers.total}</div></div>
          <div class="stat"><div class="label">Inactive 90+ days</div><div class="value warn">${d.customers.inactive90d}</div></div>
        </div>
      </div>`;
    document.getElementById('content').innerHTML = html;
  } catch (e) {
    document.getElementById('content').innerHTML = `<div class="error">${e.message}</div>`;
  }
}

// ---------- PRODUCTS ----------
async function renderProducts() {
  renderShell('<div class="muted">Loading…</div>');
  const content = document.getElementById('content');

  async function load(search = '') {
    const products = await api('/products?search=' + encodeURIComponent(search));
    content.innerHTML = `
      <div class="card">
        <div class="row" style="margin-bottom:0;">
          <input id="search" placeholder="Search products…" value="${search}" />
          <button id="addBtn" style="flex:0 0 auto;">+ Add Product</button>
        </div>
      </div>
      <div id="productList">
        ${products.map((p) => `
          <div class="card">
            <strong>${p.name}</strong> <span class="muted">${p.category || ''} ${p.brand ? '· ' + p.brand : ''}</span>
            <table style="margin-top:10px;">
              <thead><tr><th>Size</th><th>Color</th><th>SKU</th><th>Cost</th><th>Price</th><th>Stock</th></tr></thead>
              <tbody>
                ${p.variants.map((v) => `<tr><td>${v.size || '-'}</td><td>${v.color || '-'}</td><td>${v.sku || '-'}</td><td>${fmtInr(v.costPrice)}</td><td>${fmtInr(v.sellPrice)}</td>
                  <td>${v.qtyOnHand}${v.qtyOnHand <= v.reorderLevel ? ' <span class="badge low">low</span>' : ''}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>`).join('') || '<p class="muted">No products yet. Add your first product.</p>'}
      </div>`;
    document.getElementById('search').oninput = (e) => load(e.target.value);
    document.getElementById('addBtn').onclick = showAddForm;
  }

  function showAddForm() {
    content.innerHTML = `
      <div class="card">
        <h2>Add Product</h2>
        <div id="pErr" class="error"></div>
        <label>Product Name</label><input id="pName" placeholder="e.g. Slim Fit Shirt" />
        <label>Category</label><input id="pCategory" placeholder="e.g. Shirts" />
        <label>Brand</label><input id="pBrand" placeholder="optional" />
        <div id="variantRows"></div>
        <button class="secondary" id="addVariantBtn" type="button">+ Add Variant</button>
        <div class="row" style="margin-top:14px;">
          <button id="saveBtn">Save Product</button>
          <button class="secondary" id="cancelBtn">Cancel</button>
        </div>
      </div>`;
    const variantRows = document.getElementById('variantRows');
    function addVariantRow() {
      const row = document.createElement('div');
      row.className = 'card';
      row.style.padding = '10px';
      row.innerHTML = `
        <div class="row">
          <input placeholder="Size (M)" class="v-size" />
          <input placeholder="Color" class="v-color" />
          <input placeholder="SKU" class="v-sku" />
        </div>
        <div class="row">
          <input placeholder="Cost ₹" type="number" class="v-cost" />
          <input placeholder="Sell ₹" type="number" class="v-sell" />
          <input placeholder="Qty" type="number" class="v-qty" />
        </div>`;
      variantRows.appendChild(row);
    }
    addVariantRow();
    document.getElementById('addVariantBtn').onclick = addVariantRow;
    document.getElementById('cancelBtn').onclick = () => load();
    document.getElementById('saveBtn').onclick = async () => {
      const variants = Array.from(variantRows.children).map((row) => ({
        size: row.querySelector('.v-size').value,
        color: row.querySelector('.v-color').value,
        sku: row.querySelector('.v-sku').value,
        costPrice: parseFloat(row.querySelector('.v-cost').value || 0),
        sellPrice: parseFloat(row.querySelector('.v-sell').value || 0),
        qtyOnHand: parseInt(row.querySelector('.v-qty').value || 0, 10),
      }));
      try {
        await api('/products', {
          method: 'POST',
          body: JSON.stringify({
            name: document.getElementById('pName').value,
            category: document.getElementById('pCategory').value,
            brand: document.getElementById('pBrand').value,
            variants,
          }),
        });
        load();
      } catch (e) {
        document.getElementById('pErr').textContent = e.message;
      }
    };
  }

  load();
}

// ---------- CUSTOMERS ----------
async function renderCustomers() {
  renderShell('<div class="muted">Loading…</div>');
  const content = document.getElementById('content');

  async function load(search = '') {
    const customers = await api('/customers?search=' + encodeURIComponent(search));
    content.innerHTML = `
      <div class="card">
        <div class="row">
          <input id="search" placeholder="Search customers…" value="${search}" />
          <button id="addBtn" style="flex:0 0 auto;">+ Add Customer</button>
        </div>
      </div>
      <div class="card">
        <table><thead><tr><th>Name</th><th>Phone</th><th></th></tr></thead><tbody>
          ${customers.map((c) => `<tr><td>${c.name}</td><td>${c.phone || '-'}</td><td><span class="link" data-id="${c.id}">View</span></td></tr>`).join('') || '<tr><td colspan="3" class="muted">No customers yet.</td></tr>'}
        </tbody></table>
      </div>`;
    document.getElementById('search').oninput = (e) => load(e.target.value);
    document.getElementById('addBtn').onclick = showAddForm;
    content.querySelectorAll('.link').forEach((el) => (el.onclick = () => viewCustomer(el.dataset.id)));
  }

  function showAddForm() {
    content.innerHTML = `
      <div class="card">
        <h2>Add Customer</h2>
        <div id="cErr" class="error"></div>
        <label>Name</label><input id="cName" />
        <label>Phone</label><input id="cPhone" />
        <div class="row"><button id="saveBtn">Save</button><button class="secondary" id="cancelBtn">Cancel</button></div>
      </div>`;
    document.getElementById('cancelBtn').onclick = () => load();
    document.getElementById('saveBtn').onclick = async () => {
      try {
        await api('/customers', { method: 'POST', body: JSON.stringify({ name: document.getElementById('cName').value, phone: document.getElementById('cPhone').value }) });
        load();
      } catch (e) { document.getElementById('cErr').textContent = e.message; }
    };
  }

  async function viewCustomer(id) {
    const c = await api('/customers/' + id);
    content.innerHTML = `
      <div class="card">
        <span class="link" id="back">← Back</span>
        <h2 style="margin-top:10px;">${c.name}</h2>
        <p class="muted">${c.phone || ''}</p>
        <div class="grid">
          <div class="stat"><div class="label">Lifetime Value</div><div class="value">${fmtInr(c.lifetimeValue)}</div></div>
          <div class="stat"><div class="label">Purchases</div><div class="value">${c.totalPurchases}</div></div>
        </div>
        <h2 style="margin-top:16px;">Purchase History</h2>
        <table><thead><tr><th>Date</th><th>Total</th><th>Profit</th></tr></thead><tbody>
          ${c.purchaseHistory.map((s) => `<tr><td>${s.createdAt}</td><td>${fmtInr(s.total)}</td><td>${fmtInr(s.profit)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No purchases yet.</td></tr>'}
        </tbody></table>
      </div>`;
    document.getElementById('back').onclick = () => load();
  }

  load();
}

// ---------- POS ----------
async function renderPOS() {
  renderShell('<div class="muted">Loading…</div>');
  const content = document.getElementById('content');
  const products = await api('/products');
  const allVariants = [];
  products.forEach((p) => p.variants.forEach((v) => allVariants.push({ ...v, productName: p.name })));

  function draw() {
    const total = state.cart.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    content.innerHTML = `
      <div class="card">
        <h2>Find Product</h2>
        <input id="search" placeholder="Search by name or SKU…" />
        <div id="results"></div>
      </div>
      <div class="card">
        <h2>Cart</h2>
        <div id="cartItems">
          ${state.cart.map((i, idx) => `
            <div class="cart-item">
              <span>${i.name} × ${i.qty}</span>
              <span>${fmtInr(i.unitPrice * i.qty)} <span class="link" data-idx="${idx}">remove</span></span>
            </div>`).join('') || '<p class="muted">Cart is empty.</p>'}
        </div>
        <div class="row" style="margin-top:10px;">
          <strong>Total: ${fmtInr(total)}</strong>
        </div>
        <label style="margin-top:10px;">Customer (optional)</label>
        <select id="customerSelect"><option value="">Walk-in</option></select>
        <label>Payment Method</label>
        <select id="paymentMethod"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="credit">Credit</option></select>
        <div id="posErr" class="error"></div>
        <button id="checkoutBtn" ${state.cart.length ? '' : 'disabled'} style="width:100%;">Complete Sale</button>
      </div>`;

    document.getElementById('search').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      const matches = q ? allVariants.filter((v) => (v.productName + ' ' + (v.sku || '')).toLowerCase().includes(q)).slice(0, 8) : [];
      document.getElementById('results').innerHTML = matches.map((v) => `
        <div class="cart-item">
          <span>${v.productName} — ${v.size || ''} ${v.color || ''} <span class="muted">(${v.qtyOnHand} in stock)</span></span>
          <button class="small" data-vid="${v.id}">Add ${fmtInr(v.sellPrice)}</button>
        </div>`).join('');
      document.querySelectorAll('#results button').forEach((b) => {
        b.onclick = () => {
          const v = allVariants.find((x) => x.id == b.dataset.vid);
          const existing = state.cart.find((c) => c.variantId === v.id);
          if (existing) existing.qty += 1;
          else state.cart.push({ variantId: v.id, name: `${v.productName} ${v.size || ''} ${v.color || ''}`.trim(), qty: 1, unitPrice: v.sellPrice });
          draw();
        };
      });
    };

    content.querySelectorAll('[data-idx]').forEach((el) => (el.onclick = () => { state.cart.splice(el.dataset.idx, 1); draw(); }));

    api('/customers').then((customers) => {
      const sel = document.getElementById('customerSelect');
      customers.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        sel.appendChild(opt);
      });
    });

    document.getElementById('checkoutBtn').onclick = async () => {
      try {
        const customerId = document.getElementById('customerSelect').value || null;
        const paymentMethod = document.getElementById('paymentMethod').value;
        const result = await api('/sales', {
          method: 'POST',
          body: JSON.stringify({
            customerId,
            paymentMethod,
            items: state.cart.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          }),
        });
        state.cart = [];
        alert(`Sale complete! Total ${fmtInr(result.total)} · Profit ${fmtInr(result.profit)}`);
        nav('dashboard');
      } catch (e) {
        document.getElementById('posErr').textContent = e.message;
      }
    };
  }

  draw();
}

// ---------- ROUTER ----------
function render() {
  if (!state.token) return renderAuth();
  if (state.route === 'dashboard') return renderDashboard();
  if (state.route === 'pos') return renderPOS();
  if (state.route === 'products') return renderProducts();
  if (state.route === 'customers') return renderCustomers();
  renderDashboard();
}

render();
