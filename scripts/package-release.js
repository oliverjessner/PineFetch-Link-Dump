'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const manifest = require(path.join(root, 'manifest.json'));

if (packageJson.version !== manifest.version) {
    throw new Error(`Version mismatch: package.json=${packageJson.version}, manifest.json=${manifest.version}`);
}

const version = manifest.version;
const distDir = path.join(root, 'dist');
const outputPath = path.join(distDir, `PineFetch-Link-Dump-${version}.zip`);

const files = [
    'manifest.json',
    'popup.html',
    'popup.js',

    'providers/facebook.js',
    'providers/instagram.js',
    'providers/reddit.js',
    'providers/standard-video.js',
    'providers/tiktok.js',
    'providers/x.js',
    'providers/youtube.js',

    'vendor/pinefetch.css',

    'assets/icons/icon-16.png',
    'assets/icons/icon-32.png',
    'assets/icons/icon-48.png',
    'assets/icons/icon-128.png',

    'assets/images/logo.png',
].sort();

for (const file of files) {
    const absolutePath = path.join(root, file);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Release file missing: ${file}`);
    }
}

async function createReleaseArchive() {
    const { ZipArchive } = await import('archiver');

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    const output = fs.createWriteStream(outputPath);
    const archive = new ZipArchive({
        zlib: { level: 9 },
    });
    const completed = new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);

        archive.on('warning', error => {
            if (error.code !== 'ENOENT') reject(error);
        });
        archive.on('error', reject);
    });

    archive.pipe(output);

    /*
     * Use a fixed timestamp and deterministic file ordering.
     * That makes the resulting archive reproducible when the input files
     * have not changed.
     */
    const fixedDate = new Date('1980-01-01T00:00:00.000Z');

    for (const file of files) {
        archive.append(fs.readFileSync(path.join(root, file)), {
            name: file,
            date: fixedDate,
            mode: 0o644,
        });
    }

    await archive.finalize();
    await completed;

    console.log(`Created ${path.relative(root, outputPath)} (${archive.pointer()} bytes)`);
}

createReleaseArchive().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
