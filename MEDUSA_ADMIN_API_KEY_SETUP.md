# How to Get MEDUSA_ADMIN_API_KEY

The `MEDUSA_ADMIN_API_KEY` is required for the frontend to create draft orders and process checkouts. This is different from the publishable key and provides admin-level access.

## Why You Need This Key

The frontend needs admin API access to:
- Create draft orders during checkout
- Convert draft orders to actual orders
- Process payments and update order status

Without this key, you'll see the error:
```
"Unauthorized: check MEDUSA_ADMIN_API_KEY on frontend server"
```

## Method 1: Generate via Medusa Admin Dashboard (Recommended)

1. **Access Medusa Admin**
   - Go to `http://your-backend-url:9000/app` (or your deployed admin URL)
   - Log in with your admin credentials

2. **Navigate to API Key Management**
   - Click on **Settings** (gear icon) in the sidebar
   - Go to **API Key Management** or **API Keys**

3. **Create New API Key**
   - Click **"Create API Key"** or **"Add API Key"**
   - Select **"Admin"** as the type (not "Publishable")
   - Give it a descriptive name (e.g., "Frontend Checkout API Key")
   - Click **"Create"** or **"Generate"**

4. **Copy the Key**
   - **Important**: Copy the key immediately - you won't be able to see it again!
   - It will look something like: `pk_1234567890abcdef...` or `med_1234567890abcdef...`

5. **Add to Frontend Environment Variables**
   - Go to your Vercel project → Settings → Environment Variables
   - Add: `MEDUSA_ADMIN_API_KEY` = `your_copied_key`
   - Make sure to add it for **Production**, **Preview**, and **Development** environments
   - Redeploy your frontend

## Method 2: Generate via Medusa CLI

If you have access to your Medusa backend server:

1. **SSH into your backend server** (or use Railway/Render shell)

2. **Create an admin user** (if you don't have one):
   ```bash
   cd my-medusa-store
   npx medusa user -e admin@example.com -p your_secure_password
   ```

3. **Generate API Key via Admin Dashboard**
   - Follow Method 1 above after logging in

## Method 3: Generate Programmatically (Advanced)

You can also generate API keys programmatically using Medusa's API or by directly inserting into the database, but this is not recommended for security reasons.

## Security Best Practices

1. **Never commit the key to Git**
   - Always use environment variables
   - Never hardcode it in your code

2. **Rotate keys regularly**
   - Generate new keys periodically
   - Revoke old keys that are no longer needed

3. **Use different keys for different environments**
   - Production key should be different from development
   - Never use production keys in development

4. **Restrict key permissions**
   - Only grant the minimum permissions needed
   - Admin keys have full access - use carefully

## Verifying the Key Works

After setting the key:

1. **Check the error is gone**
   - Try adding items to cart
   - Proceed to checkout
   - The "Unauthorized" error should no longer appear

2. **Check server logs**
   - In Vercel, check function logs
   - You should see successful draft order creation

3. **Test checkout flow**
   - Complete a test order
   - Verify order is created in Medusa Admin

## Troubleshooting

### "Key is invalid" error
- Verify you copied the entire key (no spaces, no line breaks)
- Check the key hasn't expired or been revoked
- Ensure you're using an "Admin" type key, not "Publishable"

### "Key not found" error
- Verify the environment variable name is exactly `MEDUSA_ADMIN_API_KEY`
- Check you added it to the correct environment (Production/Preview/Development)
- Ensure you redeployed after adding the variable

### Still getting 401 errors
- Check backend CORS settings allow your frontend domain
- Verify backend is running and accessible
- Check backend logs for more detailed error messages
- Ensure the key has admin permissions

## Alternative: Use Backend API Route

If you can't set up the admin API key, you could create a backend API route that handles draft order creation server-side, but this is more complex and less secure.

## Related Environment Variables

Make sure you also have these set:
- `MEDUSA_BACKEND_URL` - Your Medusa backend URL
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` - Publishable key (different from admin key)
- `MEDUSA_SALES_CHANNEL_ID` - Sales channel ID

## Need Help?

- Medusa Docs: https://docs.medusajs.com/api/admin
- Medusa Discord: https://discord.gg/medusajs
- Check your backend logs for more detailed error messages


