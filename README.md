# Hoppokart - B2C Website

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Create `.env`
Copy the `.env.example` file to `.env` and set your values.

### 3. Start Server
```bash
npm start
```

### 4. Open the Site
- Store: `http://localhost:3000`
- Admin Panel: `http://localhost:3000/admin.html`
- Track Orders: `http://localhost:3000/track.html`

### Accessing from Mobile (Local Network)
1. Connect both Phone and PC to the same Wi-Fi.
2. Find your PC's IP address (run `ipconfig` in CMD).
3. Open `http://<YOUR_IP_ADDRESS>:3000` on your phone browser.

### Accessing from Mobile (VPS/Live)
1. Use your VPS Public IP: `http://<VPS_IP>:3000`
2. Ensure Port 3000 is open in Hostinger VPS Firewall settings.

## Environment Variables
Use `.env.example` as a template:
```env
PORT=3000
BUSINESS_NAME=Hoppokart
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
ADMIN_PASSWORD=your_secure_password
```

## Admin Panel Login
- Password is taken from `ADMIN_PASSWORD` in `.env`
- The admin form sends credentials to the backend route `/api/admin/login`

## Features
- ✅ Product catalog served by Express API
- ✅ Admin product create / update / delete
- ✅ Checkout with COD and Razorpay support
- ✅ Order tracking by order ID
- ✅ File-based JSON persistence in `database/`

## Deployment Notes
- Set `ADMIN_PASSWORD` to a strong secret
- Configure Razorpay credentials for live payments
- Deploy behind HTTPS
- Add rate limiting and CSRF protection for production

## Tech Stack
- Backend: Node.js + Express
- Storage: JSON files under `database/`
- Payment: Razorpay
- Frontend: Vanilla HTML/CSS/JS
