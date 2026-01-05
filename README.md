This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment

This project consists of:
- **Frontend**: Next.js app (this directory)
- **Backend**: Medusa ecommerce backend (in `my-medusa-store/`)

### Quick Start

See **[QUICK_DEPLOY.md](./QUICK_DEPLOY.md)** for a 5-minute deployment guide.

### Detailed Guides

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Complete deployment guide for both frontend and backend
- **[my-medusa-store/DEPLOYMENT.md](./my-medusa-store/DEPLOYMENT.md)** - Backend-specific deployment guide

### Deployment Options

**Frontend:**
- ✅ **Vercel** (Recommended) - Free, automatic HTTPS, perfect for Next.js

**Backend:**
- ✅ **Railway** (Recommended) - Easy PostgreSQL setup, great for Medusa
- ✅ **Render** - Free tier available, good alternative
- ✅ **DigitalOcean** - Production-ready, better performance
- ✅ **AWS/GCP/Azure** - Enterprise scale

### PWA Support

This app is configured as a Progressive Web App (PWA):
- Service worker for offline support
- Install prompt for mobile devices
- Manifest for app-like experience

PWA works automatically on Vercel with HTTPS. See `DEPLOYMENT.md` for PWA configuration details.
