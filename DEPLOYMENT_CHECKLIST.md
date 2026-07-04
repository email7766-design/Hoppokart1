# ✅ HOPPOKART DEPLOYMENT CHECKLIST

## 📋 Pre-Deployment (Local)

- [ ] Review all documentation files
- [ ] Understand pagination logic
- [ ] Test API endpoints locally
- [ ] Backup current database
- [ ] Backup uploads folder
- [ ] Test .env configuration locally
- [ ] Verify all npm packages installed
- [ ] Check for any errors in console

## 🖥️ Server Preparation (Hostinger)

### Initial Setup
- [ ] SSH access working
- [ ] Ubuntu 24.04 LTS confirmed
- [ ] Internet connection stable
- [ ] 2GB RAM minimum available
- [ ] 10GB disk space minimum

### System Update
- [ ] apt update completed
- [ ] apt upgrade completed
- [ ] curl, wget, git installed
- [ ] build-essential installed (optional)

### Install Core Tools
- [ ] Node.js v20 installed
- [ ] NPM installed and updated
- [ ] PM2 installed globally
- [ ] PM2 logrotate configured

### Install Web Server
- [ ] Nginx installed
- [ ] Nginx enabled for startup
- [ ] Nginx running successfully

### Install SSL Tools
- [ ] Certbot installed
- [ ] Python certbot-nginx installed
- [ ] Can generate certificates

## 📁 File Deployment

### Directory Structure
- [ ] /var/www/hoppokart created
- [ ] Permissions set correctly (755)
- [ ] Owner set to current user

### Upload Files
- [ ] All application files uploaded
- [ ] node_modules/ synced (or npm install run)
- [ ] database/ folder accessible
- [ ] uploads/ folder created
- [ ] logs/ folder created

### File Permissions
- [ ] database/ folder writable
- [ ] uploads/ folder writable
- [ ] logs/ folder writable
- [ ] .env readable by app

## ⚙️ Configuration

### Environment File
- [ ] .env.example copied to .env
- [ ] PORT set to 3000
- [ ] BUSINESS_NAME configured
- [ ] ADMIN_PASSWORD set (strong)
- [ ] JWT_SECRET generated (random 32+ chars)
- [ ] EMAIL settings configured (optional)
- [ ] Razorpay keys added (optional)
- [ ] NODE_ENV set to production

### PM2 Configuration
- [ ] ecosystem.config.js reviewed
- [ ] App name set correctly
- [ ] Max memory set appropriately
- [ ] Log paths configured
- [ ] Node args configured

### Nginx Configuration
- [ ] nginx-config.conf reviewed
- [ ] Domain name replaced (2-3 places)
- [ ] SSL cert paths verified
- [ ] Cache headers checked
- [ ] Security headers present
- [ ] Upstream localhost:3000 correct

## 🔐 SSL Certificate

### Certificate Generation
- [ ] certbot command run
- [ ] Domain email verified
- [ ] Terms accepted
- [ ] Certificate generated successfully
- [ ] privkey.pem location noted
- [ ] fullchain.pem location noted

### Certificate Verification
- [ ] Certificate files exist
- [ ] Paths correct in nginx config
- [ ] Certificate valid (check expiry date)
- [ ] Certificate will auto-renew

## 🌐 Nginx Setup

### Configuration Deployment
- [ ] Config file copied to sites-available
- [ ] Domain name updated in config
- [ ] SSL cert paths updated
- [ ] Config syntax checked (nginx -t)
- [ ] Default site disabled
- [ ] New site linked to sites-enabled
- [ ] Nginx restarted

### Verification
- [ ] Nginx running (systemctl status nginx)
- [ ] Listening on port 80
- [ ] Listening on port 443
- [ ] No error in logs

## 🚀 Application Startup

### PM2 Start
- [ ] PM2 started with ecosystem config
- [ ] Application running (pm2 status)
- [ ] All processes online
- [ ] No errors in pm2 logs

### Process Configuration
- [ ] PM2 saved (pm2 save)
- [ ] PM2 startup configured (pm2 startup)
- [ ] Startup script installed
- [ ] Processes will restart on reboot

### Application Verification
- [ ] Listening on port 3000 (netstat -tulpn)
- [ ] Database cache initialized
- [ ] No errors in logs (pm2 logs)
- [ ] Responds to curl localhost:3000

## ✅ Testing

