const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const apiRoutes = require('./api-routes');
const compression = require('compression');
const fs = require('fs');
const zlib = require('zlib');
const helmet = require('helmet');
const morgan = require('morgan');
const os = require('os');
const mcache = require('memory-cache');

dotenv.config();

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(ROOT, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Ensure logs directory exists to prevent morgan crash
const LOGS_DIR = path.join(ROOT, 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Pre-generate Brotli versions of static HTML/CSS files for faster delivery
const staticCompressExtensions = ['.html', '.css'];
fs.readdirSync(ROOT).forEach((fileName) => {
  const filePath = path.join(ROOT, fileName);
  if (!staticCompressExtensions.includes(path.extname(fileName))) return;
  const brotliPath = `${filePath}.br`;
  try {
    const fileStat = fs.statSync(filePath);
    const needsCompress = !fs.existsSync(brotliPath) || fs.statSync(brotliPath).mtimeMs < fileStat.mtimeMs;
    if (needsCompress) {
      const source = fs.readFileSync(filePath);
      const compressed = zlib.brotliCompressSync(source, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        }
      });
      fs.writeFileSync(brotliPath, compressed);
    }
  } catch (err) {
    console.warn(`Brotli generation skipped for ${fileName}:`, err.message);
  }
});

// VPS hosting (Nginx) par customer ka sahi IP lene ke liye
app.set('trust proxy', 1);

// Gzip compression for faster loading
app.use(compression({ level: 6, threshold: 0 }));

// Server-side EJS template caching middleware
const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = '__express__' + req.originalUrl || req.url;
    const cachedBody = mcache.get(key);

    if (cachedBody) {
      res.send(cachedBody);
      return;
    } else {
      res.sendResponse = res.send;
      res.send = (body) => {
        // Only cache successful HTML responses
        if (res.statusCode === 200 && res.getHeader('Content-Type').includes('text/html')) {
          mcache.put(key, body, duration * 1000);
        }
        res.sendResponse(body);
      };
      next();
    }
  };
};


// Professional Security Headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"], // Only allow content from our own domain
      "script-src": ["'self'"], // Only allow scripts from our own domain
      "style-src": ["'self'"], // Only allow stylesheets from our own domain
      "img-src": ["'self'", "data:"], // "data:" is needed for base64 images if any.
      // If you load fonts or scripts from other domains (e.g., Google Fonts), add them here.
      // "font-src": ["'self'", "https://fonts.gstatic.com"],
    }
  }
}));

// HTTP Request Logging (Production standard)
app.use(morgan('combined', {
  stream: fs.createWriteStream(path.join(__dirname, 'logs', 'access.log'), { flags: 'a' }),
  skip: (req, res) => req.url.includes('/uploads/') // Don't log static image requests
}));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev')); // Console log only in development
}

// Clean URLs: .html extension ko remove karne ke liye redirect middleware
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    const newPath = req.path.replace(/\.html$/, '');
    const finalPath = newPath === '/index' ? '/' : newPath;
    const query = req.url.substring(req.path.length);
    return res.redirect(301, finalPath + query);
  }
  next();
});

// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/api', apiRoutes);

// Prevent direct access to sensitive files and database folder
app.use('/database', (req, res) => res.status(403).json({ success: false, message: 'Access Denied' }));

// Better protection for system files using a regex or more comprehensive list
const sensitiveFileRegex = /^\/(.env|package(-lock)?\.json|server\.js|api-routes\.js|database\.js|\.git)/;
app.use((req, res, next) => {
  if (sensitiveFileRegex.test(req.path)) {
    return res.status(403).send('Access Denied');
  }
  next();
});

// Serve uploaded images with WebP fallback support and long cache
app.use('/uploads', (req, res, next) => {
  const acceptHeader = req.headers.accept || '';
  const shouldUseWebP = acceptHeader.includes('image/webp');
  const isImageRequest = /\.(jpe?g|png)$/i.test(req.path);

  if (shouldUseWebP && isImageRequest) {
    const requestedPath = path.resolve(UPLOADS_DIR, '.' + req.path);
    if (!requestedPath.startsWith(UPLOADS_DIR)) {
      return res.status(400).send('Bad Request');
    }

    const webpPath = requestedPath.replace(/\.(jpe?g|png)$/i, '.webp');
    if (fs.existsSync(webpPath)) {
      res.set('Vary', 'Accept');
      res.set('Cache-Control', 'public, max-age=2592000');
      return res.sendFile(webpPath);
    }
  }

  next();
});

app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '30d',
  etag: false
}));

// Brotli-enabled static assets for browsers that support it
app.use((req, res, next) => {
  const acceptEnc = req.headers['accept-encoding'] || '';
  if (!acceptEnc.includes('br')) return next();

  let filePath = req.path;
  if (filePath === '/') filePath = '/index.html';

  const extension = path.extname(filePath);
  if (!['.html', '.css'].includes(extension)) {
    if (!extension && fs.existsSync(path.join(ROOT, `${filePath}.html.br`))) {
      filePath = `${filePath}.html`;
    } else {
      return next();
    }
  }

  const originalPath = path.join(ROOT, filePath);
  const brotliPath = `${originalPath}.br`;
  if (!fs.existsSync(brotliPath)) return next();

  const contentType = extension === '.css' ? 'text/css' : 'text/html';
  res.setHeader('Content-Encoding', 'br');
  res.setHeader('Vary', 'Accept-Encoding');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=604800');
  return res.sendFile(brotliPath);
});

