const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(__dirname, '../src/pages/Settings.jsx'), 'utf8');

// Find all JSX tags <SomeIcon ...
const jsxTags = [...content.matchAll(/<([A-Z][a-zA-Z0-9]+)/g)].map(m => m[1]);
const uniqueTags = [...new Set(jsxTags)];

// Extract imports from lucide-react
const lucideImportMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
const importedIcons = lucideImportMatch ? lucideImportMatch[1].split(',').map(s => {
  const parts = s.trim().split(/\s+as\s+/);
  return parts.length > 1 ? parts[1].trim() : parts[0].trim();
}).filter(Boolean) : [];

const standardReactTags = ['React', 'Fragment', 'SettingsIcon'];
const missingIcons = uniqueTags.filter(tag => !importedIcons.includes(tag) && !standardReactTags.includes(tag));

console.log('Unique JSX Component tags count:', uniqueTags.length);
console.log('Potentially missing JSX tags:', missingIcons);
