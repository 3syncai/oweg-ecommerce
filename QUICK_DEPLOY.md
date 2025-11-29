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

## 🔧 Backend (Railway) - 10 Minutes

1. **Sign up at [railway.app](https://railway.app)**

2. **Create Project**
   - New Project → Deploy from GitHub
   - Select your repo
   - **Set Root Directory**: `my-medusa-store`

3. **Add PostgreSQL**
   - Click "+ New" → Database → PostgreSQL
   - Railway auto-sets `DATABASE_URL`

4. **Set Environment Variables**
   ```env
   STORE_CORS=https://your-frontend.vercel.app
   AUTH_CORS=https://your-frontend.vercel.app
   ADMIN_CORS=https://your-frontend.vercel.app
   JWT_SECRET=<generate-random-32-chars>
   COOKIE_SECRET=<generate-random-32-chars>
   NODE_ENV=production
   ```

5. **Run Migrations**
   ```bash
   railway run npm run migrate
   ```
   (Install Railway CLI: `npm i -g @railway/cli`)

6. **Get Backend URL**
   - Copy the URL from Railway dashboard
   - Update frontend's `MEDUSA_BACKEND_URL`

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

## 🆘 Need Help?

See `DEPLOYMENT.md` for detailed instructions and troubleshooting.

