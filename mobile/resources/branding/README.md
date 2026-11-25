# Oweg app branding

- `logo.png`: 1254 × 1254 PNG master, restored from the supplied logo with the built-in image generation tool.
- `play-store-icon.png`: 512 × 512 PNG export for the Play Console main store listing.
- Installed display name: `Oweg Online Shopping App`.

From `mobile/`, run `npm run assets:generate` to regenerate Android and iOS launcher icons and splash assets. The Play Console listing title and icon are managed separately from the installed app.

Image generation prompt:

> Edit target: attached OWEG logo. Faithfully restore this exact brand logo as a high-resolution 2048x2048 square PNG app icon master. Preserve the exact green OWEG lettering, shopping bag detail inside the O, black registered trademark symbol at upper right, and soft pale yellow circular disk with subtle central glow on a pure white square background. Preserve original relative proportions and layout, center the complete disk in the square with balanced white margins. Sharpen edges and eliminate blur/compression artifacts. Exact text OWEG. Do not redesign, add wording, change lettering shapes, add shadows, or add mockup/device frames. Clean crisp faithful logo reproduction suitable for downscaling to mobile launcher icons.

The tool returned a 1254 × 1254 image; this exceeds the 1024-pixel source size needed by the asset generator.
