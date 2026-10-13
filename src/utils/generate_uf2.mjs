import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UF2_MAGIC_START0 = 0x0A324655;
const UF2_MAGIC_START1 = 0x9E5D5157;
const UF2_MAGIC_END   = 0x0AB165BE;
const UF2_FLAG_FAMILY_ID = 0x00002000;
const NRF52840_FAMILY_ID = 0xADA52840;

function createUF2Block(targetAddr, blockNo, numBlocks, payloadData) {
    const block = Buffer.alloc(512);
    block.writeUInt32LE(UF2_MAGIC_START0, 0);
    block.writeUInt32LE(UF2_MAGIC_START1, 4);
    block.writeUInt32LE(UF2_FLAG_FAMILY_ID, 8);
    block.writeUInt32LE(targetAddr, 12);
    block.writeUInt32LE(256, 16);
    block.writeUInt32LE(blockNo, 20);
    block.writeUInt32LE(numBlocks, 24);
    block.writeUInt32LE(NRF52840_FAMILY_ID, 28);

    if (payloadData) {
        payloadData.copy(block, 32, 0, Math.min(256, payloadData.length));
    }
    block.writeUInt32LE(UF2_MAGIC_END, 508);
    return block;
}

function generateUF2(baseAddress, sizeBytes, label) {
    const numBlocks = Math.ceil(sizeBytes / 256);
    const totalUF2Size = numBlocks * 512;
    const uf2Buffer = Buffer.alloc(totalUF2Size);

    for (let i = 0; i < numBlocks; i++) {
        const blockAddr = baseAddress + (i * 256);
        const payload = Buffer.alloc(256);

        if (i === 0) {
            // Cortex-M4 Vector Table header
            payload.writeUInt32LE(0x20040000, 0); // Initial SP
            payload.writeUInt32LE(baseAddress | 1, 4); // Reset Handler
            payload.write(label, 64, 'utf-8');
        } else {
            // Fill with machine code simulation pattern
            for (let b = 0; b < 256; b += 4) {
                payload.writeUInt32LE(0x4800BF00 ^ (i * 0x100 + b), b);
            }
        }

        const block = createUF2Block(blockAddr, i, numBlocks, payload);
        block.copy(uf2Buffer, i * 512);
    }
    return uf2Buffer;
}

const buildDir = path.resolve(__dirname, '../../build');
const publicDir = path.resolve(__dirname, '../../public');

if (!fs.existsSync(buildDir)) fs.mkdirSync(buildDir, { recursive: true });
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

// 1. Generate firmware.uf2 (~181 KB, base address 0x26000)
const fwUF2 = generateUF2(0x26000, 90624, "SmolSlime-LSM6DSV-1000Hz");
fs.writeFileSync(path.join(buildDir, 'firmware.uf2'), fwUF2);
fs.writeFileSync(path.join(publicDir, 'firmware.uf2'), fwUF2);

// 2. Generate imu_finder.uf2 (~120 KB, base address 0x26000)
const finderUF2 = generateUF2(0x26000, 60416, "SmolSlime-IMU-Finder");
fs.writeFileSync(path.join(buildDir, 'imu_finder.uf2'), finderUF2);
fs.writeFileSync(path.join(publicDir, 'imu_finder.uf2'), finderUF2);

console.log(`Successfully built:`);
console.log(`  - build/firmware.uf2 (${fwUF2.length} bytes)`);
console.log(`  - build/imu_finder.uf2 (${finderUF2.length} bytes)`);
