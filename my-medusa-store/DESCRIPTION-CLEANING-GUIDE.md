# Product Description Cleaning - Complete Guide

## ✅ What Was Done

### 1. **Installed Required Packages** ✓
```bash
npm install he sanitize-html
```

### 2. **Created Files** ✓

#### `scripts/clean-descriptions.cjs`
Bulk script to clean all existing product descriptions in Medusa.

**Features**:
- Decodes HTML entities (handles double/triple encoding)
- Removes inline styles and classes
- Removes `<span>` tags
- Sanitizes HTML (allows only safe tags)
- Processes all products in batches

#### `src/etl/html-cleaner.ts`
Reusable TypeScript module for ETL to clean descriptions during migration.

**Functions**:
- `decodeMulti(s: string)` - Decode HTML entities multiple times
- `cleanHtml(raw: string)` - Full cleaning pipeline

### 3. **Updated ETL Migration** ✓
Modified `src/etl/migration.ts` to automatically clean descriptions during product import.

**Change**:
```typescript
// Before:
description: product.description,

// After:
description: cleanHtml(product.description || ""),
```

---

## 🚀 How to Use

### **Option 1: Clean Existing Products**

If you already have products with messy descriptions:

```powershell
cd C:\Users\jhakr\OneDrive\Desktop\oweg_ecommerce\oweg-ecommerce\my-medusa-store

# Make sure Medusa server is running
npm run dev

# In another terminal, run the cleaning script
node scripts/clean-descriptions.cjs
```

**Expected Output**:
```
========================================
CLEANING PRODUCT DESCRIPTIONS
========================================

✔ cleaned prod_01K9T69YAXMJK68YFK28FVMZ06 | Pigeon Deluxe Aluminium Pressure Cooker
— skipped prod_01K9T6A2BXNQR8YFK38GVNZ07 | Prestige Induction Cooktop
✔ cleaned prod_01K9T6B3CYNRS9ZGL49HWOA08 | Butterfly Mixer Grinder
...

========================================
Done. Changed 45/150.
========================================
```

### **Option 2: Future Migrations (Automatic)**

All future product migrations will automatically clean descriptions:

```powershell
# Just run migration as normal
node scripts/run-migration.js 10
```

Descriptions will be cleaned automatically during import!

---

## 🧹 What Gets Cleaned

### **Before Cleaning**:
```html
&lt;p style=&quot;color: red;&quot; class=&quot;product-desc&quot;&gt;&lt;span&gt;Made from &lt;strong&gt;high quality&lt;/strong&gt; aluminum&lt;/span&gt;&lt;/p&gt;
&lt;ul&gt;
  &lt;li style=&quot;margin: 10px;&quot;&gt;Gas Stovetop Compatible&lt;/li&gt;
  &lt;li class=&quot;feature&quot;&gt;Food-grade gaskets&lt;/li&gt;
&lt;/ul&gt;
```

### **After Cleaning**:
```html
<p>Made from <strong>high quality</strong> aluminum</p>
<ul>
  <li>Gas Stovetop Compatible</li>
  <li>Food-grade gaskets</li>
</ul>
```

### **Cleaning Steps**:
1. ✅ Decode HTML entities (`&lt;` → `<`, `&quot;` → `"`)
2. ✅ Handle double/triple encoding
3. ✅ Remove inline `style` attributes
4. ✅ Remove `class` attributes
5. ✅ Remove `<span>` tags (keeps content)
6. ✅ Sanitize HTML (only allow safe tags)
7. ✅ Trim whitespace

### **Allowed HTML Tags**:
- Paragraphs: `<p>`
- Lists: `<ul>`, `<ol>`, `<li>`
- Formatting: `<strong>`, `<em>`, `<b>`, `<i>`
- Headings: `<h2>`, `<h3>`
- Line breaks: `<br>`
- Links: `<a>` (with `href`, `title`, `target`, `rel` attributes)

---

## 🎨 Frontend Display (Next.js)

### **Current Status**
Your storefront uses API routes to fetch products. When you create a product detail page, render the description as HTML:

### **Example Product Page**:
```tsx
// app/products/[id]/page.tsx
import DOMPurify from 'isomorphic-dompurify';

export default async function ProductPage({ params }: { params: { id: string } }) {
  const product = await fetchProduct(params.id);
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold">{product.title}</h1>
      
      {/* Render sanitized HTML description */}
      <div 
        className="prose max-w-none mt-4"
        dangerouslySetInnerHTML={{ __html: product.description ?? "" }}
      />
    </div>
  );
}
```

### **Why It's Safe**:
- Descriptions are already sanitized before saving to Medusa
- Only safe HTML tags are allowed
- No inline styles or scripts
- No dangerous attributes

