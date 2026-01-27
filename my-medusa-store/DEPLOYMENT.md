# Medusa Backend Deployment Guide

This guide is specific to deploying the Medusa backend located in `my-medusa-store/`.

## Quick Start: Railway (Recommended)

Railway is the easiest way to deploy Medusa with automatic PostgreSQL setup.

### Step-by-Step

1. **Sign up at [railway.app](https://railway.app)** with GitHub

2. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - **Important**: Set root directory to `my-medusa-store`

3. **Add PostgreSQL Database**
   - In your project dashboard, click "+ New"
   - Select "Database" → "PostgreSQL"
   - Railway automatically creates `DATABASE_URL` environment variable

4. **Configure Environment Variables**
   
   Go to your service → Variables tab and add:

   ```env
   # Database (auto-set by Railway, but verify it exists)
   DATABASE_URL=postgresql://... (auto-provided)

   # CORS - Replace with your frontend URL
   STORE_CORS=https://your-frontend.vercel.app
   ADMIN_CORS=https://your-admin-url.com
   AUTH_CORS=https://your-frontend.vercel.app

   # Secrets - Generate strong random strings
   JWT_SECRET=<generate-32-char-random-string>
   COOKIE_SECRET=<generate-32-char-random-string>

   # AWS S3 (if using file uploads)
   AWS_ACCESS_KEY_ID=your_key
   AWS_SECRET_ACCESS_KEY=your_secret
   AWS_REGION=ap-south-1
   AWS_BUCKET=your-bucket-name

   # Environment
   NODE_ENV=production
   ```

5. **Configure Build Settings**
   - Railway usually auto-detects, but verify:
     - **Build Command**: `npm run build`
     - **Start Command**: `npm start`

6. **Run Database Migrations**
   
   After first deployment, run migrations:
   
   Option A: Using Railway CLI
   ```bash
   npm install -g @railway/cli
   railway login
   railway link
   railway run npm run migrate
   ```
   
   Option B: Using Railway Dashboard
   - Go to your service → Deployments
   - Click on latest deployment → "View Logs"
   - Or use the "Shell" feature to run commands

7. **Get Your Backend URL**
   - Railway provides a URL like `https://your-app.up.railway.app`
   - Copy this URL
   - Update your frontend's `MEDUSA_BACKEND_URL` environment variable

8. **Seed Database (Optional)**
   ```bash
   railway run npm run seed
   ```

---

## Alternative: Render

### Step-by-Step

1. **Sign up at [render.com](https://render.com)** with GitHub

2. **Create PostgreSQL Database**
   - Click "New +" → "PostgreSQL"
   - Name: `oweg-medusa-db`
   - Copy the "Internal Database URL"

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect GitHub repository
   - **Settings**:
     - **Name**: `oweg-medusa-backend`
     - **Root Directory**: `my-medusa-store`
     - **Environment**: `Node`
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`

4. **Set Environment Variables**
   - In web service → "Environment"
   - Add all variables from Railway section above
   - Set `DATABASE_URL` to the PostgreSQL URL from step 2

5. **Deploy**
   - Click "Create Web Service"
   - Wait for build to complete
   - Get your URL (e.g., `https://oweg-medusa-backend.onrender.com`)

6. **Run Migrations**
   - Use Render Shell:
     ```bash
     cd my-medusa-store
     npm run migrate
     ```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `STORE_CORS` | Frontend store URL | `https://your-app.vercel.app` |
| `ADMIN_CORS` | Admin panel URL | `https://admin.your-app.com` |
| `AUTH_CORS` | Auth callback URL | `https://your-app.vercel.app` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | Generate random string |
| `COOKIE_SECRET` | Cookie encryption secret (32+ chars) | Generate random string |
| `NODE_ENV` | Environment | `production` |

### Optional Variables

| Variable | Description | When Needed |
|----------|-------------|-------------|
| `AWS_ACCESS_KEY_ID` | AWS access key | If using S3 file storage |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | If using S3 file storage |
| `AWS_REGION` | AWS region | If using S3 |
| `AWS_BUCKET` | S3 bucket name | If using S3 |

### Generating Secrets

```bash
# Generate JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate COOKIE_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Database Migrations

Always run migrations after deployment:

```bash
npm run migrate
```

Or using the platform's CLI/shell:
- Railway: `railway run npm run migrate`
- Render: Use Render Shell
- DigitalOcean: Use App Platform console

---

## Post-Deployment Checklist

- [ ] Backend URL is accessible (returns 200 OK)
- [ ] Database migrations completed
- [ ] Environment variables set correctly
- [ ] CORS allows frontend domain
- [ ] Can access `/health` endpoint
- [ ] Admin panel accessible (if configured)
- [ ] Frontend can connect to backend
- [ ] File uploads work (if using S3)

---

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` format is correct
- Check database is running and accessible
- Ensure database allows connections from your hosting platform

### CORS Errors
- Update `STORE_CORS` and `AUTH_CORS` with exact frontend URL
- Restart service after changing CORS
- Check for trailing slashes in URLs

### Build Failures
- Ensure Node.js version is 18+
- Check all dependencies in `package.json`
- Review build logs for specific errors

### Migration Issues
- Run migrations manually using platform shell
- Check database connection before running migrations
- Verify database user has migration permissions

---

## Getting Medusa API Keys

After deployment:

1. Access your Medusa Admin (if configured)
2. Or use Medusa CLI to create admin user:
   ```bash
   npx medusa user -e admin@example.com -p password
   ```
3. Get publishable key from Admin → Settings → API Keys

---

---

## Standalone: Medusa Admin Dashboard on Vercel

If you want to host **only** the admin dashboard on Vercel (separate from your backend), follow these steps.

### 1. Preparation
Ensure you have a `vercel.json` file in your `my-medusa-store` folder with the following content. This is **REQUIRED** for Vercel pick up the rewrites for the `/app` prefix:

```json
{
  "rewrites": [
    { "source": "/app/assets/(.*)", "destination": "/assets/$1" },
    { "source": "/app/(.*)", "destination": "/index.html" },
    { "source": "/", "destination": "/index.html" }
  ]
}
```

### 2. Vercel Project Setup
1. **Import your repository** to Vercel.
2. Select the `my-medusa-store` folder as the **Root Directory**.
3. **Build Settings**:
   - **Framework Preset**: `Other`
   - **Build Command**: `MEDUSA_ADMIN_BACKEND_URL=$MEDUSA_ADMIN_BACKEND_URL npx @medusajs/medusa-cli build`
   - **Output Directory**: `.medusa/server/public/admin`
   - **Install Command**: `npm install`
4. **Environment Variables**:
   To fix CORS, set these to your **Dashboard's own Vercel URL**. This tells the dashboard to talk to Vercel, which then proxies requests to your API:
   - `MEDUSA_ADMIN_BACKEND_URL`: `https://ecomm-admin-ecru.vercel.app`
   - `BACKEND_URL`: `https://ecomm-admin-ecru.vercel.app`
   - `VITE_MEDUSA_ADMIN_BACKEND_URL`: `https://ecomm-admin-ecru.vercel.app`

### 3. Backend Configuration
Ensure your Medusa backend has the Vercel Admin URL in its `ADMIN_CORS` environment variable.

---

## Support

