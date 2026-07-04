# Hostinger Deploy Checklist

## 1. Upload Required Files

Upload these updated files/folders to your Hostinger Node app:

- `server.js`
- `api-routes.js`
- `database.js`
- `package.json`
- `package-lock.json`
- `database/products.json`
- `uploads/` folder

Important:

- Do not skip `uploads/`
- Do not keep the old `database/products.json`

## 2. Install Dependencies On Server

Run:

```bash
npm install
```

This ensures `compression` and all other packages are present.

## 3. Check Environment Variables

Make sure these are set correctly on Hostinger if you use them:

```env
PORT=3000
BUSINESS_NAME=Hoppokart
ADMIN_PASSWORD=your-password
JWT_SECRET=your-secret
RAZORPAY_KEY_ID=your-key
RAZORPAY_KEY_SECRET=your-secret
```

## 4. Restart The Node App

After upload and install, restart the app from Hostinger panel or SSH:

```bash
npm start
```

If port `3000` is already busy, stop the old process first or set another port.

## 5. Verify After Deploy

Open these URLs in browser:

- `/`
- `/product.html?id=...`
- `/api/products`
- `/uploads/<any-image-name>`

What you should see:

- products load quickly
- product images open from `/uploads/...`
- `/api/products` returns image URLs, not `data:image/...`

## 6. If Products Still Load Slowly

Check these points:

- old `products.json` was not uploaded by mistake
- `uploads/` folder is missing on server
- app was not restarted after upload
- Hostinger is still serving an older process
- Nginx/cache is serving stale files

## 7. Quick Success Check

Your fix is working if:

- `database/products.json` is small
- product entries contain `/uploads/...` paths
- homepage products appear in a few seconds, not 20+ seconds
