'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageRoot = path.dirname(require.resolve('oj-designsystem/package.json'));
const packageJson = require(path.join(packageRoot, 'package.json'));
const dist = path.join(packageRoot, 'dist');
const target = path.join(root, 'vendor', 'oj-designsystem');
const notices = ['LICENSE', 'THIRD-PARTY-NOTICES.md'];

for (const file of ['dist/styles.css', 'dist/index.js', 'dist/licenses', ...notices]) {
    if (!fs.existsSync(path.join(packageRoot, file))) {
        throw new Error(`oj-designsystem distribution file missing: ${file}`);
    }
}

// Keep the published directory structure: CSS resolves its local fonts and icons
// relative to the stylesheet, and every bundled asset retains its license.
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(dist, target, { recursive: true });
for (const file of notices) {
    fs.copyFileSync(path.join(packageRoot, file), path.join(target, file));
}
fs.rmSync(path.join(root, 'vendor', 'pinefetch.css'), { force: true });

console.log(`Imported oj-designsystem ${packageJson.version} into ${path.relative(root, target)}`);
