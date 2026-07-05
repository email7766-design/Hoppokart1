const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken'); // JWT ke liye, agar session key ko token mein badalna ho
const db = require('./database');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

const router = express.Router();

// Global Maintenance Middleware
router.use(async (req, res, next) => {
  if (req.path.startsWith('/admin') || req.path === '/store/config') return next();
  const config = await db.getStoreConfig();
  if (!config.storeOpen) {
    if (req.accepts('html')) {
      return res.status(503).send(`
        <div style="font-family: 'Inter', -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center;">
          <div style="background: white; padding: 50px; border-radius: 32px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.08); max-width: 550px; width: 100%; border: 1px solid #e2e8f0;">
            <div style="background: #ecfdf5; width: 100px; height: 100px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 30px;">
              <span style="font-size: 45px;">🛠️</span>
            </div>
            <h1 style="color: #064e3b; font-size: 32px; font-weight: 800; margin-bottom: 15px; letter-spacing: -0.5px;">Maintenance Jari Hai</h1>
            <p style="color: #374151; font-size: 17px; line-height: 1.7; margin-bottom: 25px;">Hum website ko aur behtar bana rahe hain. Bas thodi der mein wapas aayenge!</p>
            ${config.announcement ? `
              <div style="background: #f0fdf4; padding: 20px; border-radius: 16px; margin: 30px 0; border: 1px dashed #10b981; color: #065f46; font-weight: 600;">
                ${config.announcement}
              </div>
            ` : ''}
            <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 30px 0;">
            <div style="font-weight: 800; color: #10b981; font-size: 20px; text-transform: uppercase; letter-spacing: 1px;">${BUSINESS_NAME}</div>
          </div>
        </div>
      `);
    }
    return res.status(503).json({ success: false, message: 'Store is temporarily closed for maintenance.', announcement: config.announcement });
  }
  next();
});

const BUSINESS_NAME = process.env.BUSINESS_NAME || 'Hoppokart';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ? String(process.env.ADMIN_PASSWORD).trim() : '';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'); // Production mein strong secret use karein

// Price extraction helper for sorting (moved outside route for performance)
const getNumericPrice = (p) => Number(String(p.price || '').replace(/[^0-9.]/g, '')) || 0;