### HTTP/HTTPS Access
- [ ] HTTP to HTTPS redirect working
- [ ] Website loads via HTTPS
- [ ] No SSL warnings
- [ ] Security headers present

### Performance
- [ ] Homepage loads in < 1 second
- [ ] Products API responds in < 200ms
- [ ] Pagination working correctly
- [ ] Search function responsive

### SEO Features
- [ ] Sitemap accessible (/sitemap.xml)
- [ ] Robots.txt accessible
- [ ] Schema endpoints working
- [ ] Meta tags present

### Functionality
- [ ] Products loading
- [ ] Pagination controls working
- [ ] Search working
- [ ] Admin panel accessible
- [ ] Orders can be placed
- [ ] Checkout working

### Database
- [ ] Products loading from JSON
- [ ] New products can be added
- [ ] Orders being saved
- [ ] Categories working

## 🔒 Security Verification

### File Protection
- [ ] .env not accessible via web
- [ ] database/ folder not accessible
- [ ] package.json not accessible
- [ ] server.js not accessible
- [ ] Hidden files blocked

### HTTPS/SSL
- [ ] HTTPS enforced (HTTP redirects)
- [ ] Certificate valid and trusted
- [ ] Mixed content warnings none
- [ ] Grade A+ on SSL labs (optional)

### Security Headers
- [ ] Strict-Transport-Security present
- [ ] X-Frame-Options present
- [ ] X-Content-Type-Options present
- [ ] X-XSS-Protection present

## 📊 Monitoring Setup

### Logs Configuration
- [ ] PM2 logs available
- [ ] Nginx access logs working
- [ ] Nginx error logs working
- [ ] Application logs rotating

### Backup Strategy
- [ ] Database backup location decided
- [ ] Upload backup scheduled
- [ ] Script for backups written
- [ ] Backup tested

### Monitoring Plan
- [ ] Daily check routine planned
- [ ] Weekly maintenance scheduled
- [ ] Certificate renewal scheduled
- [ ] Log rotation configured

## 🔄 Post-Deployment

### Day 1
- [ ] Website fully operational
- [ ] Monitor logs for errors
- [ ] Test all core features
- [ ] Check performance metrics
- [ ] Document any issues

### Week 1
- [ ] Google Search Console setup
- [ ] Sitemap submitted to Google
- [ ] Bing Webmaster setup
- [ ] Schema validation passed
- [ ] Performance baseline recorded

### Month 1
- [ ] Monitor Google indexing
- [ ] Check search appearance
- [ ] Analyze traffic patterns
- [ ] Plan SEO improvements
- [ ] Backup data regularly

## 📞 Emergency Procedures

### If Website Down
- [ ] Check pm2 status
- [ ] Check nginx status
- [ ] Check disk space
- [ ] Check system resources
- [ ] Restart if needed
- [ ] Check logs for errors
- [ ] Contact hosting support if unresolved

### If Slow Performance
- [ ] Check pm2 monit
- [ ] Check system load
- [ ] Check database size
- [ ] Check nginx logs
- [ ] Restart if necessary
- [ ] Increase cache validity
- [ ] Archive old data

### If SSL Error
- [ ] Check certificate expiry
- [ ] Renew if expired
- [ ] Check nginx config paths
- [ ] Restart nginx
- [ ] Clear browser cache
- [ ] Test with new browser

## 📚 Documentation

- [ ] QUICK_REFERENCE.md reviewed
- [ ] DEPLOYMENT_GUIDE.md followed
- [ ] OPTIMIZATION_REPORT.md understood
- [ ] README_HINDI.md translated if needed
- [ ] Troubleshooting section bookmarked

## 🎉 Success Criteria

✅ Website is LIVE and accessible  
✅ Loading time < 1 second  
✅ All products showing  
✅ Pagination working  
✅ Search functional  
✅ Admin panel accessible  
✅ HTTPS enabled  
✅ Security headers present  
✅ Sitemap generated  
✅ No errors in logs  

---

## 🏁 Final Sign-Off

- [ ] All checklist items completed
- [ ] Website fully tested
- [ ] Performance metrics verified
- [ ] Security validated
- [ ] Backups in place
- [ ] Monitoring setup
- [ ] Ready for production ✅

---

**Date Deployed:** _______________

**By:** _______________

**Notes:** _______________

---

**🎉 Deployment Complete! Website is LIVE!**
