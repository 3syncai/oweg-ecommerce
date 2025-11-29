#!/usr/bin/env node

/**
 * Custom build script for Render free tier
 * Skips memory-intensive admin build and creates minimal admin files
 * Medusa will compile backend TypeScript on startup (which works fine)
 */

const fs = require('fs')
const path = require('path')

console.log('🔨 Starting lightweight build for free tier...')

// Step 1: Create minimal admin directory and index.html
console.log('📝 Creating minimal admin files...')
const adminDir = path.join(process.cwd(), '.medusa', 'admin')
const adminIndexPath = path.join(adminDir, 'index.html')

// Create directory if it doesn't exist
if (!fs.existsSync(adminDir)) {
  fs.mkdirSync(adminDir, { recursive: true })
}

// Create minimal index.html to satisfy Medusa's check
const minimalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medusa Admin</title>
</head>
<body>
  <h1>Medusa Admin</h1>
  <p>Admin dashboard is not available in this deployment.</p>
  <p>The API is fully functional.</p>
</body>
</html>`

fs.writeFileSync(adminIndexPath, minimalHtml)
console.log('✅ Created minimal admin index.html')

// Step 2: Ensure server directory exists (Medusa will compile on startup)
const serverDir = path.join(process.cwd(), '.medusa', 'server')
if (!fs.existsSync(serverDir)) {
  console.log('📁 Creating server directory...')
  fs.mkdirSync(serverDir, { recursive: true })
}

console.log('✅ Lightweight build completed!')
console.log('📌 Note: Backend will compile TypeScript on startup (no performance impact)')
console.log('📌 Admin UI is not available, but API is fully functional.')