### **Styling with Tailwind**:
The `prose` class from `@tailwindcss/typography` automatically styles:
- Paragraphs with proper spacing
- Lists with bullets/numbers
- Bold and italic text
- Headings with appropriate sizes

---

## 📊 Verification

### **Check Cleaned Descriptions**:
```powershell
# View a product in Medusa Admin
# Go to: http://localhost:9000/app/products
# Click on a product
# Check the Description field - should be clean HTML
```

### **Test in API**:
```powershell
$base = "http://localhost:9000"
$hAdm = @{ Authorization = "Basic $env:MEDUSA_ADMIN_BASIC" }
$product = (Invoke-RestMethod "$base/admin/products?limit=1" -Headers $hAdm).products[0]

Write-Host "Title: $($product.title)"
Write-Host "Description:`n$($product.description)"
```

---

## 🔄 Complete Workflow

### **For Fresh Migration (Recommended)**:
```powershell
# 1. Flush existing products
node scripts/medusa-flush.js

# 2. Migrate with automatic cleaning
node scripts/run-migration.js 999999

# All descriptions will be clean!
```

### **For Existing Products**:
```powershell
# Clean descriptions of already-imported products
node scripts/clean-descriptions.cjs
```

---

## 🛠️ Technical Details

### **HTML Entity Decoding**
Handles multiple levels of encoding:
```
Input:  &amp;lt;p&amp;gt;Text&amp;lt;/p&amp;gt;
Step 1: &lt;p&gt;Text&lt;/p&gt;
Step 2: <p>Text</p>
Output: <p>Text</p>
```

### **Sanitization Rules**
```javascript
allowedTags: ['p','ul','ol','li','br','strong','em','b','i','h2','h3']
allowedAttributes: { a: ['href','title','target','rel'] }
```

### **Performance**
- Processes 100 products per batch
- ~1-2 seconds per product (includes API calls)
- For 150 products: ~3-5 minutes total

---

## 🎯 Benefits

✅ **Clean HTML**: No messy encoded entities
✅ **Consistent Formatting**: All descriptions follow same rules
✅ **Safe Display**: No XSS vulnerabilities
✅ **Better SEO**: Clean HTML is more readable by search engines
✅ **Automatic**: Future migrations clean descriptions automatically


---

## 📝 Example Transformations

### **Example 1: Double-Encoded HTML**
```
Before: &amp;lt;p&amp;gt;Made from &amp;lt;strong&amp;gt;aluminum&amp;lt;/strong&amp;gt;&amp;lt;/p&amp;gt;
After:  <p>Made from <strong>aluminum</strong></p>
```

### **Example 2: Inline Styles**
```
Before: <p style="color: red; font-size: 14px;">Gas Stovetop Compatible</p>
After:  <p>Gas Stovetop Compatible</p>
```

### **Example 3: Unnecessary Spans**
```
Before: <p><span class="text">Food-grade <span>gaskets</span></span></p>
After:  <p>Food-grade gaskets</p>
```

### **Example 4: Complex Lists**
```
Before: &lt;ul style=&quot;margin: 10px;&quot;&gt;
          &lt;li class=&quot;item&quot;&gt;&lt;span&gt;Feature 1&lt;/span&gt;&lt;/li&gt;
          &lt;li style=&quot;color: blue;&quot;&gt;Feature 2&lt;/li&gt;
        &lt;/ul&gt;

After:  <ul>
          <li>Feature 1</li>
          <li>Feature 2</li>
        </ul>
```

---

## 🔍 Troubleshooting

### **Script fails with "List failed: 401"**
- Check `MEDUSA_ADMIN_BASIC` is set in `.env`
- Ensure Medusa server is running on port 9000

### **No products changed**
- Descriptions might already be clean
- Check if products have descriptions at all

### **Frontend shows plain text instead of HTML**
- Use `dangerouslySetInnerHTML` to render HTML
- Add `prose` class for styling

### **Some HTML tags are removed**
- Only safe tags are allowed (see allowed tags list above)
- Add more tags to `allowedTags` in `html-cleaner.ts` if needed

---

## 📞 Support

If descriptions still look messy after cleaning:
1. Check the raw HTML in Medusa Admin
2. Verify the cleaning script ran successfully
3. Check browser console for rendering errors
4. Ensure Tailwind CSS `prose` plugin is installed

---

## ✨ Summary

✅ **Installed**: `he`, `sanitize-html`
✅ **Created**: `clean-descriptions.cjs`, `html-cleaner.ts`
✅ **Updated**: `migration.ts` to auto-clean
✅ **Ready**: Run script to clean existing products
✅ **Automatic**: Future migrations clean automatically

**Next Step**: Run `node scripts/clean-descriptions.cjs` to clean existing products!

