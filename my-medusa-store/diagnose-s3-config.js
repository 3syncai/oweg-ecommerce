import fs from 'fs';

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║     S3 Configuration Diagnostic Tool                ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// Check 1: package.json dependencies
console.log('1️⃣ Checking package.json dependencies...');
console.log('─'.repeat(60));

try {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };
  
  const s3Module = allDeps['@medusajs/file-s3'];
  const fileModule = allDeps['@medusajs/file'];
  
  if (s3Module) {
    console.log(`✅ @medusajs/file-s3: ${s3Module}`);
  } else {
    console.log('❌ @medusajs/file-s3: NOT INSTALLED');
    console.log('   Run: npm install @medusajs/file-s3');
  }
  
  if (fileModule) {
    console.log(`✅ @medusajs/file: ${fileModule}`);
  } else {
    console.log('⚠️  @medusajs/file: NOT FOUND');
  }
} catch (e) {
  console.log('❌ Could not read package.json', e instanceof Error ? e.message : e);
}

// Check 2: .env file
console.log('\n2️⃣ Checking .env file...');
console.log('─'.repeat(60));

try {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const envLines = envContent.split('\n');
  
  const s3Keys = [
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
    'S3_REGION',
    'S3_BUCKET'
  ];
  
  s3Keys.forEach(key => {
    const found = envLines.find(line => line.startsWith(key));
    if (found) {
      const value = found.split('=')[1]?.trim();
      if (value && value !== '') {
        console.log(`✅ ${key}: ${value.substring(0, 20)}...`);
      } else {
        console.log(`⚠️  ${key}: EMPTY`);
      }
    } else {
      console.log(`❌ ${key}: NOT FOUND`);
    }
  });
} catch (e) {
  console.log('❌ Could not read .env file', e instanceof Error ? e.message : e);
}

// Check 3: medusa-config file
console.log('\n3️⃣ Checking medusa-config...');
console.log('─'.repeat(60));

const configFiles = ['medusa-config.js', 'medusa-config.ts'];
let configFound = false;

for (const configFile of configFiles) {
  if (fs.existsSync(configFile)) {
    configFound = true;
    console.log(`✅ Found: ${configFile}`);
    
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      
      // Check for S3 configuration
      const hasFileModule = content.includes('@medusajs/file');
      const hasS3Module = content.includes('@medusajs/file-s3');
      const hasModulesArray = content.includes('modules:') || content.includes('modules');
      
      console.log(`\nConfiguration checks:`);
      console.log(`  ${hasModulesArray ? '✅' : '❌'} Has modules array`);
      console.log(`  ${hasFileModule ? '✅' : '❌'} Imports @medusajs/file`);
      console.log(`  ${hasS3Module ? '✅' : '❌'} Configures @medusajs/file-s3`);
      
      if (!hasS3Module) {
        console.log('\n⚠️  S3 module not configured in medusa-config!');
      }
      
      // Show relevant config section
      if (hasModulesArray) {
        console.log('\n📄 Current modules configuration:');
        console.log('─'.repeat(60));
        
        // Extract modules section (simplified)
        const modulesMatch = content.match(/modules:\s*\[[\s\S]*?\]/);
        if (modulesMatch) {
          const modulesSection = modulesMatch[0]
            .split('\n')
            .slice(0, 30) // First 30 lines
            .join('\n');
          console.log(modulesSection);
          if (modulesMatch[0].split('\n').length > 30) {
            console.log('... (truncated)');
          }
        } else {
          console.log('Could not parse modules section');
        }
      }
      
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.log(`⚠️  Could not read ${configFile}: ${message}`);
    }
    break;
  }
}

if (!configFound) {
  console.log('❌ No medusa-config.js or medusa-config.ts found!');
}

// Check 4: Check if Medusa is running
console.log('\n4️⃣ Checking Medusa server status...');
console.log('─'.repeat(60));

import fetch from 'node-fetch';

try {
  const res = await fetch('http://localhost:9000/health', { timeout: 2000 });
  if (res.ok) {
    console.log('✅ Medusa server is running on port 9000');
  } else {
    console.log('⚠️  Server responded but health check failed');
  }
} catch (e) {
  console.log('❌ Medusa server is NOT running', e instanceof Error ? e.message : e);
  console.log('   Start it with: npm run dev');
}

// Summary
console.log('\n' + '═'.repeat(60));
console.log('📋 Summary & Next Steps:');
console.log('═'.repeat(60));
console.log(`
If you see any ❌ or ⚠️  above:

1. Install missing dependencies:
   npm install @medusajs/file-s3

2. Add S3 credentials to .env:
   S3_ACCESS_KEY_ID=AKIAUWCNHNZY64ZR5YO2
   S3_SECRET_ACCESS_KEY=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
   S3_REGION=ap-south-1
   S3_BUCKET=oweg-product-images

3. Update medusa-config.js with modules configuration

4. Restart Medusa server:
   npm run dev

5. Test upload again
`);

console.log('🎉 Diagnostic complete!\n');