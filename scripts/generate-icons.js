'use strict';

const { mkdir } = require('node:fs/promises');
const { resolve } = require('node:path');
const sharp = require('sharp');

const sizes = [16, 32, 48, 128];
const source = resolve(process.cwd(), 'assets/images/logo.png');
const outputDirectory = resolve(process.cwd(), 'assets/icons');

async function generateIcons() {
    try {
        const metadata = await sharp(source, { failOn: 'error' }).metadata();
        if (!metadata.width || !metadata.height) {
            throw new Error('Die Abmessungen des Logos konnten nicht gelesen werden.');
        }

        await mkdir(outputDirectory, { recursive: true });
        for (const size of sizes) {
            const target = resolve(outputDirectory, `icon-${size}.png`);
            await sharp(source)
                .resize(size, size, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                    withoutEnlargement: false,
                })
                .png()
                .toFile(target);
        }

        console.log(`Icons aus ${source} erzeugt: ${sizes.join(', ')} px`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Icon-Erzeugung fehlgeschlagen: ${message}`);
        process.exitCode = 1;
    }
}

generateIcons();
