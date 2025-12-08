const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'scripts');

if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
}

fs.readdirSync(dir).forEach(file => {
    if (!file.endsWith('.ts')) return;
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    let changed = false;
    
    // Regex for import (loose matching)
    // Matches: import { ExecArgs } from "@medusajs/framework/types"
    const importRegex = /import\s*\{\s*ExecArgs\s*\}\s*from\s*['"]@medusajs\/framework\/types['"]\s*;?/g;
    if (importRegex.test(content)) {
        content = content.replace(importRegex, '// $&');
        changed = true;
    }

    // Replace usage: : ExecArgs -> : any
    // Also matches if it has whitespace
    const usageRegex = /:\s*ExecArgs/g;
    if (usageRegex.test(content)) {
        content = content.replace(usageRegex, ': any');
        changed = true;
    }
    
    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Fixed ${file}`);
    }
});