// Helper to save Base64 image to disk
async function saveBase64Image(base64String, productId, index) {
  if (!base64String || !base64String.startsWith('data:image')) return base64String;

  try {
    const matches = base64String.match(/^data:image\/([A-Za-z-+/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) return base64String;

    // Check file size (e.g., limit to 5MB)
    const bufferSize = Buffer.byteLength(matches[2], 'base64');
    if (bufferSize > 5 * 1024 * 1024) throw new Error('Image size too large');

    const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = Buffer.from(matches[2], 'base64');
    const fileName = `prod_${productId}_${index}_${Date.now()}.${extension}`;
    const filePath = path.join(__dirname, 'uploads', fileName);

    await fs.promises.writeFile(filePath, data);

    // Trigger background WebP generation for this specific file (faster)
    try {
      const python = process.platform === 'win32' ? path.join(__dirname, '.venv', 'Scripts', 'python.exe') : 'python3';
      const script = path.join(__dirname, 'scripts', 'generate-webp.py');
      const target = filePath; // absolute path
      const cmd = `"${python}" "${script}" "${target}"`;
      exec(cmd, { cwd: __dirname }, (err, stdout, stderr) => {
        if (err) {
          // Fallback: try running via system python
          exec(`python "${script}" "${target}"`, { cwd: __dirname }, (e2) => {
            if (e2) console.warn('Background WebP generation failed:', e2.message);
          });
        }
      });
    } catch (e) {
      console.warn('Failed to start background webp generation:', e && e.message);
    }

    return `/uploads/${fileName}`; // Return the URL path instead of base64
  } catch (error) {
    console.error('Error saving image:', error);
    return base64String;
  }
}

async function processProductImages(product) {
  const p = { ...product };
  const keys = ['img1', 'img2', 'img3', 'img4'];
  
  const savePromises = keys.map((key, idx) => {
    if (key.startsWith('img') && p[key]) {
      return saveBase64Image(p[key], p._id || 'new', idx).then(url => p[key] = url);
    }
    return Promise.resolve();
  });

  await Promise.all(savePromises);
  return p;
}

// Admin authentication middleware
async function authenticateAdmin(req, res, next) {
  const sessionKey = req.headers['x-admin-session']; // Expect session key in header
  if (!sessionKey) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const config = await db.getStoreConfig();
    if (config.adminSessionKey === sessionKey) {
      next(); // Authenticated
    } else {
      res.status(401).json({ success: false, message: 'Invalid session key' });
    }
  } catch (error) {
    console.error('Error in admin authentication middleware:', error);
    res.status(500).json({ success: false, message: 'Server error during authentication' });
  }
}

// Email Notification Helper
async function sendEmailNotification(order) {
  try {
    const config = await db.getStoreConfig();
    if (!config.emailEnabled || !config.emailUser || !config.emailPass) {
      return; // Skip if disabled
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.emailUser,
        pass: config.emailPass // 16-digit App Password
      },
      tls: {
        rejectUnauthorized: false // VPS par certificate issues bypass karne ke liye
      }
    });

    console.log(`[Email] Attempting to send order confirmation for Order ID: ${order.id}`);

    const itemsList = (order.items || []).map(item => 
      `<li>${item.name} x ${item.quantity} - Rs ${item.price}</li>`
    ).join('');

    // Recipients list ko saaf suthra banayein (empty emails handle karne ke liye)
    const recipients = [config.emailUser];
    if (order.customer.email && order.customer.email.trim()) {
      recipients.push(order.customer.email.trim());
    }
    const toEmail = recipients.join(', ');

    const mailOptions = {
      from: `"${config.businessName || BUSINESS_NAME}" <${config.emailUser}>`,
      to: toEmail,
      subject: `Order Confirmed! - Order ID: ${order.id}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
          <div style="background: #1b8354; color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Order Confirmed!</h1>
            <p style="margin: 10px 0 0; opacity: 0.9;">Thank you for shopping with ${config.businessName || BUSINESS_NAME}</p>
          </div>
          <div style="padding: 30px; background: #ffffff;">
            <p>Hi <strong>${order.customer.name}</strong>,</p>
            <p>Your order has been received and is being processed. Here are your details:</p>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <div style="margin-bottom: 8px;"><strong>Order ID:</strong> <code style="background: #e9ecef; padding: 2px 4px; border-radius: 4px;">${order.id}</code></div>
              <div style="margin-bottom: 8px;"><strong>Total Amount:</strong> ₹${order.totalAmount} (${order.paymentMode})</div>
              <div style="margin-bottom: 8px;"><strong>Delivery to:</strong> ${order.customer.address}, ${order.customer.city}</div>
            </div>
            <h3 style="color: #333; border-bottom: 1px solid #eee; padding-bottom: 10px;">Items Ordered</h3>
            <ul style="list-style: none; padding: 0;">${itemsList}</ul>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 13px; color: #666; text-align: center;">
              <p>Questions? Contact us on WhatsApp: <strong>${config.storeWhatsappNumber || 'Support'}</strong></p>
              <p>&copy; ${new Date().getFullYear()} ${config.businessName || BUSINESS_NAME}</p>
            </div>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`[Email Success] Order notification sent to: ${toEmail}`);
  } catch (error) {
    console.error('[Email Error] Failed to send email:', error.message);
  }
}

function createOrderRef() {
  return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function getPaymentCredentials() {
  const stored = await db.getPaymentConfig().catch(() => ({}));
  return {
    razorpayKeyId: String(stored.razorpayKeyId || process.env.RAZORPAY_KEY_ID || '').trim(),
    razorpayKeySecret: String(stored.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || '').trim(),
    businessName: String(stored.businessName || process.env.BUSINESS_NAME || BUSINESS_NAME).trim() || BUSINESS_NAME
  };
}

async function createRazorpayOrder(amount, keyId, keySecret, businessName) {
  const url = 'https://api.razorpay.com/v1/orders';
  console.log(`[Razorpay] Creating order for Rs ${amount}...`);
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: Math.round(amount * 100),
      currency: 'INR',
      payment_capture: 1,
      receipt: createOrderRef(),
      notes: { store: businessName }
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Razorpay] API Error: ${errorText}`);
    throw new Error(`Razorpay create order failed: ${errorText}`);
  }
  return response.json();
}

