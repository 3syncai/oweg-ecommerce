# Subcategory artwork

Generated with the built-in image generation tool, using the supplied `iron.jpeg` as a style reference. The original supplied five artworks are unchanged.

Project assets:
- `public/subcategory-banners/mouse-keyboard.webp`
- `public/subcategory-banners/induction-cooktops.webp`

Both generated originals were encoded as 600 × 800 WebP assets (about 56 KB and 53 KB) for the storefront.

The eighth tile is `public/subcategory-banners/kettles.webp`, generated with built-in imagegen using the same iron artwork as its style reference. Its destination is the populated existing `home-appliances-kettle` category. Tiles now have a desktop width capped at 104px and a mobile width of 72px.

Kettle prompt: Generate ONE new ecommerce subcategory tile matching this supplied STYLE REFERENCE. Match its photorealistic product montage, thick bright leaf-green rounded arch outline, pale lime interior gradient, a few leaves behind products, bottom rounded pill title plaque in dark forest green bold type, white outside background. Replace irons with three realistic electric kettles: one polished stainless-steel kettle, one glass electric kettle and one compact black kettle, recognizably kettles with handles and pouring spouts. Exact title on bottom plaque: "Kettles". No other text, logos, watermarks or promotional claims. Portrait 3:4 composition. Leave about 5% outer white safe margin, balanced small-scale silhouette, legible at 80px wide. This joins an existing row of matching cooler, iron and cookware tiles. Output one finished tile.

## Prompt set

Shared prompt: Generate ONE new ecommerce subcategory tile. Input image is a STYLE REFERENCE only. Match its photorealistic product montage, bright leaf green thick rounded arch outline, pale lime gradient inside, leaves behind products, lower rounded pill-shaped title plaque, dark forest green bold clean typography, plain white outer background. No other text, logos, brands, claims or watermarks. Portrait 3:4 composition, tight balanced framing with minimal outside white margins. This will appear as a small 110px-wide ecommerce navigation thumbnail; strong simple silhouette, legible title. Save generated local output for use in project.

Mouse & Keyboard subject: Replace irons with a premium black desktop keyboard and two black/white computer mice, recognizable realistic devices with accurate keys. Exact title on bottom plaque: "Mouse & Keyboard" on two lines.

Induction & Cooktops subject: Replace irons with two sleek black portable induction cooktops, one front-facing three-quarter angle and one upright behind, with circular heating markings and realistic touch controls. Exact title on bottom plaque: "Induction & Cooktops" on two lines.

## Layout and destinations

One non-wrapping scrollable row at all viewport sizes. Desktop artwork width is capped at 104px; mobile width is 72px. Keyboard focus and native horizontal scrolling reveal later tiles without horizontal page overflow.

Mouse & Keyboard combines the existing mouse and keyboard categories through a storefront-only group. Non-Stick Cookware combines the existing Kadai, Tawa and Fry Pan categories. No catalogue records are created or modified. Induction & Cooktops links to the existing category.


## Compact secondary campaigns (wide v2)

Built-in image generation was used to recompose the supplied campaign images as short, wide secondary banners. Optimized outputs are saved at:
- `public/page-banners/appliances-wide-v2.webp`
- `public/page-banners/coupon-wide-v2.webp`
- `public/page-banners/gifting-wide-v2.webp`

Shared prompt: Edit this supplied ecommerce banner into a SHORT WIDE STRIP, approximately 3.28:1 aspect ratio, ideally 1640x500 pixels. This is a responsive webpage secondary promotion banner, visually much shorter than a homepage hero. Recompose the artwork for the wide canvas, do not crop the existing image and do not letterbox it. Keep the same cream, forest green and warm gold palette, photorealistic product style, room lighting and campaign identity. Keep all essential text fully within the central 90% safe area and legible when rendered at 430x131 pixels. Clean intentional spacing and simple hierarchy. Edge-to-edge composition. No extra border, no new discount claims, no new logos, no watermarks. Output only ONE landscape banner.

Appliances variation: Keep exact offer copy: "Up to 80% OFF" and "on Selected Appliances". Put the offer at left, a curated small group of cooler, mixer, cookware and kettle at right. Remove small bottom benefit-icon row to avoid clutter.

Coupon variation: Keep exact copy: "Use Coupon Code", "OWEG10", "on your First Purchase". Make OWEG10 a prominent coupon panel on the left. Put a compact group of kitchen appliances at the right. Remove small bottom benefit-icon row to avoid clutter.

Gifting variation: Keep exact copy: "Gifting Items" and "Perfect Gifts for Every Occasion". Typography left, a curated group of wrapped mixer, kettle, air fryer and cookware with gold ribbons on the right. Remove small bottom benefit-icon row to avoid clutter.

The 3.28:1 display frames use the existing responsive image component. Original source assets are retained. Campaign destinations and coupon rules are unchanged.

Fan companion banner: public/page-banners/fans-wide-v2.webp. Generated with the gifting banner as a style reference: short wide cream and forest-green living room, walnut ceiling fan and white pedestal fan, headline 'A fresh breeze. Every day.', supporting text 'Find your perfect fan', CTA 'Shop fans'. No people, logo, discount or performance claims.
