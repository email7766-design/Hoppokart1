const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'database');

const FILES = {
  products: path.join(DATA_DIR, 'products.json'),
  categories: path.join(DATA_DIR, 'categories.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  payment: path.join(DATA_DIR, 'payment.json'),
  config: path.join(DATA_DIR, 'config.json'),
  coupons: path.join(DATA_DIR, 'coupons.json')
};
const PRODUCT_IMAGE_KEYS = ['img1', 'img2', 'img3', 'img4'];
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PASSWORD_CONFIG = {
  saltLength: 16, // bytes
};

// Basic in-memory cache to prevent constant disk I/O
const cache = {
  products: null,
  categories: null,
  config: null,
  coupons: null,
  payment: null,
  orders: null
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    try {
      // Server par permission issues se bachne ke liye recursive mkdir
      fs.mkdirSync(DATA_DIR, { 
        recursive: true, 
        mode: 0o775 
      });
    } catch (err) {
      console.error("Critical: Could not create database directory", err);
    }
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    try {
      fs.mkdirSync(UPLOADS_DIR, {
        recursive: true,
        mode: 0o775
      });
    } catch (err) {
      console.error("Critical: Could not create uploads directory", err);
    }
  }
}

function readJson(filePath, defaultValue) {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
    return defaultValue;
  }
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data ? JSON.parse(data) : defaultValue;
  } catch (_e) {
    return defaultValue;
  }
}

