# Creative main banner campaigns

Delivery assets: `public/main-banners/creative-v2/{home,bags,technology,health,kitchen}-{desktop,mobile}.webp`.

Desktop: 1920 x 360. Mobile: 800 x 400, selected at widths up to 767px. Same-named SVG files are editable compositions. Each composition embeds the authentic transparent `public/oweg_logo.png` unchanged, including its shopping-bag O, with no logo badge.

Five distinct art directions:
- Home: sunlit kitchen, bold green typography and yellow sale tag. Big little home upgrades. This is the only campaign with an 80% offer.
- Bags: terracotta fashion editorial, warm brown serif type, reversed photo/copy placement. Carry a little more you.
- Technology: electric blue and navy, lime accents and bold geometric type. Plug into possibilities.
- Sassiest Health Care: blush stone, botanical care scene and soft serif type. A moment, just for you.
- Kitchen: honey oak, cooking ingredients, buttery yellow and a hand-drawn accent. Good food. Great company.

The ten original photographs were generated using the built-in image_gen tool, separately composed for desktop and mobile. Saved photographs are under `creative-v2/art`. They show illustrative products, not exact catalog items. Generation briefs are in `creative-banner-prompts.json`. Mobile generation reused each category brief with a compact 3:2 composition instruction, with large complete products and no text or logos. Generation mode was new image generation with opaque backgrounds.

Run `node scripts/build-creative-banners.cjs` to rebuild final SVG and WebP compositions from the saved photographs. Native SVG composition preserves exact typography, dimensions and authentic brand identity. Rebuilding needs no API call.

All five category links are preserved: Home Appliances, Bags, Computer & Mobile Accessories, Health Care and Kitchen Appliances. Sassiest opens `/c/health-care`. Page banners, category tiles, pricing, inventory and checkout logic are unaffected by this campaign revision.
