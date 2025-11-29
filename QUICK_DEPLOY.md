# Quick Deployment Checklist

## 🚀 Frontend (Vercel) - 5 Minutes

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Ready for deployment"
   git push
   ```

2. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repo
   - **Root Directory**: Leave as root (`.`)
   - Click "Deploy"

3. **Set Environment Variables** (in Vercel Dashboard)
   ```env
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=<your-backend-url>
   MEDUSA_BACKEND_URL=<your-backend-url>
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<from-medusa-admin>
   MEDUSA_PUBLISHABLE_KEY=<from-medusa-admin>
   NEXT_PUBLIC_MEDUSA_SALES_CHANNEL_ID=<from-medusa-admin>
   MEDUSA_SALES_CHANNEL_ID=<from-medusa-admin>
   NEXT_PUBLIC_MEDUSA_REGION_ID=<from-medusa-admin>
   MEDUSA_REGION_ID=<from-medusa-admin>
   ```

4. **Redeploy** after setting environment variables

---

## 🔧 Backend (Render) - 10 Minutes ⭐ **FREE TIER WORKS!**

**Note:** Railway's free tier only allows databases. Use Render instead - it allows web services on free tier!

1. **Sign up at [render.com](https://render.com)** (free with GitHub)

2. **Create PostgreSQL Database**
   - Click "New +" → "PostgreSQL"
   - Name: `oweg-medusa-db`
   - Plan: **Free**
   - Copy the **"Internal Database URL"**

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect GitHub repo: `3syncal/oweg-ecommerce`
   - **Settings:**
     - Name: `oweg-medusa-backend`
     - Root Directory: `my-medusa-store` ⚠️ **IMPORTANT!**
     - Build Command: `npm install && npm run build`
     - Start Command: `npm start`
     - Plan: **Free**

4. **Set Environment Variables**
   - Go to "Environment" tab
   ```env
   DATABASE_URL=<paste-internal-database-url-from-step-2>
   STORE_CORS=https://your-frontend.vercel.app
   AUTH_CORS=https://your-frontend.vercel.app
   ADMIN_CORS=https://your-frontend.vercel.app
   JWT_SECRET=<generate-random-32-chars>
   COOKIE_SECRET=<generate-random-32-chars>
   NODE_ENV=production
   ```

5. **Run Migrations** (After deployment)
   - Go to your service → "Shell" tab
   - Run: `npm run migrate`

6. **Get Backend URL**
   - Copy URL from Render (e.g., `https://oweg-medusa-backend.onrender.com`)
   - Update frontend's `MEDUSA_BACKEND_URL`

**See [RENDER_SETUP.md](./RENDER_SETUP.md) for detailed instructions.**

---

## 📱 PWA Setup

✅ Already configured! Just ensure:
- Icons exist: `/public/icon-192x192.png` and `/public/icon-512x512.png`
- Site is served over HTTPS (Vercel does this automatically)
- Service worker will auto-register

---

## 🔑 Getting Medusa API Keys

After backend is deployed:

1. **Create Admin User** (if not exists)
   ```bash
   railway run npx medusa user -e admin@example.com -p yourpassword
   ```

2. **Access Admin Panel**
   - Usually at `https://your-backend.railway.app/app`
   - Or check Medusa docs for admin setup

3. **Get API Keys**
   - Admin → Settings → API Keys
   - Copy publishable key to frontend env vars

---

## ✅ Post-Deployment Test

- [ ] Frontend loads at Vercel URL
- [ ] Backend accessible (try `/health` endpoint)
- [ ] Frontend can fetch products
- [ ] PWA manifest accessible at `/manifest`
- [ ] Service worker registers (check DevTools)
- [ ] Can add to home screen

---

## ⚠️ Railway Free Tier Limitation

If you tried Railway and saw "Limited Access - can only deploy databases":
- **Use Render instead** - free tier allows web services!
- See **[RENDER_SETUP.md](./RENDER_SETUP.md)** for step-by-step guide

## 🆘 Need Help?

- **Render Setup**: See `RENDER_SETUP.md` for detailed Render instructions
- **General**: See `DEPLOYMENT.md` for all deployment options and troubleshooting