router.post('/admin/login', async (req, res) => {
  const password = String(req.body.password || '').trim();
  const config = await db.getStoreConfig(); // Get config which now includes hashed password and salt
  const storedHash = config.adminPasswordHash;
  const storedSalt = config.adminPasswordSalt;
  const storedPlain = String(config.adminPassword || '').trim();

  // Agar DB mein hash password set nahi hai, toh plain text config / ENV se fallback karein.
  const fallbackPassword = (storedHash && storedHash.length > 0) ? null : (storedPlain || ADMIN_PASSWORD);

  console.log(`[Admin Login] Attempt for user. Hash exists: ${!!storedHash}`);

  // Generate a new session key on successful login
  const sessionKey = crypto.randomBytes(16).toString('hex');

  // Special case: Agar hash nahi hai aur .env mein bhi password nahi hai
  if (!storedHash && !fallbackPassword) {
    console.error('[Admin Login] Critical: No admin password set in .env or config!');
    return res.status(500).json({ 
      success: false, 
      message: 'Server configuration error: Admin password not set. Please check .env file.' 
    });
  }

  if (!storedHash && password === fallbackPassword) {
    console.log('[Admin Login] First time login successful. Hashing password...');
    const { hash, salt } = db.hashPassword(password);
    await db.saveStoreConfig({
      ...config,
      adminPasswordHash: hash,
      adminPasswordSalt: salt,
      adminPassword: '',
      adminSessionKey: sessionKey
    });
  } else if (!storedHash || !db.verifyPassword(password, storedHash, storedSalt)) {
    console.warn('[Admin Login] Login failed: Invalid password');
    return res.status(401).json({ success: false, message: 'Invalid admin password' });
  } else {
    console.log('[Admin Login] Login successful via hash verification');
    await db.saveStoreConfig({ ...config, adminSessionKey: sessionKey });
  }

  res.json({ success: true, sessionKey });
});

