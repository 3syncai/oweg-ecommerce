# Render Deployment Guide for Medusa Backend

**Render offers a FREE tier that allows web services!** Perfect for deploying your Medusa backend.

## Step-by-Step Guide

### 1. Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub (free)
3. Verify your email

### 2. Create Web Service (Free Tier)

**Using Your Own Database?** 
- ✅ You can use your own database URL directly!
- Just paste your `DATABASE_URL` in the environment variables (see step 3)
- No need to create a Render database
- Make sure your database is publicly accessible (not localhost)

1. In Render Dashboard, click **"New +"** → **"Web Service"**
2. **Connect Repository:**
   - Connect your GitHub account if not already
   - Select your repository: `3syncal/oweg-ecommerce`
3. **Settings:**
   - **Name**: `oweg-medusa-backend`
   - **Region**: Choose closest to you (e.g., "Singapore" for India, "Oregon" for US)
   - **Branch**: `master` (or your main branch)
   - **Root Directory**: `my-medusa-store` ⚠️ **IMPORTANT!**
   - **Environment**: `Node`
   - **Build Command**: `NODE_OPTIONS=--max-old-space-size=460 npm run build` ⚠️ **Try with memory limit**
   - **Start Command**: `npm start`
   
   **Important:** Medusa requires admin dashboard build. If this fails due to memory, try the workaround below.
   - **Plan**: **Free** (512 MB RAM, 0.1 CPU)
4. Click **"Create Web Service"**

### 3. Configure Environment Variables

In your web service, go to **"Environment"** tab and add:

```env
# Database - Use your own database URL directly!
DATABASE_URL=postgresql://user:password@host:port/database
# OR for MySQL:
# DATABASE_URL=mysql://user:password@host:port/database

# CORS - Replace with your Vercel frontend URL
STORE_CORS=https://your-frontend.vercel.app
AUTH_CORS=https://your-frontend.vercel.app
ADMIN_CORS=https://your-frontend.vercel.app

# Secrets - Generate these (32+ characters each)
JWT_SECRET=<generate-random-32-chars>
COOKIE_SECRET=<generate-random-32-chars>

# AWS S3 (if using file uploads - optional)
S3_BUCKET=your-bucket-name
S3_REGION=ap-south-1
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret

# Environment
NODE_ENV=production
```

**Generate Secrets:**
```bash
# Run in terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Run this twice to get two different secrets.

### 4. Deploy

1. Render will automatically start building
2. Watch the build logs - it should complete in 5-10 minutes
3. Once deployed, you'll get a URL like: `https://oweg-medusa-backend.onrender.com`

### 5. Run Database Migrations ⚠️ **REQUIRED**

After first deployment:

1. Go to your web service → **"Shell"** tab
2. Or use Render's **"Shell"** feature in the service dashboard
3. Run: `npm run migrate`
4. Wait for completion

**Alternative:** You can also SSH into the service if Shell doesn't work.

### 6. Get Your Backend URL

1. Copy your Render service URL (e.g., `https://oweg-medusa-backend.onrender.com`)
2. Update your Vercel frontend environment variables:
   - `NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://oweg-medusa-backend.onrender.com`
   - `MEDUSA_BACKEND_URL=https://oweg-medusa-backend.onrender.com`

---

## Render Free Tier Limitations

**What you get:**
- ✅ 750 hours/month (enough for 24/7 operation)
- ✅ 512 MB RAM
- ✅ 0.1 CPU
- ✅ Automatic HTTPS
- ✅ Can use your own database (PostgreSQL, MySQL, etc.)

**Limitations:**
- ⚠️ Service spins down after 15 minutes of inactivity (free tier)
- ⚠️ First request after spin-down takes ~30 seconds (cold start)

**Solutions:**
- Use a free uptime monitor (like UptimeRobot) to ping your service every 10 minutes
- Or upgrade to paid plan ($7/month) for always-on service

---

## Post-Deployment Checklist

- [ ] ✅ Web service created with root directory `my-medusa-store`
- [ ] ✅ Database URL configured (your own or Render's)
- [ ] ✅ Environment variables set (especially `DATABASE_URL`)
- [ ] ✅ Build completed successfully
- [ ] ✅ Service is running (check logs)
- [ ] ✅ Database migrations run (`npm run migrate`)
- [ ] ✅ Backend URL accessible (try `/health` endpoint)
- [ ] ✅ Frontend environment variables updated
- [ ] ✅ Frontend can connect to backend

---

## Troubleshooting

### Build Fails (Memory Issues) or "Could not find index.html"
- **Problem:** Medusa requires admin dashboard build, but free tier has only 512 MB RAM
- **Solution 1:** Try building with memory limit: `NODE_OPTIONS=--max-old-space-size=460 npm run build`
- **Solution 2:** If Solution 1 fails, create minimal admin build manually:
  1. Add Pre-Deploy Command: `mkdir -p .medusa/admin && echo '<!DOCTYPE html><html><head><title>Admin</title></head><body><h1>Admin</h1></body></html>' > .medusa/admin/index.html`
  2. This creates a minimal index.html to satisfy Medusa's check
- **Solution 3:** Upgrade to paid plan ($7/month) for more RAM
- **Check:** Root directory is set to `my-medusa-store`
- **Check:** Node version (Medusa needs Node 18+)

### Service Won't Start
- **Check:** Start command is `npm start`
- **Check:** `DATABASE_URL` is set correctly
- **Check:** All required environment variables are set
- **Check:** Logs for specific error messages

### Database Connection Errors
- **Check:** `DATABASE_URL` format is correct (postgresql:// or mysql://)
- **Check:** Database is accessible from Render's servers (not localhost)
- **Check:** Database credentials are correct
- **Check:** Database allows connections from Render's IP addresses
- **Tip:** If using your own database, ensure it's publicly accessible (not behind a firewall)

### CORS Errors
- **Check:** `STORE_CORS` and `AUTH_CORS` match your exact Vercel URL
- **Check:** No trailing slashes in URLs
- **Check:** Restart service after changing CORS

### Service Spins Down (Free Tier)
- **Solution:** Use UptimeRobot (free) to ping your service every 10 minutes
- **Or:** Upgrade to paid plan for always-on service

---

## Setting Up Uptime Monitor (Free)

To prevent your Render service from spinning down:

1. Sign up at [UptimeRobot.com](https://uptimerobot.com) (free)
2. Add a new monitor:
   - **Type**: HTTP(s)
   - **URL**: `https://oweg-medusa-backend.onrender.com/health`
   - **Interval**: 5 minutes
3. This will ping your service every 5 minutes, keeping it awake

---

## Next Steps

1. ✅ Backend deployed on Render
2. ✅ Migrations run
3. ✅ Get backend URL
4. ✅ Update Vercel frontend with backend URL
5. ✅ Test connection
6. ✅ Deploy frontend to Vercel

---

## Support

- Render Docs: https://render.com/docs
- Render Status: https://status.render.com
- Medusa Docs: https://docs.medusajs.com

