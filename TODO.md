# Admin Panel Separation + Sales Dashboard — Implementation Plan

## Steps

### Phase 1: Backend APIs
- [ ] Update `database.js` — Add `getOrderAnalytics()` helper
- [ ] Update `api-routes.js` — Add `/api/admin/analytics` endpoint

### Phase 2: Admin Dashboard Hub
- [ ] Rewrite `admin.html` — Login + Dashboard hub with sidebar navigation

### Phase 3: Separate Admin Pages
- [ ] Create `admin-orders.html` — Full order listing, filters, detail modal, status updates
- [ ] Create `admin-products.html` — Product CRUD with image uploads
- [ ] Create `admin-store.html` — Store controls, categories, payment settings
- [ ] Create `admin-sales.html` — Sales dashboard with charts (Chart.js)

### Phase 4: Testing
- [ ] Run `npm start`
- [ ] Verify all admin pages load and function correctly