// Render EJS templates for main pages
// The homepage cannot be cached because it uses a per-request nonce for its inline script.
app.get('/', (req, res) => {
  res.render('index');
});

// The admin page also has dynamic, per-session logic and should not be cached.
app.get('/admin', (req, res) => {
  res.render('admin');
});

// Static files serve karein (Extensions support ke sath)
// Ye automatically /product ko product.html se match kar lega
app.use(express.static(ROOT, {
  extensions: ['html'],
  index: 'index.html',
  maxAge: '7d', // Cache HTML for 7 days
  setHeaders: function (res, path) {
    // Cache images for 30 days
    if (/\.(png|jpg|jpeg|gif|ico|svg|webp)$/.test(path)) {
      res.set('Cache-Control', 'public, max-age=2592000'); // 30 days
      res.set('Expires', new Date(Date.now() + 2592000000).toUTCString());
    }
    // Cache CSS/JS for 7 days
    else if (/\.(css|js|woff|woff2)$/.test(path)) {
      res.set('Cache-Control', 'public, max-age=604800'); // 7 days
    }
    // Cache HTML for 1 day
    else if (/\.html$/.test(path)) {
      res.set('Cache-Control', 'public, max-age=86400'); // 1 day
    }
  }
}));

// SEO: Basic robots.txt and sitemap stub
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send("User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: " + req.protocol + "://" + req.get('host') + "/sitemap.xml");
});

app.get('/sitemap.xml', (req, res) => {
  // Redirect to API endpoint for dynamic sitemap
  res.redirect('/api/sitemap.xml');
});

app.get('*', (req, res) => {
  // Agar koi page nahi milta toh 404 dein, redirect home par na bhejein.
  if (req.path.startsWith('/api/')) return res.status(404).json({ success: false, message: 'API route not found' });

  // Static files (images, icons) ke liye 404 dein, redirect nahi
  if (/\.(png|jpg|jpeg|gif|ico|svg|css|js)$/.test(req.path)) {
    return res.status(404).send('File not found');
  }

  if (req.accepts('html')) {
    return res.status(404).send(`
      <div style="font-family: 'Inter', -apple-system, sans-serif; text-align: center; padding: 80px 20px; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 50px; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); max-width: 450px; width: 100%;">
          <h1 style="font-size: 80px; font-weight: 800; color: #10b981; margin: 0; line-height: 1;">404</h1>
          <h2 style="color: #1e293b; font-size: 24px; margin-top: 20px;">Oops! Page nahi mila</h2>
          <p style="color: #64748b; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">Humein maaf kijiye, jo page aap dhund rahe hain woh shayad hata diya gaya hai ya uska address galat hai.</p>
          <a href="/" style="display: inline-block; padding: 14px 28px; background: #10b981; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; transition: all 0.3s ease; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);">Wapas Home Par Jayein</a>
        </div>
      </div>
    `);
  }
  res.status(404).json({ success: false, message: 'Page not found' });
});

// Global Error Handler Design
app.use((err, req, res, next) => {
  console.error('SERVER_ERROR:', err);
  res.status(500);
  if (req.accepts('html')) {
    return res.send(`
      <div style="font-family: 'Inter', sans-serif; text-align: center; padding: 80px 20px; background: #fef2f2; min-height: 100vh; display: flex; align-items: center; justify-content: center;">
        <div style="background: white; padding: 50px; border-radius: 24px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); max-width: 500px; width: 100%;">
          <div style="background: #fee2e2; width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px;">
            <svg style="width: 40px; height: 40px; color: #dc2626;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 12px;">Technical Issue!</h1>
          <p style="color: #64748b; line-height: 1.6; margin-bottom: 30px;">Server par kuch technical dikkat aa gayi hai. Hum ise jald hi theek kar lenge.</p>
          <a href="/" style="color: #10b981; font-weight: 700; text-decoration: none; border: 2px solid #10b981; padding: 12px 24px; border-radius: 12px; display: inline-block;">Wapas Homepage par jayein</a>
        </div>
      </div>
    `);
  }
  res.json({ success: false, message: 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  const interfaces = os.networkInterfaces();
  let networkIP = '';
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        networkIP = alias.address;
      }
    }
  }

  console.log(`\n=================================================`);
  console.log(`🚀 ${process.env.BUSINESS_NAME || 'Hoppokart'} is LIVE!`);
  console.log(`🏠 Local:            http://localhost:${PORT}`);
  if (networkIP) {
    console.log(`📱 On Your Network:   http://${networkIP}:${PORT}`);
  }
  console.log(`=================================================\n`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Set a different PORT environment variable or stop the process using that port.`);
    process.exit(1);
  }
  console.error('Server error:', error);
  process.exit(1);
});

// Global error handlers for production stability
process.on('uncaughtException', (err) => {
  console.error('🔥 FATAL ERROR: Uncaught Exception:', err);
  // Exit process to let PM2 restart it in a clean state
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown for production
process.on('SIGTERM', () => {
  console.info('SIGTERM signal received. Closing HTTP server...');
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
});