router.post('/admin/logout-all', authenticateAdmin, async (req, res) => {
  try {
    const config = await db.getStoreConfig();
    const newKey = crypto.randomBytes(16).toString('hex');
    await db.saveStoreConfig({ ...config, adminSessionKey: newKey });
    res.json({ success: true, message: 'Logged out from all devices successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/admin/change-password', authenticateAdmin, async (req, res) => {
  try {
    console.log('[Admin] Password change request received:', req.body);
    const oldPassword = String(req.body.oldPassword || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!newPassword || newPassword.length < 4) {
      console.log('[Admin] Validation failed: Password too short');
      return res.status(400).json({ success: false, message: 'New password must be at least 4 characters long' });
    }

    const config = await db.getStoreConfig(); // Get current hashed password and salt
    const currentHash = config.adminPasswordHash;
    const currentSalt = config.adminPasswordSalt;
    const currentPlain = String(config.adminPassword || '').trim();

    // Agar DB mein password set nahi hai, toh plain text config / ENV se fallback karein (initial setup ke liye)
    const fallbackPassword = currentHash ? null : (currentPlain || ADMIN_PASSWORD);

    // Purana password verify karein
    if (!currentHash && oldPassword === fallbackPassword) {
      // Initial change from ENV/plain password
    } else if (!currentHash || !db.verifyPassword(oldPassword, currentHash, currentSalt)) {
      console.error(`[Admin] Password change failed: Old password mismatch`);
      return res.status(401).json({ success: false, message: 'Old password is incorrect' });
    }

    const { hash, salt } = db.hashPassword(newPassword);
    await db.saveStoreConfig({
      ...config,
      adminPasswordHash: hash,
      adminPasswordSalt: salt,
      adminPassword: ''
    });
    console.log(`[Admin] Password changed successfully`);
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('[Admin] Server Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/products', async (req, res) => { // Public endpoint for storefront with pagination
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 20)); // Max 20 per page
    const category = req.query.category;
    const sort = req.query.sort || 'newest';
    
    let products = await db.getProducts();
    products = Array.isArray(products) ? [...products] : [];

    // Apply Sorting before filtering/pagination
    if (sort === 'price-asc') {
      products.sort((a, b) => getNumericPrice(a) - getNumericPrice(b));
    } else if (sort === 'price-desc') {
      products.sort((a, b) => getNumericPrice(b) - getNumericPrice(a));
    } else {
      products.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    if (category && category !== 'All') {
      products = products.filter(p => p.category === category);
    }

    const total = products.length;
    const startIdx = (page - 1) * limit;
    const paginatedProducts = products.slice(startIdx, startIdx + limit);
    
    // Cache each page separately - pagination shouldn't use a global cache
    res.set('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes, not 10
    res.json({ 
      success: true, 
      products: paginatedProducts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: startIdx + limit < total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/product/:id', async (req, res) => { // Public endpoint for single product
  try {
    const products = await db.getProducts();
    const product = products.find(p => String(p._id) === req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/categories', async (req, res) => { // Public endpoint for storefront
  try {
    const categories = await db.getCategories();
    res.json({ success: true, categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/categories', authenticateAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Category name required' });
    const added = await db.addCategory(name);
    res.json({ success: true, category: added });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/categories/:name', authenticateAdmin, async (req, res) => {
  try {
    await db.deleteCategory(decodeURIComponent(req.params.name));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/products', authenticateAdmin, async (req, res) => {
  try {
    const product = req.body;
    if (!product || !product.name || !product.price) {
      return res.status(400).json({ success: false, message: 'Product name and price are required' });
    }
    const processedProduct = await processProductImages(product);
    const created = await db.addProduct(processedProduct);
    res.json({ success: true, product: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const processedProduct = await processProductImages({ ...req.body, _id: req.params.id });
    const product = await db.updateProduct(req.params.id, processedProduct);
    res.json({ success: true, product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/products/:id', authenticateAdmin, async (req, res) => {
  try {
    await db.deleteProduct(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/payment/config', async (req, res) => {
  try {
    const payment = await getPaymentCredentials();
    const enabled = Boolean(payment.razorpayKeyId && payment.razorpayKeySecret);
    res.json({
      success: true,
      enabled,
      keyId: payment.razorpayKeyId,
      businessName: payment.businessName
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/payment/config', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const keyId = String(body.keyId || '').trim();
    const keySecret = String(body.keySecret || '').trim();
    const businessName = String(body.businessName || BUSINESS_NAME).trim() || BUSINESS_NAME;
    await db.savePaymentConfig({ razorpayKeyId: keyId, razorpayKeySecret: keySecret, businessName });
    res.json({ success: true, config: { keyId, businessName } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ── Coupon APIs ── */
router.get('/coupons', async (req, res) => {
  try {
    const coupons = await db.getCoupons();
    res.json({ success: true, coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/coupons', authenticateAdmin, async (req, res) => {
  try {
    const added = await db.addCoupon(req.body);
    res.json({ success: true, coupon: added });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/coupons/:code', authenticateAdmin, async (req, res) => {
  try {
    await db.deleteCoupon(req.params.code);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/checkout', async (req, res) => {
  try {
    const payload = req.body || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const customer = payload.customer || {};
    const paymentMode = String(payload.paymentMode || 'COD').toUpperCase();
    const totalAmount = Number(payload.totalAmount || 0);
    const source = String(payload.source || req.headers.referer || 'direct').trim();
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    const userAgent = String(req.headers['user-agent'] || '').trim();

    // Robust Validation
    if (!customer.name?.trim() || !customer.phone?.trim() || !customer.address?.trim() || !customer.city?.trim()) {
      return res.status(400).json({ success: false, message: 'Please fill all required customer details.' });
    }
    if (!/^\d{10,15}$/.test(customer.phone.replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
    }
    if (!items.length) {
      return res.status(400).json({ success: false, message: 'Your cart is empty.' });
    }
    if (totalAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order amount.' });
    }

    const config = await db.getStoreConfig();
    const whatsappNumber = config.storeWhatsappNumber || '';

    function generateWhatsAppLink(orderId, amount) {
      if (!whatsappNumber) return '';
      const msg = `Hello ${config.businessName || BUSINESS_NAME}, I just placed an order!\n\nOrder ID: ${orderId}\nTotal: Rs ${amount}\n\nPlease confirm my order.`;
      return `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    }

    const orderRef = createOrderRef();
    const baseOrder = {
      customer,
      items: items.map(it => ({ ...it, price: Number(it.price), quantity: Number(it.quantity) })),
      paymentMode,
      totalAmount,
      couponCode: payload.couponCode || null,
      discountAmount: Number(payload.discountAmount || 0),
      orderRef,
      status: paymentMode === 'COD' ? 'created' : 'pending',
      source,
      ip,
      userAgent,
      meta: {}
    };

    if (paymentMode === 'RAZORPAY') {
      const payment = await getPaymentCredentials();
      if (!payment.razorpayKeyId || !payment.razorpayKeySecret) {
        return res.status(400).json({ success: false, message: 'Online payment is not configured' });
      }
      // Razorpay order creation
      const razorpayOrder = await createRazorpayOrder(totalAmount, payment.razorpayKeyId, payment.razorpayKeySecret, payment.businessName);
      baseOrder.meta.razorpayOrderId = razorpayOrder.id;
      baseOrder.meta.razorpayReceipt = razorpayOrder.receipt;
      const saved = await db.addOrder({ ...baseOrder, status: 'pending' });
      return res.json({
        success: true,
        order: saved,
        orderId: saved.id,
        orderRef: saved.orderRef,
        whatsappUrl: generateWhatsAppLink(saved.id, saved.totalAmount),
        razorpayKeyId: payment.razorpayKeyId,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency
        }
      });
    }

    const saved = await db.addOrder(baseOrder);
    
    // Send Email notification for COD
    if (paymentMode === 'COD') {
      sendEmailNotification(saved).catch(err => console.error("Email Error:", err));
    }

    res.json({ 
      success: true, 
      order: saved, 
      orderId: saved.id,
      orderRef: saved.orderRef,
      whatsappUrl: generateWhatsAppLink(saved.id, saved.totalAmount)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ── Public Order Tracking API ── */
router.get('/track/order/:id', async (req, res) => {
  try {
    const orderId = decodeURIComponent(req.params.id);
    const order = await db.getOrderById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order details nahi mile.' });
    }
    const config = await db.getStoreConfig();
    const msg = `Hello, I am tracking my order: ${order.id}`;
    const whatsappUrl = config.storeWhatsappNumber ? `https://wa.me/${config.storeWhatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}` : '';

    const safeOrder = {
      id: order.id,
      orderRef: order.orderRef,
      status: order.status,
      totalAmount: order.totalAmount,
      items: order.items || [], // Added items for WhatsApp message compatibility
      customerName: order.customer.name,
      createdAt: order.createdAt,
      timeline: order.timeline || [],
      whatsappUrl: whatsappUrl
    };
    res.json({ success: true, order: safeOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/payment/verify', async (req, res) => {
  try {
    const { orderRef, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
    if (!orderRef || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
    }
    const payment = await getPaymentCredentials();
    if (!payment.razorpayKeySecret) {
      return res.status(400).json({ success: false, message: 'Payment secret not configured' });
    }

    const payload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expected = crypto.createHmac('sha256', payment.razorpayKeySecret).update(payload).digest('hex');
    if (expected !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid Razorpay signature' });
    }

    const order = await db.getOrderById(orderRef);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const updated = await db.updateOrder(order.id, {
      status: 'paid',
      paymentId: razorpay_payment_id,
      meta: {
        ...order.meta,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id
      }
    });

    // Regenerate whatsappUrl for the response as it's not stored in DB
    const config = await db.getStoreConfig();
    const whatsappNumber = config.storeWhatsappNumber || '';
    function generateWhatsAppLink(orderId, amount) {
      if (!whatsappNumber) return '';
      const msg = `Hello ${config.businessName || BUSINESS_NAME}, I just placed an order!\n\nOrder ID: ${orderId}\nTotal: Rs ${amount}\n\nPlease confirm my order.`;
      return `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
    }
    const whatsappUrl = generateWhatsAppLink(updated.id, updated.totalAmount);

    sendEmailNotification(updated).catch(err => console.error("Email Error:", err)); // This uses the updated order, not the one with whatsappUrl

    res.json({ success: true, order: updated, whatsappUrl: whatsappUrl });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/payment/cancel', async (req, res) => {
  try {
    const { orderRef, reason } = req.body || {};
    if (!orderRef) {
      return res.status(400).json({ success: false, message: 'Order reference required' });
    }
    const order = await db.getOrderById(orderRef);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const updated = await db.updateOrder(order.id, {
      status: 'cancelled',
      meta: {
        ...order.meta,
        cancelledReason: String(reason || 'cancelled'),
        cancelledAt: new Date().toISOString()
      }
    });
    res.json({ success: true, order: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ── Admin Orders APIs ── */
router.get('/orders', authenticateAdmin, async (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
      search: req.query.search,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir
    };
    const orders = await db.getOrders(filters);
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const order = await db.getOrderById(decodeURIComponent(req.params.id));
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/orders/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status, note } = req.body || {};
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }
    const order = await db.getOrderById(decodeURIComponent(req.params.id));
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    const updated = await db.updateOrder(order.id || req.params.id, {
      status,
      statusNote: note,
      updatedBy: 'admin'
    });
    res.json({ success: true, order: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const deleted = await db.deleteOrder(decodeURIComponent(req.params.id));
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ── Store Config APIs ── */
router.get('/store/config', async (req, res) => { // This endpoint is called by admin.html, but also potentially by public pages if needed.
                                                  // It should not expose sensitive admin credentials.
  try {
    const config = await db.getStoreConfig();
    // Security: Remove sensitive fields before sending to client
    const clientConfig = { ...config };
    delete clientConfig.adminPassword;
    delete clientConfig.adminPasswordHash;
    delete clientConfig.adminPasswordSalt;
    delete clientConfig.adminSessionKey;
    res.json({ success: true, config: clientConfig });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// New endpoint to check admin session validity from client-side
router.get('/admin/check-session', async (req, res) => {
  const sessionKey = req.headers['x-admin-session'];
  if (!sessionKey) {
    return res.json({ success: false, message: 'No session key provided' });
  }
  try {
    const config = await db.getStoreConfig();
    res.json({ success: config.adminSessionKey === sessionKey });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/* ── Test Email API ── */
router.post('/admin/test-email', authenticateAdmin, async (req, res) => {
  try {
    const mockOrder = {
      id: 'TEST_12345',
      totalAmount: 999,
      paymentMode: 'TEST',
      customer: { name: 'Test User', phone: '0000000000', address: 'Test Street', city: 'Test City', email: '' },
      items: [{ name: 'Sample Product', quantity: 1, price: 999 }]
    };
    
    await sendEmailNotification(mockOrder);
    res.json({ success: true, message: 'Test email process complete. Check server logs for details.' });
  } catch (error) {
    console.error('[Admin] Test Email Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/store/config', authenticateAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const config = await db.saveStoreConfig({
      storeOpen: body.storeOpen === true || body.storeOpen === 'true',
      announcement: String(body.announcement || ''),
      heroVideoEnabled: body.heroVideoEnabled === true || body.heroVideoEnabled === 'true',
      businessName: String(body.businessName || ''),
      heroBannerText: String(body.heroBannerText || ''),
      customVideoUrl: String(body.customVideoUrl || ''),
      storeWhatsappNumber: String(body.storeWhatsappNumber || ''),
      emailEnabled: body.emailEnabled === true || body.emailEnabled === 'true',
      emailUser: String(body.emailUser || '').trim(),
      emailPass: String(body.emailPass || '').trim()
    });
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ── Admin Analytics API ── */
router.get('/admin/analytics', authenticateAdmin, async (req, res) => {
  try {
    const analytics = await db.getOrderAnalytics();
    res.json({ success: true, analytics });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/* ── SEO APIs ── */
// Dynamic Sitemap for search engines
router.get('/sitemap.xml', async (req, res) => {
  try {
    const products = await db.getProducts();
    const host = req.protocol + '://' + req.get('host');
    
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    // Home page
    xml += '  <url>\n';
    xml += `    <loc>${host}/</loc>\n`;
    xml += '    <priority>1.0</priority>\n';
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '  </url>\n';
    
    // Product pages
    products.forEach(product => {
      xml += '  <url>\n';
      xml += `    <loc>${host}/product.html?id=${encodeURIComponent(product._id)}</loc>\n`;
      xml += '    <priority>0.8</priority>\n';
      xml += '    <changefreq>weekly</changefreq>\n';
      xml += '  </url>\n';
    });
    
    // Static pages
    ['track.html'].forEach(page => {
      xml += '  <url>\n';
      xml += `    <loc>${host}/${page}</loc>\n`;
      xml += '    <priority>0.7</priority>\n';
      xml += '    <changefreq>monthly</changefreq>\n';
      xml += '  </url>\n';
    });
    
    xml += '</urlset>';
    
    res.type('application/xml');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(xml);
  } catch (error) {
    res.type('application/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

// Product schema data for SEO
router.get('/api/product/:id/schema', async (req, res) => {
  try {
    const products = await db.getProducts();
    const product = products.find(p => p._id === req.params.id);
    
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    const images = [product.img1, product.img2, product.img3, product.img4].filter(Boolean);
    
    const schema = {
      '@context': 'https://schema.org/',
      '@type': 'Product',
      name: product.name || 'Product',
      description: product.description || '',
      image: images.length > 0 ? images : [],
      brand: {
        '@type': 'Brand',
        name: 'Hoppokart'
      },
      offers: {
        '@type': 'Offer',
        url: req.protocol + '://' + req.get('host') + '/product.html?id=' + encodeURIComponent(product._id),
        priceCurrency: 'INR',
        price: String(product.price || 0).replace(/[^0-9.]/g, ''),
        availability: 'https://schema.org/InStock'
      },
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: '4.5',
        reviewCount: '150'
      }
    };
    
    res.json(schema);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Store schema for organization
router.get('/api/schema/organization', async (req, res) => {
  try {
    const config = await db.getStoreConfig();
    const host = req.protocol + '://' + req.get('host');
    
    const schema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: config.businessName || 'Hoppokart',
      url: host,
      logo: host + '/favicon.png',
      description: 'Quality Products Online Store',
      sameAs: []
    };
    
    res.json(schema);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