function writeJson(filePath, data) {
  ensureDir();
  try {
    // Atomic-like write: Pehle stringify karein phir likhein taaki partial data write na ho
    const content = JSON.stringify(data, null, 2);
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Failed to write to ${filePath}:`, err);
    throw new Error('Database write operation failed');
  }
}

function generateId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function unwrapCollection(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function persistEmbeddedImage(base64String, productId, imageKey) {
  if (!base64String || typeof base64String !== 'string' || !base64String.startsWith('data:image/')) {
    return base64String;
  }

  const matches = base64String.match(/^data:image\/([A-Za-z0-9+.-]+);base64,(.+)$/);
  if (!matches) return base64String;

  try {
    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace(/[^a-z0-9]/gi, '').toLowerCase();
    const data = Buffer.from(matches[2], 'base64');
    const safeProductId = String(productId || generateId()).replace(/[^a-z0-9_-]/gi, '_');
    const fileName = `prod_${safeProductId}_${imageKey}.${extension || 'jpg'}`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    fs.writeFileSync(filePath, data);
    return `/uploads/${fileName}`;
  } catch (error) {
    console.error('Failed to persist embedded product image', error);
    return base64String;
  }
}

function migrateEmbeddedProductImages(products) {
  let changed = false;
  const migratedProducts = products.map((product) => {
    let nextProduct = product;

    PRODUCT_IMAGE_KEYS.forEach((key) => {
      const currentValue = product?.[key];
      if (typeof currentValue === 'string' && currentValue.startsWith('data:image/')) {
        const persistedPath = persistEmbeddedImage(currentValue, product?._id, key);
        if (persistedPath !== currentValue) {
          if (nextProduct === product) nextProduct = { ...product };
          nextProduct[key] = persistedPath;
          changed = true;
        }
      }
    });

    return nextProduct;
  });

  return { products: migratedProducts, changed };
}

// Initial Load to warm up cache
async function initDatabase() {
  ensureDir();
  await getProducts();
  await getCategories();
  await getStoreConfig();
  console.log('📦 Database Cache Initialized');
}
initDatabase().catch(console.error);

/* ── Products ── */
async function getProducts() {
  if (cache.products) return cache.products;
  const data = readJson(FILES.products, { products: [] });
  const products = unwrapCollection(data, 'products');
  
  // Process migration only if needed and update cache
  const { products: migratedProducts, changed } = migrateEmbeddedProductImages(products);
  if (changed) {
    writeJson(FILES.products, { products: migratedProducts });
  }
  cache.products = migratedProducts;
  return cache.products;
}

async function getCategories() {
  if (cache.categories) return cache.categories;
  const data = readJson(FILES.categories, []);
  cache.categories = Array.isArray(data) ? data : (data.categories || []);
  return cache.categories;
}

async function addCategory(name) {
  const categories = await getCategories();
  if (categories.includes(name)) throw new Error('Category already exists');
  categories.push(name);
  writeJson(FILES.categories, categories);
  cache.categories = categories;
  return name;
}

async function deleteCategory(name) {
  const categories = await getCategories();
  const filtered = categories.filter(c => c !== name);
  writeJson(FILES.categories, filtered);
  cache.categories = filtered;
}

async function addProduct(product) {
  const data = readJson(FILES.products, { products: [] });
  const products = unwrapCollection(data, 'products');
  const newProduct = { ...product, _id: product._id || generateId() };
  products.push(newProduct);
  writeJson(FILES.products, { products });
  cache.products = products;
  return newProduct;
}

async function updateProduct(id, updates) {
  const data = readJson(FILES.products, { products: [] });
  const products = unwrapCollection(data, 'products');
  const index = products.findIndex((p) => p._id === id);
  if (index === -1) {
    const added = await addProduct({ ...updates, _id: id });
    return added;
  }
  products[index] = { ...products[index], ...updates, _id: id };
  writeJson(FILES.products, { products });
  cache.products = products;
  return products[index];
}

async function deleteProduct(id) {
  const data = readJson(FILES.products, { products: [] });
  const products = unwrapCollection(data, 'products');
  const filtered = products.filter((p) => p._id !== id);
  writeJson(FILES.products, { products: filtered });
  cache.products = filtered;
}

/* ── Payment Config ── */
async function getPaymentConfig() {
  if (cache.payment) return cache.payment;
  const data = readJson(FILES.payment, {});
  cache.payment = {
    razorpayKeyId: data.razorpayKeyId || '',
    razorpayKeySecret: data.razorpayKeySecret || '',
    businessName: data.businessName || 'Hoppokart'
  };
  return cache.payment;
}

async function savePaymentConfig(config) {
  const data = readJson(FILES.payment, {});
  data.razorpayKeyId = config.razorpayKeyId || '';
  data.razorpayKeySecret = config.razorpayKeySecret || '';
  data.businessName = config.businessName || 'Hoppokart';
  writeJson(FILES.payment, data);
  cache.payment = data;
}

/* ── Coupons ── */
async function getCoupons() {
  if (cache.coupons) return cache.coupons;
  const data = readJson(FILES.coupons, []);
  cache.coupons = Array.isArray(data) ? data : [];
  return cache.coupons;
}

async function addCoupon(coupon) {
  const coupons = await getCoupons();
  if (coupons.find(c => c.code === coupon.code)) throw new Error('Coupon code already exists');
  coupons.push(coupon);
  writeJson(FILES.coupons, coupons);
  cache.coupons = coupons;
  return coupon;
}

async function deleteCoupon(code) {
  const coupons = await getCoupons();
  const filtered = coupons.filter(c => c.code !== code);
  writeJson(FILES.coupons, filtered);
  cache.coupons = filtered;
  return true;
}

/* ── Orders ── */
async function getOrders(filters = {}) {
  const data = readJson(FILES.orders, { orders: [] });
  let orders = unwrapCollection(data, 'orders');

  if (filters.status) {
    orders = orders.filter((o) => String(o.status || '').toLowerCase() === String(filters.status).toLowerCase());
  }
  if (filters.from) {
    const fromDate = new Date(filters.from).getTime();
    orders = orders.filter((o) => new Date(o.createdAt || 0).getTime() >= fromDate);
  }
  if (filters.to) {
    const toDate = new Date(filters.to).getTime();
    orders = orders.filter((o) => new Date(o.createdAt || 0).getTime() <= toDate);
  }
  if (filters.search) {
    const q = String(filters.search).toLowerCase();
    orders = orders.filter((o) =>
      (o.orderRef && String(o.orderRef).toLowerCase().includes(q)) ||
      (o.id && String(o.id).toLowerCase().includes(q)) ||
      (o.customer?.name && String(o.customer.name).toLowerCase().includes(q)) ||
      (o.customer?.phone && String(o.customer.phone).toLowerCase().includes(q)) ||
      (o.customer?.city && String(o.customer.city).toLowerCase().includes(q))
    );
  }

  const sortField = filters.sortBy || 'createdAt';
  const sortDir = filters.sortDir === 'asc' ? 1 : -1;
  orders.sort((a, b) => {
    const av = a[sortField] || '';
    const bv = b[sortField] || '';
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv)) * sortDir;
  });

  return orders;
}

async function addOrder(order) {
  const data = readJson(FILES.orders, { orders: [] });
  const orders = unwrapCollection(data, 'orders');
  const now = new Date().toISOString();
  const newOrder = {
    ...order,
    id: order.id || generateId(),
    createdAt: order.createdAt || now,
    updatedAt: now,
    timeline: [
      {
        status: order.status || 'created',
        note: 'Order placed',
        timestamp: now,
        updatedBy: 'system'
      }
    ]
  };
  orders.push(newOrder);
  writeJson(FILES.orders, { orders });
  cache.orders = orders;
  return newOrder;
}

async function getOrderById(id) {
  const data = readJson(FILES.orders, { orders: [] });
  const orders = unwrapCollection(data, 'orders');
  return orders.find((o) => o.id === id || o.orderRef === id) || null;
}

async function updateOrder(id, updates) {
  const data = readJson(FILES.orders, { orders: [] });
  const orders = unwrapCollection(data, 'orders');
  const index = orders.findIndex((o) => o.id === id || o.orderRef === id);
  if (index === -1) return null;

  const now = new Date().toISOString();
  const existing = orders[index];
  const newStatus = updates.status;
  const timeline = Array.isArray(existing.timeline) ? existing.timeline : [];

  if (newStatus && newStatus !== existing.status) {
    timeline.push({
      status: newStatus,
      note: updates.statusNote || `Status changed to ${newStatus}`,
      timestamp: now,
      updatedBy: updates.updatedBy || 'admin'
    });
  }

  orders[index] = {
    ...existing,
    ...updates,
    timeline,
    updatedAt: now
  };
  writeJson(FILES.orders, { orders });
  cache.orders = orders;
  return orders[index];
}

async function deleteOrder(id) {
  const data = readJson(FILES.orders, { orders: [] });
  const orders = unwrapCollection(data, 'orders');
  const initialLength = orders.length;
  const filtered = orders.filter((o) => o.id !== id && o.orderRef !== id);
  if (filtered.length !== initialLength) {
    writeJson(FILES.orders, { orders: filtered });
    cache.orders = filtered;
    return true;
  }
  return false;
}

/* ── Store Config ── */
async function getStoreConfig() {
  if (cache.config) return cache.config;
  const data = readJson(FILES.config, {});
  cache.config = {
    storeOpen: data.storeOpen !== false,
    announcement: String(data.announcement || ''),
    heroVideoEnabled: data.heroVideoEnabled !== false,
    businessName: String(data.businessName || 'Hoppokart'),
    heroBannerText: String(data.heroBannerText || ''),
    customVideoUrl: String(data.customVideoUrl || ''),
    storeWhatsappNumber: String(data.storeWhatsappNumber || ''),
    emailEnabled: Boolean(data.emailEnabled),
    emailUser: String(data.emailUser || ''),
    emailPass: String(data.emailPass || ''), // This is an app password, not user password
    adminPassword: String(data.adminPassword || ''),
    adminPasswordHash: String(data.adminPasswordHash || ''),
    adminPasswordSalt: String(data.adminPasswordSalt || ''),
    adminSessionKey: String(data.adminSessionKey || '')
  };
  return cache.config;
}

async function saveStoreConfig(config) {
  const data = readJson(FILES.config, {});
  if (typeof config.storeOpen === 'boolean') data.storeOpen = config.storeOpen;
  if (typeof config.announcement === 'string') data.announcement = config.announcement;
  if (typeof config.heroVideoEnabled === 'boolean') data.heroVideoEnabled = config.heroVideoEnabled;
  if (typeof config.businessName === 'string') data.businessName = config.businessName;
  if (typeof config.heroBannerText === 'string') data.heroBannerText = config.heroBannerText;
  if (typeof config.customVideoUrl === 'string') data.customVideoUrl = config.customVideoUrl;
  if (typeof config.storeWhatsappNumber === 'string') data.storeWhatsappNumber = config.storeWhatsappNumber;
  if (typeof config.emailEnabled === 'boolean') data.emailEnabled = config.emailEnabled;
  if (typeof config.emailUser === 'string') data.emailUser = config.emailUser;
  if (typeof config.emailPass === 'string') data.emailPass = config.emailPass; // App password
  if ('adminPassword' in config) {
    if (typeof config.adminPassword === 'string' && config.adminPassword !== '') {
      data.adminPassword = config.adminPassword;
    } else {
      delete data.adminPassword;
    }
  }
  if (typeof config.adminPasswordHash === 'string') data.adminPasswordHash = config.adminPasswordHash;
  if (typeof config.adminPasswordSalt === 'string') data.adminPasswordSalt = config.adminPasswordSalt;
  if (typeof config.adminSessionKey === 'string') data.adminSessionKey = config.adminSessionKey;
  writeJson(FILES.config, data);
  cache.config = data;
  return data;
}

/* ── Analytics ── */
async function getOrderAnalytics() {
  const data = readJson(FILES.orders, { orders: [] });
  const orders = unwrapCollection(data, 'orders');

  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  const statusCounts = {};
  const paymentModeCounts = {};
  const dailyRevenue = {};
  const productCounts = {};

  orders.forEach((o) => {
    const status = String(o.status || 'created').toLowerCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const mode = String(o.paymentMode || 'COD').toUpperCase();
    paymentModeCounts[mode] = (paymentModeCounts[mode] || 0) + 1;

    let date;
    try {
      date = new Date(o.createdAt).toISOString().split('T')[0];
    } catch (e) {
      date = new Date().toISOString().split('T')[0];
    }
    
    dailyRevenue[date] = (dailyRevenue[date] || 0) + Number(o.totalAmount || 0);

    (o.items || []).forEach((item) => {
      const name = String(item.name || 'Unknown').trim();
      productCounts[name] = (productCounts[name] || 0) + (Number(item.quantity) || 1);
    });
  });

  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const last30Days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    last30Days.push({ date: dateStr, revenue: dailyRevenue[dateStr] || 0 });
  }

  return {
    totalOrders,
    totalRevenue,
    statusCounts,
    paymentModeCounts,
    dailyRevenue: last30Days,
    topProducts
  };
}

/* ── Password Hashing ── */
function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_CONFIG.saltLength).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  if (!password || !hash || !salt) return false;
  const hashedPassword = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === hashedPassword;
}


module.exports = {
  getProducts,
  addProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  addCategory,
  deleteCategory,
  getPaymentConfig,
  savePaymentConfig,
  getOrders,
  addOrder,
  getOrderById,
  updateOrder,
  deleteOrder,
  getStoreConfig,
  saveStoreConfig,
  getOrderAnalytics,
  getCoupons,
  addCoupon,
  deleteCoupon,
  hashPassword,
  verifyPassword
};
