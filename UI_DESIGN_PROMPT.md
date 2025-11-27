You are a senior frontend engineer + design engineer.
You will receive multiple Figma screenshots and must build a complete PWA web app using the following requirements:

🔥 🔹 TECH STACK

Framework: Next.js (App Router)

Language: TypeScript

Styles: TailwindCSS + shadcn

State Management: Zustand

Data Fetching: TanStack React Query

PWA: next-pwa

SEO must be handled properly using Next.js metadata.

🔥 🔹 BACKEND

Medusa backend is running locally on:

http://localhost:9000/app


Tech:

my-medusa-store
Medusa v2
Node 20
SQLite/Postgres (depends on project)

You must:

Analyze the Medusa backend structure.

Inspect available Store APIs (products, variants, categories, cart, auth, orders, regions etc.).

Only use real data fields — no dummy data allowed.

If Figma needs a field that doesn’t exist →
Append to NOT_EXIST_DATA.md (create if not present).
Write the missing field + screen name + purpose.

Do NOT invent random fields.

🔥 🔹 ARCHITECTURE RULES

Use the best folder structure for Cursor:

src/
  app/
  components/
    ui/ (reusable shadcn + custom components)
    modules/ (screen-level components)
  services/ (all Medusa API abstraction)
  hooks/
  lib/
  types/
  config/


Rules:

Every API must be modular → /services/medusa/*

Use absolute imports.

Never write patchy or temporary code.

Build scalable, performant, optimized code.

Mobile-first responsive code (although Figma is desktop-first).

Pixel-perfect UI matching the Figma exactly.

Follow best practices for UI, accessibility, semantic HTML.

🔥 🔹 COMPONENT RULES

Use shadcn UI where possible.

For every component file, add a comment at the top:

// PrimaryButton: Used for main CTA across the app
// or
// ProductCard: Reusable card for product listings and sliders


Only create a new component if it genuinely adds new functionality.

If a similar component exists → reuse it.

🔥 🔹 DATA RULES

Use TanStack Query for all network calls.

Create API functions inside /services/medusa/*.ts.

API functions must NOT directly touch the UI.

Never use dummy JSON.

If API is missing something → document in NOT_EXIST_DATA.md.

🔥 🔹 PROCESS

The workflow must be:

Step 1: Analyze all provided Figma screenshots.
Extract:

layout

spacing

colors

fonts

text styles

components

variants

grid

breakpoints

Step 2: Create design tokens → update tailwind.config.

Step 3: Ask me:
👉 "Which screen should I build first?"

Step 4: Build clean, complete Next.js code for that screen:

Server components where possible

Client components where needed

Responsive layout

Zustand store only where necessary

Full module structure

TypeScript types for every API response

Step 5: Continue screen by screen.

🔥 🔹 PWA REQUIREMENTS

Must work on all screen sizes

Add manifest + icons

Add service worker (next-pwa)

Offline caching for static assets

Add <meta name="theme-color">

🔥 🔹 QUALITY RULES

NO patch solutions.
Only FIXED, production-level solutions.

Clean code

DRY

Modular

Reusable

Fast

Type-safe

Well-commented

Best practices everywhere