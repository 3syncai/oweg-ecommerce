# OWEG E-Commerce Codebase Overview

## Project Architecture

This is a **multi-platform e-commerce application** consisting of three main components:

1. **Frontend Store** (Next.js) - Customer-facing e-commerce website
2. **Backend API** (Medusa.js) - Headless e-commerce backend
3. **Vendor Portal** (Next.js) - Separate portal for vendors to manage their products

---

## 1. Frontend Store (`/src`)

### Technology Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **State Management**: React Context API, Zustand
- **Data Fetching**: React Query (TanStack Query)
- **UI Components**: Radix UI, custom components

### Key Features
- **PWA Support**: Progressive Web App with service worker for offline functionality
- **Guest Cart**: Supports both authenticated and guest shopping carts
- **Product Catalog**: Categories, collections, search, filtering
- **User Authentication**: Login, signup, password reset
- **Payment Integration**: Razorpay for payments
- **Wishlist**: Product wishlist functionality
- **Product Reviews**: Customer reviews with media upload

### Directory Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (proxies to Medusa)
│   ├── cart/              # Shopping cart page
│   ├── checkout/          # Checkout flow
│   ├── home/              # Homepage
│   ├── productDetail/     # Product detail pages
│   ├── products/          # Product listing pages
│   ├── login/             # Authentication pages
│   └── order/             # Order management
├── components/            # React components
│   ├── ui/                # Reusable UI components
│   └── modules/           # Feature-specific components
├── contexts/              # React Context providers
│   ├── AuthProvider.tsx   # User authentication state
│   └── CartProvider.tsx   # Shopping cart state
├── hooks/                 # Custom React hooks
├── lib/                   # Utility libraries
│   ├── medusa.ts          # Medusa API client (main)
│   ├── medusa-client.ts   # Simple fetch wrapper
│   ├── mysql.ts           # MySQL read-only connection
│   ├── razorpay.ts        # Razorpay payment integration
│   └── cart-helpers.ts    # Cart utility functions
└── services/              # Service layer
```

### Key Libraries

**`src/lib/medusa.ts`** - Main Medusa integration:
- Product fetching with fallback strategies
- Category and collection management
- Price override from MySQL (OpenCart legacy data)
- Product detail caching (5-minute TTL)
- Handles multiple API versions (v1/v2 compatibility)

**`src/lib/mysql.ts`** - MySQL Integration:
- **Read-only** connection pool to OpenCart MySQL database
- Used for price overrides and legacy data access
- Security: Blocks all write operations (INSERT, UPDATE, DELETE, etc.)
- Connection to: `147.93.31.253:3306/oweg_db`

**`src/contexts/AuthProvider.tsx`**:
- Manages customer authentication state
- Auto-merges guest cart on login
- Session management via cookies

**`src/contexts/CartProvider.tsx`**:
- Tracks cart item count
- Syncs with Medusa backend
- Supports guest cart via localStorage

---

## 2. Backend API (`/my-medusa-store`)

### Technology Stack
- **Framework**: Medusa.js v2.11.3
- **Database**: PostgreSQL (primary), MySQL (read-only for legacy data)
- **Language**: TypeScript
- **Authentication**: Medusa Auth with email/password
- **File Storage**: AWS S3
- **Payment**: Razorpay integration

### Architecture

Medusa.js is a **headless e-commerce framework** that provides:
- Product catalog management
- Order management
- Customer management
- Cart management
- Payment processing
- Admin dashboard

### Key Modules

#### Vendor Module (`src/modules/vendor/`)
Custom marketplace functionality:

**Models**:
- `Vendor` - Vendor/seller information (store details, tax info, banking, approval status)
- `VendorUser` - Vendor authentication credentials

**Service** (`service.ts`):
- `createPendingVendor()` - Vendor registration (pending approval)
- `approveVendor()` - Admin approval workflow
- `rejectVendor()` - Rejection with reason
- `reapplyVendor()` - Allow rejected vendors to reapply
- `createVendorUser()` - Vendor login credentials
- `authenticateVendorUser()` - Vendor authentication

**Features**:
- Vendor approval workflow (pending → approved/rejected)
- Duplicate checking (email, phone, PAN, GST, store name)
- Integration with marketplace plugin (optional)
- Auto-creates vendor user on approval

#### Review Module (`src/modules/review/`)
Product review system with media upload support.

### API Routes

**Store APIs** (`src/api/store/`):
- `/store/vendors/signup` - Vendor registration
- `/store/vendors/me` - Get current vendor info
- `/store/vendors/reapply` - Reapply after rejection
- `/store/products/[id]/reviews` - Product reviews
- `/store/custom` - Custom store endpoints

**Admin APIs** (`src/api/admin/`):
- `/admin/vendors/pending` - List pending vendors
- `/admin/vendors/all` - List all vendors with product counts
- `/admin/vendors/[id]/approve` - Approve vendor
- `/admin/vendors/[id]/reject` - Reject vendor
- `/admin/custom/vendor-products/pending` - Pending product approvals
- `/admin/custom/vendor-products/[id]/approve` - Approve vendor product

**Vendor APIs** (`src/api/vendor/`):
- `/vendor/auth/login` - Vendor login
- `/vendor/auth/logout` - Vendor logout
- `/vendor/me` - Vendor profile
- `/vendor/products` - Vendor's products (CRUD)
- `/vendor/orders` - Vendor's orders
- `/vendor/stats` - Vendor statistics
- `/vendor/pending` - Pending products awaiting approval

### Configuration

**`medusa-config.ts`**:
- Database: PostgreSQL via `DATABASE_URL`
- CORS: Configured for frontend (`localhost:3000`, `oweg-ecommerce.vercel.app`)
- Auth: Email/password provider
- File Storage: S3 (AWS)
- Modules: Vendor module, Review module

### Database

**Primary**: PostgreSQL (Medusa)
- Products, orders, customers, carts, etc.
- Managed by Medusa migrations

**Legacy**: MySQL (OpenCart) - Read-only
- Used for price overrides
- Historical order data (migration scripts available)

---

## 3. Vendor Portal (`/vendor-portal`)

### Technology Stack
- **Framework**: Next.js 16
- **UI Library**: Medusa UI (`@medusajs/ui`)
- **Styling**: Tailwind CSS
- **Port**: 4000 (separate from main frontend)

### Purpose
Separate application for vendors to:
- Manage their products
- View orders
- Track statistics
- Update profile
- Upload product images

### Features
- Vendor authentication
- Product CRUD operations
- Order management
- Dashboard with stats
- Image upload to S3

---

## 4. Data Migration (ETL)

### OpenCart to Medusa Migration

Located in `/etl/orders/` and `/my-medusa-store/src/scripts/`:

**Purpose**: Migrate historical data from OpenCart MySQL to Medusa PostgreSQL

**Scripts**:
- `etl/orders/extract.js` - Extracts orders from OpenCart
- `my-medusa-store/src/scripts/load-opencart-orders.ts` - Loads orders into Medusa
- Multiple diagnostic/fix scripts for order migration issues

**Process**:
1. Extract orders from OpenCart MySQL
2. Transform to Medusa format
3. Create customers, addresses, orders in Medusa
4. Handle foreign key relationships

**Safety**: Read-only from OpenCart, creates new records in Medusa (no updates)

---

## 5. Payment Integration

### Razorpay

**Location**: `src/lib/razorpay.ts`

**Features**:
- Create Razorpay orders
- Webhook signature verification
- Payment confirmation
- Supports both INR (rupees) and paise

**Flow**:
1. Frontend creates draft order in Medusa
2. Backend creates Razorpay order
3. Frontend redirects to Razorpay checkout
4. Webhook confirms payment
5. Order status updated in Medusa

---

## 6. Key Integrations

### MySQL (OpenCart Legacy)
- **Purpose**: Price overrides, legacy data access
- **Connection**: Read-only pool
- **Security**: Blocks all write operations
- **Usage**: Product price lookups, historical data

### AWS S3
- **Purpose**: File storage (product images, vendor documents)
- **Configuration**: Via environment variables
- **Access**: Pre-signed URLs for secure access

### Medusa Marketplace Plugin
- **Plugin**: `@techlabi/medusa-marketplace-plugin`
- **Integration**: Optional (via `MARKETPLACE_INTEGRATION` env var)
- **Purpose**: Multi-vendor marketplace functionality

---

## 7. Environment Variables

### Frontend (Next.js)
```env
NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://localhost:9000
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=...
NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID=...
NEXT_PUBLIC_RAZORPAY_KEY_ID=...
DB_HOST=147.93.31.253
DB_USER=oweg_user2
DB_PASSWORD=Oweg#@123
DB_NAME=oweg_db
```

### Backend (Medusa)
```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
COOKIE_SECRET=...
STORE_CORS=http://localhost:3000,https://oweg-ecommerce.vercel.app
S3_BUCKET=...
S3_REGION=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
RAZORPAY_KEY_ID=...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
MARKETPLACE_INTEGRATION=true
```

---

## 8. Deployment

### Frontend
- **Platform**: Vercel (recommended)
- **Build**: `npm run build`
- **PWA**: Configured with service worker and manifest

### Backend
- **Platform**: Railway, Render, or DigitalOcean
- **Database**: PostgreSQL (managed service)
- **File Storage**: AWS S3
- **Port**: 9000 (default Medusa port)

### Vendor Portal
- **Platform**: Vercel or separate deployment
- **Port**: 4000
- **Authentication**: Separate from main store

---

## 9. Key Workflows

### Customer Flow
1. Browse products → Add to cart → Checkout → Payment (Razorpay) → Order confirmation

### Vendor Flow
1. Sign up → Admin approval → Login to vendor portal → Add products → Admin approves products → Products go live

### Admin Flow
1. Approve/reject vendors → Approve/reject vendor products → Manage orders → View statistics

### Guest Cart Flow
1. Add items as guest → Cart stored in localStorage → Login → Cart merged with user cart

---

## 10. Security Features

1. **MySQL Read-Only**: Blocks all write operations
2. **SQL Injection Protection**: Parameterized queries, input validation
3. **CORS Configuration**: Restricted to known domains
4. **Authentication**: JWT tokens, secure cookies
5. **Password Hashing**: bcrypt for vendor users
6. **Webhook Verification**: HMAC signature verification for Razorpay

---

## 11. Development Scripts

### Frontend
```bash
npm run dev      # Start dev server (port 3000)
npm run build    # Production build
npm run start    # Start production server
```

### Backend
```bash
cd my-medusa-store
npm run dev      # Start Medusa dev server (port 9000)
npm run build    # Build Medusa
npm run migrate  # Run database migrations
npm run seed     # Seed database
```

### Vendor Portal
```bash
cd vendor-portal
npm run dev      # Start dev server (port 4000)
```

---

## 12. File Organization

### Scripts Directory
`my-medusa-store/src/scripts/` contains many utility scripts:
- Order migration scripts
- Diagnostic scripts
- Fix scripts for data issues
- Schema inspection scripts

These are development/maintenance tools, not part of the main application.

---

## Summary

This is a **multi-vendor e-commerce platform** with:
- **Customer-facing store** (Next.js frontend)
- **Headless backend** (Medusa.js)
- **Vendor portal** (separate Next.js app)
- **Legacy data integration** (MySQL read-only)
- **Payment processing** (Razorpay)
- **File storage** (AWS S3)
- **PWA support** for mobile experience

The architecture follows a **microservices-like pattern** with clear separation between:
- Customer experience (frontend)
- Business logic (Medusa backend)
- Vendor management (vendor portal)
- Legacy data access (MySQL)


