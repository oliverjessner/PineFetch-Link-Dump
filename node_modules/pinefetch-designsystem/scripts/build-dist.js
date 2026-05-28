const fs = require('fs');
const path = require('path');

const sourcePath = path.join('design-system', 'pinefetch.css');
const distDir = 'dist';
const distPath = path.join(distDir, 'pinefetch.css');

const source = fs.readFileSync(sourcePath, 'utf8');
const minified = source
    .replace(/\/\*[^!*][\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>~])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(distPath, `${minified}\n`);

console.log(`${sourcePath} -> ${distPath}`);
console.log(`${Buffer.byteLength(source)} bytes -> ${Buffer.byteLength(minified)} bytes`);
