# Missing Data Fields

This file documents data fields that are shown in the Figma design but don't exist in the current Medusa backend.

## Category/Subcategory Images

**Screen**: Category Page - Subcategory Circular Icons  
**Field**: `category.metadata.image` or `category.metadata.icon`  
**Purpose**: Display circular icons for subcategories in the horizontal scrollable section  
**Current Workaround**: Using placeholder images and OWEG logo  
**Recommended Solution**: Add image field to category metadata or create a dedicated category_images table

---

## Product Brand

**Screen**: Category Page - Filter Sidebar (Brand Filter)  
**Field**: `product.brand` or `product.metadata.brand`  
**Purpose**: Filter products by brand name  
**Current Workaround**: Using hardcoded brand list and filtering by product name matching  
**Recommended Solution**: Add brand as a product field or structured metadata

---

## Product Reviews/Ratings

**Screen**: Category Page - Filter Sidebar (Customer Review Filter)  
**Field**: `product.average_rating` or `product.reviews`  
**Purpose**: Filter products by customer star ratings (1-5 stars)  
**Current Workaround**: Filter UI exists but not functional  
**Recommended Solution**: Implement product reviews system with ratings

---

## Limited Time Deal Flag

**Screen**: Category Page - Product Cards, Home Page  
**Field**: `product.metadata.limited_deal` or deal/promotion system  
**Purpose**: Display "Limited time deal" badge on products  
**Current Workaround**: Automatically showing badge if discount >= 20%  
**Recommended Solution**: Add explicit deal/promotion system with start/end dates

---

## Category Deal Status

**Screen**: Category Page - Filter Sidebar (Today's Deals)  
**Field**: Deal/Promotion system linked to categories  
**Purpose**: Filter products that are part of today's deals  
**Current Workaround**: Checkbox exists but not functional  
**Recommended Solution**: Implement time-based deals/promotions system

---

## Product Inventory Display

**Screen**: Product Detail Page  
**Field**: `product.stock_status` or user-friendly inventory message  
**Purpose**: Show "In Stock", "Out of Stock", or "Only X left" messages  
**Current Workaround**: Not displayed (variant inventory exists but not surfaced)  
**Recommended Solution**: Add stock status display logic based on inventory_quantity

