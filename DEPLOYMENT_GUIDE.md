# 🚀 Hoppokart Deployment Guide - Ubuntu 24.04 LTS (Hostinger)

## 📋 Prerequisites
- Ubuntu 24.04 LTS Server from Hostinger
- SSH Access to your server
- Domain name configured

## 🔧 Step 1: Initial Server Setup

### 1.1 Update System
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y curl wget git nano
```

### 1.2 Install Node.js (v20.x - Recommended)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs npm
node --version
npm --version
```

### 1.3 Install PM2 (Process Manager)
```bash
sudo npm install -g pm2
sudo npm install -g pm2-logrotate
pm2 logrotate -u root
```

### 1.4 Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 1.5 Install Certbot (SSL Certificates)
```bash
sudo apt install -y certbot python3-certbot-nginx
```

## 📁 Step 2: Setup Application

### 2.1 Create Application Directory
```bash
sudo mkdir -p /var/www/hoppokart
sudo chown -R $USER:$USER /var/www/hoppokart
cd /var/www/hoppokart
```

### 2.2 Clone Repository (Or Upload Files)
```bash
# Option A: Clone from GitHub
git clone your-repo-url .
git pull origin main

# Option B: Upload via FTP/SCP
# Upload all files to /var/www/hoppokart
```

### 2.3 Install Dependencies
```bash
cd /var/www/hoppokart
npm install
```

### 2.4 Create Environment File
```bash
nano .env
```

Add this content:
```
NODE_ENV=production
PORT=3000
BUSINESS_NAME=Hoppokart
ADMIN_PASSWORD=your-strong-password-here
JWT_SECRET=your-random-jwt-secret-here
```

### 2.5 Create Logs Directory
```bash
mkdir -p /var/www/hoppokart/logs
```

## 🔐 Step 3: SSL Certificate Setup

### 3.1 Get SSL Certificate from Let's Encrypt
```bash
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com
```

When asked, enter your email and agree to terms.

## 🖥️ Step 4: Nginx Configuration

### 4.1 Copy Nginx Config
```bash
sudo cp /var/www/hoppokart/nginx-config.conf /etc/nginx/sites-available/hoppokart
```

### 4.2 Edit Nginx Config
```bash
sudo nano /etc/nginx/sites-available/hoppokart
```

Replace:
- `your-domain.com` with your actual domain
- `/var/www/hoppokart` with your app path

### 4.3 Enable Nginx Site
```bash
sudo ln -s /etc/nginx/sites-available/hoppokart /etc/nginx/sites-enabled/hoppokart
sudo rm -f /etc/nginx/sites-enabled/default
```

### 4.4 Test Nginx Configuration
```bash
sudo nginx -t
```

### 4.5 Restart Nginx
```bash
sudo systemctl restart nginx
```

## 🔄 Step 5: Start Application with PM2

### 5.1 Start Application
```bash
cd /var/www/hoppokart
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/local/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

### 5.2 Check Application Status
```bash
pm2 status
pm2 logs
pm2 logs hoppokart
```

## ✅ Step 6: Verification

### 6.1 Check if Running
```bash
curl http://localhost:3000
curl https://your-domain.com
```

### 6.2 Check Nginx Status
```bash
sudo systemctl status nginx
```

### 6.3 Check PM2 Status
```bash
pm2 status
pm2 info hoppokart
```

## 📊 Performance Optimization

### 7.1 Enable Browser Caching
Done via Nginx config (already included)

### 7.2 Monitor Performance
```bash
# Check CPU and Memory
top

# Check Disk Usage
df -h

# Check Network
nethogs
```

### 7.3 View Logs
```bash
# Application Logs
pm2 logs hoppokart

# Nginx Access Logs
sudo tail -f /var/log/nginx/hoppokart_access.log

# Nginx Error Logs
sudo tail -f /var/log/nginx/hoppokart_error.log
```

## 🔒 Security Setup

### 8.1 Setup Firewall
```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 8.2 Enable Auto SSL Renewal
```bash
sudo crontab -e
```

Add this line:
```
0 12 * * * /usr/bin/certbot renew --quiet
```

## 🚀 Deployment (After Changes)

### 9.1 Update Code
```bash
cd /var/www/hoppokart
git pull origin main
npm install
pm2 restart hoppokart
```

### 9.2 Check Status
```bash
pm2 status
pm2 logs
```

## 🐛 Troubleshooting

### Issue: 502 Bad Gateway
```bash
# Check if Node app is running
pm2 status
pm2 logs hoppokart

# Restart application
pm2 restart hoppokart
```

### Issue: SSL Certificate Error
```bash
# Renew certificate
sudo certbot renew --force-renewal

# Check certificate
sudo certbot certificates
```

### Issue: High Memory Usage
```bash
# Check memory usage
pm2 status
free -h

# Increase memory limit in ecosystem.config.js
# Change: max_memory_restart: '500M'
```

### Issue: Port 3000 Already in Use
```bash
# Find process using port 3000
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>
```

## 📈 Monitoring & Maintenance

### 10.1 Daily Checks
```bash
# Check application status
pm2 status

# Check system resources
free -h && df -h

# Check logs for errors
tail -n 50 /var/www/hoppokart/logs/error.log
```

### 10.2 Weekly Tasks
```bash
# Update packages
sudo apt update

# Check certificate expiry
sudo certbot certificates

# Review error logs
sudo tail -f /var/log/nginx/hoppokart_error.log
```

### 10.3 Backup
```bash
# Backup database and uploads
sudo tar -czf /backup/hoppokart-$(date +%Y%m%d).tar.gz /var/www/hoppokart/database /var/www/hoppokart/uploads
```

## 📞 Support

For issues, check:
- PM2 logs: `pm2 logs`
- Nginx error: `sudo tail -f /var/log/nginx/hoppokart_error.log`
- System logs: `journalctl -xe`

---

**Your Website is now LIVE! 🎉**

Visit: https://your-domain.com
Admin Panel: https://your-domain.com/admin.html
