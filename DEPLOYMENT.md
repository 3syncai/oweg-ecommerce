# Deployment Guide

This guide covers deploying both the frontend (Next.js) and backend (Medusa) of the OWEG ecommerce application.

## Table of Contents
1. [Frontend Deployment (Vercel)](#frontend-deployment-vercel)
2. [Backend Deployment (Medusa)](#backend-deployment-medusa)
3. [Environment Variables](#environment-variables)
4. [PWA Configuration](#pwa-configuration)

---

## Frontend Deployment (Vercel)

### Prerequisites
- Vercel account (free tier works)
- GitHub/GitLab/Bitbucket repository connected

### Steps

1. **Push your code to GitHub** (if not already done)
   ```bash
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Import Project to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Select the root directory (not `my-medusa-store`)

3. **Configure Build Settings**
   - **Framework Preset**: Next.js (auto-detected)
   - **Root Directory**: `./` (root)
   - **Build Command**: `npm run build` (or `yarn build`)
   - **Output Directory**: `.next` (auto-detected)
   - **Install Command**: `npm install` (or `yarn install`)

4. **Set Environment Variables** (see [Environment Variables](#environment-variables) section)

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete
   - Your app will be live at `https://your-app.vercel.app`

### Vercel Configuration Notes
- The `vercel.json` file ensures proper PWA support
- Service workers are served with correct headers
- Manifest files are properly configured

---

## Backend Deployment (Medusa)

For Medusa backend, you have several options. **Render** is recommended for free tier users.

### ⚠️ Railway Free Tier Limitation
Railway's free tier **only allows databases**, not web services. If you see "Limited Access" message, use **Render** instead (free tier allows web services).

### Option 1: Render (Recommended for Free Tier) ⭐

Railway is excellent for Medusa deployments with easy PostgreSQL setup.

#### Steps:

1. **Create Railway Account**
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Select the `my-medusa-store` directory

3. **Add PostgreSQL Database**
   - In your project, click "+ New"
   - Select "Database" → "PostgreSQL"
   - Railway will automatically set `DATABASE_URL`

4. **Configure Environment Variables**
   - Go to your service → Variables tab
   - Add all required variables (see [Environment Variables](#environment-variables))

5. **Configure Build Settings**
   - **Root Directory**: `my-medusa-store`
   - **Build Command**: `npm run build` (or `yarn build`)
   - **Start Command**: `npm start` (or `yarn start`)

6. **Run Migrations**
   - After first deployment, go to your service → Deployments
   - Click on the latest deployment → "View Logs"
   - Or use Railway CLI:
     ```bash
     railway run npm run migrate
     ```

7. **Get Your Backend URL**
   - Railway will provide a URL like `https://your-app.up.railway.app`
   - Update your frontend's `MEDUSA_BACKEND_URL` with this URL

### Option 2: Render

Render offers a free tier with PostgreSQL.

#### Steps:

1. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub

2. **Create PostgreSQL Database**
   - Click "New +" → "PostgreSQL"
   - Name it (e.g., "oweg-medusa-db")
   - Copy the "Internal Database URL" (you'll need this)

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - **Settings**:
     - **Name**: `oweg-medusa-backend`
     - **Root Directory**: `my-medusa-store`
     - **Environment**: `Node`
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`

4. **Set Environment Variables**
   - In your web service, go to "Environment"
   - Add all required variables
   - Set `DATABASE_URL` to the PostgreSQL connection string from step 2

5. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy
   - Get your backend URL (e.g., `https://oweg-medusa-backend.onrender.com`)

6. **Run Migrations**
   - After deployment, use Render Shell or SSH:
     ```bash
     cd my-medusa-store
     npm run migrate
     ```

### Option 3: DigitalOcean App Platform

Good for production with better performance than free tiers.

1. Create a new App
2. Connect GitHub repository
3. Select `my-medusa-store` as root directory
4. Add managed PostgreSQL database
5. Configure environment variables
6. Deploy

### Option 4: AWS/GCP/Azure

For enterprise deployments, you can use:
- **AWS**: EC2 + RDS, or ECS + RDS
- **GCP**: Cloud Run + Cloud SQL
- **Azure**: App Service + Azure Database

These require more setup but offer better scalability.

---

## Environment Variables

### Frontend (Vercel)

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

```env
# Medusa Backend URL (your deployed backend URL)
NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://your-medusa-backend.railway.app
MEDUSA_BACKEND_URL=https://your-medusa-backend.railway.app

# Medusa API Keys (get from Medusa Admin)
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=your_publishable_key
MEDUSA_PUBLISHABLE_KEY=your_publishable_key

# Sales Channel & Region (get from Medusa Admin)
NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID=your_sales_channel_id
MEDUSA_SALES_CHANNEL_ID=your_sales_channel_id
NEXT_PUBLIC_MEDUSA_REGION_ID=your_region_id
MEDUSA_REGION_ID=your_region_id

# Optional: MySQL connection (if using MySQL features)
MYSQL_HOST=your_mysql_host
MYSQL_USER=your_mysql_user
MYSQL_PASSWORD=your_mysql_password
MYSQL_DATABASE=your_mysql_database
```

### Backend (Railway/Render/etc.)

Set these in your hosting platform's environment variables:

```env
# Database (Railway/Render auto-provides DATABASE_URL for PostgreSQL)
DATABASE_URL=postgresql://user:password@host:port/database

# For MySQL (if using MySQL instead of PostgreSQL)
# DATABASE_URL=mysql://user:password@host:port/database

# CORS Settings (your frontend URL)
STORE_CORS=https://your-frontend.vercel.app
ADMIN_CORS=https://your-admin-url.com
AUTH_CORS=https://your-frontend.vercel.app

# Secrets (generate strong random strings)
JWT_SECRET=your_super_secret_jwt_key_min_32_chars
COOKIE_SECRET=your_super_secret_cookie_key_min_32_chars

# AWS S3 (for file storage - if using S3)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=ap-south-1
AWS_BUCKET=your-bucket-name

# Medusa Admin (optional)
MEDUSA_ADMIN_ONBOARDING_TYPE=default
MEDUSA_ADMIN_ONBOARDING_NEXTJS_DIRECTORY=../

# Node Environment
NODE_ENV=production
```

### Generating Secrets

For `JWT_SECRET` and `COOKIE_SECRET`, generate strong random strings:

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Using OpenSSL
openssl rand -hex 32
```

---

## PWA Configuration

The PWA is already configured in the codebase. Ensure:

1. **Icons are present** in `/public`:
   - `icon-192x192.png`
   - `icon-512x512.png`
   - If missing, create them (192x192 and 512x512 PNG files)

2. **Service Worker** (`/public/sw.js`) is properly served:
   - The `vercel.json` ensures correct headers
   - Service worker is registered in `src/app/sw-register.tsx`

3. **Manifest** is configured:
   - `src/app/manifest.ts` generates the manifest
   - Accessible at `/manifest`

4. **HTTPS Required**: 
   - PWAs require HTTPS
   - Vercel provides HTTPS by default
   - Your backend must also use HTTPS

### Testing PWA

1. Deploy to Vercel
2. Open your site in Chrome/Edge
3. Open DevTools → Application → Service Workers
4. Check if service worker is registered
5. Use "Add to Home Screen" to test install prompt

---

## Post-Deployment Checklist

### Frontend
- [ ] Environment variables set in Vercel
- [ ] Build succeeds without errors
- [ ] Site loads correctly
- [ ] Can connect to backend API
- [ ] PWA manifest accessible at `/manifest`
- [ ] Service worker registers correctly
- [ ] Icons display properly

### Backend
- [ ] Database migrations run successfully
- [ ] Environment variables configured
- [ ] CORS allows frontend domain
- [ ] Backend URL accessible (not returning errors)
- [ ] Admin panel accessible (if configured)
- [ ] File uploads work (if using S3)

### Integration
- [ ] Frontend can fetch products from backend
- [ ] Cart functionality works
- [ ] Authentication works
- [ ] Checkout process works
- [ ] Images load correctly

---

## Troubleshooting

### Frontend Issues

**Build fails:**
- Check Node.js version (should be 18+)
- Ensure all dependencies are in `package.json`
- Check for TypeScript errors

**Can't connect to backend:**
- Verify `MEDUSA_BACKEND_URL` is correct
- Check CORS settings in backend
- Ensure backend is running and accessible

**PWA not working:**
- Ensure site is served over HTTPS
- Check browser console for service worker errors
- Verify manifest is accessible at `/manifest`

### Backend Issues

**Database connection fails:**
- Verify `DATABASE_URL` is correct
- Check database is running and accessible
- Ensure migrations have run

**CORS errors:**
- Update `STORE_CORS` and `AUTH_CORS` with your frontend URL
- Restart backend after changing CORS settings

**Build fails:**
- Check Node.js version (Medusa requires 18+)
- Ensure all dependencies are installed
- Check for TypeScript errors

---

## Support

For issues:
- Medusa Docs: https://docs.medusajs.com
- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs

