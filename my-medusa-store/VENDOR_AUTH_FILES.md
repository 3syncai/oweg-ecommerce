# Vendor Authentication Files

This document contains all the files related to vendor login, middleware, and dashboard.

## 1. Login Files

### Vendor Login Widget (injects into default Medusa login page)
**File:** `src/admin/widgets/vendor-login-option.tsx`

### Vendor Auth Interceptor (adds vendor token to requests)
**File:** `src/admin/widgets/vendor-auth-interceptor.tsx`

### Vendor Login API Endpoint
**File:** `src/api/vendor/auth/login/route.ts`

## 2. Middleware Files

### Middleware Configuration (currently disabled, using route handler instead)
**File:** `src/api/middlewares.ts`

### Admin Users Me Route Handler (handles both admin and vendor auth)
**File:** `src/api/admin/users/me/route.ts`

## 3. Dashboard Files

### Vendor Dashboard
**File:** `src/admin/routes/vendor-dashboard/page.tsx`

### Vendor Products Page
**File:** `src/admin/routes/vendor-products/page.tsx`

### Vendor Orders Page
**File:** `src/admin/routes/vendor-orders/page.tsx`

### Vendor Profile Page
**File:** `src/admin/routes/vendor-profile/page.tsx`

## 4. Token & Guards

### JWT Token Utilities
**File:** `src/api/vendor/_lib/token.ts`

### Vendor Guards
**File:** `src/api/vendor/_lib/guards.ts`

