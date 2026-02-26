// Generate simple PNG icons for the Electron app
const fs = require('fs');
const path = require('path');

// Simple PNG writer (no dependencies)
function createPNG(width, height, pixels) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    function crc32(buf) {
        let c = 0xffffffff;
        const table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let val = n;
            for (let k = 0; k < 8; k++) val = (val & 1) ? (0xedb88320 ^ (val >>> 1)) : (val >>> 1);
            table[n] = val;
        }
        for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    }

    function chunk(type, data) {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const typeAndData = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(typeAndData));
        return Buffer.concat([len, typeAndData, crc]);
    }

    // IHDR
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type (RGBA)
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    // IDAT
    const rawData = Buffer.alloc(height * (1 + width * 4));
    for (let y = 0; y < height; y++) {
        rawData[y * (1 + width * 4)] = 0; // filter: none
        for (let x = 0; x < width; x++) {
            const pi = (y * width + x) * 4;
            const ri = y * (1 + width * 4) + 1 + x * 4;
            rawData[ri] = pixels[pi];
            rawData[ri + 1] = pixels[pi + 1];
            rawData[ri + 2] = pixels[pi + 2];
            rawData[ri + 3] = pixels[pi + 3];
        }
    }

    const zlib = require('zlib');
    const compressed = zlib.deflateSync(rawData);

    const iend = Buffer.alloc(0);

    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', compressed),
        chunk('IEND', iend)
    ]);
}

function drawIcon(size) {
    const pixels = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            let r = 10, g = 14, b = 23, a = 255;

            const margin = size * 0.08;
            const radius = size * 0.18;
            const inRect = x >= margin && x < size - margin && y >= margin && y < size - margin;

            let inShape = inRect;
            if (inRect) {
                const corners = [
                    [margin + radius, margin + radius],
                    [size - margin - radius, margin + radius],
                    [margin + radius, size - margin - radius],
                    [size - margin - radius, size - margin - radius]
                ];
                for (const [cx, cy] of corners) {
                    const dx = Math.abs(x - cx);
                    const dy = Math.abs(y - cy);
                    if ((x < margin + radius || x > size - margin - radius) &&
                        (y < margin + radius || y > size - margin - radius)) {
                        if (dx * dx + dy * dy > radius * radius) {
                            inShape = false;
                        }
                    }
                }
            }

            if (inShape) {
                const ny = y / size;
                r = Math.floor(10 + ny * 8);
                g = Math.floor(14 + ny * 6);
                b = Math.floor(23 + ny * 12);

                const chartPoints = [
                    [0.2, 0.7], [0.35, 0.45], [0.5, 0.6], [0.7, 0.25], [0.85, 0.4]
                ];

                for (let seg = 0; seg < chartPoints.length - 1; seg++) {
                    const [x1, y1] = chartPoints[seg];
                    const [x2, y2] = chartPoints[seg + 1];
                    const px1 = x1 * size, py1 = y1 * size;
                    const px2 = x2 * size, py2 = y2 * size;
                    const dx2 = px2 - px1, dy2 = py2 - py1;
                    const len = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                    const t = Math.max(0, Math.min(1, ((x - px1) * dx2 + (y - py1) * dy2) / (len * len)));
                    const closestX = px1 + t * dx2;
                    const closestY = py1 + t * dy2;
                    const dist = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2);

                    const lineWidth = size * 0.035;
                    if (dist < lineWidth) {
                        const blend = 1 - dist / lineWidth;
                        const progress = (seg + t) / (chartPoints.length - 1);
                        const lr = Math.floor(0 * (1 - progress) + 123 * progress);
                        const lg = Math.floor(212 * (1 - progress) + 97 * progress);
                        const lb = Math.floor(170 * (1 - progress) + 255 * progress);
                        r = Math.floor(r * (1 - blend) + lr * blend);
                        g = Math.floor(g * (1 - blend) + lg * blend);
                        b = Math.floor(b * (1 - blend) + lb * blend);
                    }

                    const glowWidth = size * 0.12;
                    if (dist < glowWidth) {
                        const glow = (1 - dist / glowWidth) * 0.3;
                        const progress = (seg + t) / (chartPoints.length - 1);
                        r = Math.min(255, Math.floor(r + 0 * glow * (1 - progress) + 123 * glow * progress));
                        g = Math.min(255, Math.floor(g + 212 * glow * (1 - progress) + 97 * glow * progress));
                        b = Math.min(255, Math.floor(b + 170 * glow * (1 - progress) + 255 * glow * progress));
                    }
                }

                for (let pi = 0; pi < chartPoints.length; pi++) {
                    const [px, py] = chartPoints[pi];
                    const cx = px * size, cy = py * size;
                    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                    if (dist < size * 0.04) {
                        const progress = pi / (chartPoints.length - 1);
                        r = Math.floor(0 * (1 - progress) + 123 * progress);
                        g = Math.floor(212 * (1 - progress) + 97 * progress);
                        b = Math.floor(170 * (1 - progress) + 255 * progress);
                    }
                }
            } else {
                a = 0;
            }

            pixels[i] = r;
            pixels[i + 1] = g;
            pixels[i + 2] = b;
            pixels[i + 3] = a;
        }
    }
    return pixels;
}

function createICO(pngBuffers, sizes) {
    const numImages = pngBuffers.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    let offset = headerSize + dirEntrySize * numImages;

    const header = Buffer.alloc(headerSize);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(numImages, 4);

    const entries = [];
    for (let i = 0; i < numImages; i++) {
        const entry = Buffer.alloc(dirEntrySize);
        entry[0] = sizes[i] === 256 ? 0 : sizes[i];
        entry[1] = sizes[i] === 256 ? 0 : sizes[i];
        entry[2] = 0;
        entry[3] = 0;
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(pngBuffers[i].length, 8);
        entry.writeUInt32LE(offset, 12);
        entries.push(entry);
        offset += pngBuffers[i].length;
    }

    return Buffer.concat([header, ...entries, ...pngBuffers]);
}

const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir);

console.log('Generating 256x256 icon...');
const png256 = createPNG(256, 256, drawIcon(256));
fs.writeFileSync(path.join(assetsDir, 'icon.png'), png256);

console.log('Generating 48x48 icon...');
const png48 = createPNG(48, 48, drawIcon(48));

console.log('Generating 32x32 tray icon...');
const png32 = createPNG(32, 32, drawIcon(32));
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), png32);

console.log('Generating 16x16 icon...');
const png16 = createPNG(16, 16, drawIcon(16));

console.log('Creating ICO file...');
const ico = createICO([png256, png48, png32, png16], [256, 48, 32, 16]);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);

console.log('All icons generated successfully!');
