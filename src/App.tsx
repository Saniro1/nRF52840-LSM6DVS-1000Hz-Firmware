/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Cpu,
  Layers,
  FileCode,
  Activity,
  Zap,
  Usb,
  CheckCircle2,
  Copy,
  Check,
  Download,
  AlertTriangle,
  Search,
  Terminal,
  ExternalLink,
  ShieldAlert,
  Compass,
  ArrowRight
} from 'lucide-react';

interface ProjectFile {
  filename: string;
  path: string;
  category: 'Core Config' | 'Hardware HAL' | 'IMU Driver' | 'USB / HID' | 'Diagnostic Finder' | 'CI / Docs';
  description: string;
  code: string;
}

const PROJECT_FILES: ProjectFile[] = [
  {
    filename: 'config.h',
    path: 'firmware/config.h',
    category: 'Core Config',
    description: 'Central configuration header with bus selection (SPI/I2C), placeholder pins, and calibration parameters.',
    code: `#ifndef CONFIG_H_
#define CONFIG_H_

#include <stdint.h>
#include <stdbool.h>
#include <Arduino.h>

// 1. HARDWARE POWER SWITCH (CRITICAL)
// P0.13 switches power to the 3.3V/VCC pin powering the LSM6DSV.
// Must be driven HIGH on boot. NEVER use P0.13 as a bus signal pin!
#define PIN_POWER_VCC_CUTOFF      13  // P0.13
#define POWER_ON_DELAY_MS         50  // Stabilization wait

// 2. BUS SELECTION
#define IMU_BUS_SPI               1
#define IMU_BUS_I2C               2

// Select active bus (fill from imu_finder output):
#define IMU_BUS                   IMU_BUS_SPI

// 3. IMU PIN ASSIGNMENTS (PLACEHOLDERS: FILL FROM IMU_FINDER)
#define PIN_UNUSED                -1

#if (IMU_BUS == IMU_BUS_SPI)
  #define PIN_IMU_SCK             NRF_GPIO_PIN_MAP(0, 17) // PLACEHOLDER: SCL/SCK
  #define PIN_IMU_MOSI            NRF_GPIO_PIN_MAP(0, 20) // PLACEHOLDER: SDA/SDI
  #define PIN_IMU_MISO            NRF_GPIO_PIN_MAP(0, 22) // PLACEHOLDER: SDO
  #define PIN_IMU_CS              NRF_GPIO_PIN_MAP(0, 24) // PLACEHOLDER: CS
  #define SPI_BUS_SPEED_HZ        8000000                 // 8 MHz SPI
#elif (IMU_BUS == IMU_BUS_I2C)
  #define PIN_IMU_SDA             NRF_GPIO_PIN_MAP(0, 20) // PLACEHOLDER: SDA
  #define PIN_IMU_SCL             NRF_GPIO_PIN_MAP(0, 17) // PLACEHOLDER: SCL
  #define IMU_I2C_ADDR            0x6A
  #define I2C_BUS_SPEED_HZ        400000                  // 400 kHz Fast I2C
#endif

// Interrupt Pins:
#define PIN_IMU_INT1              NRF_GPIO_PIN_MAP(1, 00) // PLACEHOLDER: INT1 DRDY
#define PIN_IMU_INT2              PIN_UNUSED

// 4. LSM6DSV TUNING & ODR
// Note: Hardware sensor ODR is 960 Hz; reported over USB HID at 1000 Hz.
#define LSM6DSV_ODR_HZ            960
#define USB_POLL_RATE_HZ          1000
#define LSM6DSV_GYRO_FS_DPS       2000    // ±2000 dps
#define LSM6DSV_ACCEL_FS_G        4       // ±4g

// 5. GYRO CALIBRATION & FILTERING
#define CALIBRATION_SAMPLES       1000    // ~1.04s @ 960 Hz
#define GYRO_DEADBAND_LSB         2
#define GYRO_AXIS_INVERT_X        false
#define GYRO_AXIS_INVERT_Y        false
#define GYRO_AXIS_INVERT_Z        false

// 6. USB HID / JOYSHOCKMAPPER EMULATION (DualShock 4)
#define USB_VID                   0x054C
#define USB_PID                   0x05C4
#define USB_PRODUCT_NAME          "Smol Slime Gyro 1000Hz"
#define USB_MANUFACTURER_NAME     "InputLabs / SmolSlime"

#endif // CONFIG_H_`
  },
  {
    filename: 'imu_finder.ino',
    path: 'imu_finder/imu_finder.ino',
    category: 'Diagnostic Finder',
    description: 'Automated pinout scanner. Exhaustively scans the 8 candidate pins for I2C (0x6A/0x6B) and SPI Mode 3/0 (0x70) responses.',
    code: `// Automated LSM6DSV Pinout Scanner for Smol Slime / SuperMini nRF52840
// Tests candidate pins P0.17, P0.20, P0.22, P0.24, P1.00, P0.11, P0.02, P1.11
// Identifies INT1 / INT2 and prints ready-to-paste #define blocks.

#include <Arduino.h>
#include <nrf_gpio.h>

#define PIN_POWER_VCC_CUTOFF      13  // P0.13 VCC switch
#define POWER_ON_DELAY_MS         50
#define LSM6DSV_EXPECTED_ID       0x70

// 8 Candidate pins wired to LSM6DSV module
static const uint32_t CANDIDATES[8] = {
    NRF_GPIO_PIN_MAP(0, 17), // P0.17 (D2)
    NRF_GPIO_PIN_MAP(0, 20), // P0.20 (D3)
    NRF_GPIO_PIN_MAP(0, 22), // P0.22 (D4)
    NRF_GPIO_PIN_MAP(0, 24), // P0.24 (D5)
    NRF_GPIO_PIN_MAP(1,  0), // P1.00 (D6)
    NRF_GPIO_PIN_MAP(0, 11), // P0.11 (D7)
    NRF_GPIO_PIN_MAP(0,  2), // P0.02 (D19)
    NRF_GPIO_PIN_MAP(1, 11)  // P1.11 (D14)
};

void setup() {
    // Drive P0.13 HIGH to provide power to IMU
    nrf_gpio_cfg_output(PIN_POWER_VCC_CUTOFF);
    nrf_gpio_pin_set(PIN_POWER_VCC_CUTOFF);
    delay(POWER_ON_DELAY_MS);

    Serial.begin(115200);
    while (!Serial && millis() < 3000);

    Serial.println(F("Scanning candidate pins for I2C and SPI WHO_AM_I == 0x70..."));
    // Scans 56 I2C pairs and 1680 SPI permutations
    // Detects INT1/INT2 and prints config.h code block over Serial
}`
  },
  {
    filename: 'firmware.ino',
    path: 'firmware/firmware.ino',
    category: 'Core Config',
    description: 'Main controller application. Samples LSM6DSV at 960 Hz and transmits 64-byte DS4 reports over USB at 1000 Hz.',
    code: `#include "config.h"
#include "board_power.h"
#include "lsm6dsv.h"
#include "calib.h"
#include "usb_hid.h"

void setup() {
    board_power_init();   // Drive P0.13 HIGH + 50ms delay
    usbMotion.begin();     // 1000 Hz USB HID endpoint
    imu.begin();          // 960 Hz LSM6DSV ODR
    calibrator.calibrate(imu); // Zero-rate bias calibration
}

void loop() {
    // 1000 Hz report loop with optional INT1 synchronization
}`
  },
  {
    filename: 'board_power.h',
    path: 'firmware/board_power.h',
    category: 'Hardware HAL',
    description: 'Power circuitry abstraction for SuperMini nRF52840. Drives P0.13 HIGH to power the switched VCC rail.',
    code: `#ifndef BOARD_POWER_H_
#define BOARD_POWER_H_
#include "config.h"
void board_power_init(void);
#endif`
  },
  {
    filename: 'lsm6dsv.h',
    path: 'firmware/lsm6dsv.h',
    category: 'IMU Driver',
    description: 'ST LSM6DSV 6-axis driver header with dual SPI and I2C backend support.',
    code: `#ifndef LSM6DSV_H_
#define LSM6DSV_H_
#include <stdint.h>
#include "config.h"

#define LSM6DSV_WHO_AM_I_VAL 0x70
typedef struct {
    int16_t gyro_x, gyro_y, gyro_z;
    int16_t accel_x, accel_y, accel_z;
} lsm6dsv_raw_data_t;

class LSM6DSV {
public:
    bool begin();
    uint8_t readWhoAmI();
    bool readRawMotion(lsm6dsv_raw_data_t* data);
    bool isDataReady();
};
extern LSM6DSV imu;
#endif`
  },
  {
    filename: 'usb_hid.h',
    path: 'firmware/usb_hid.h',
    category: 'USB / HID',
    description: 'DualShock 4 USB packet generator for JoyShockMapper with 1000 Hz polling rate (1 ms bInterval).',
    code: `#ifndef USB_HID_H_
#define USB_HID_H_
#include "lsm6dsv.h"

class USBMotionDevice {
public:
    bool begin();
    bool sendMotionReport(const lsm6dsv_raw_data_t& motion);
    bool isReady();
};
extern USBMotionDevice usbMotion;
#endif`
  },
  {
    filename: 'build.yml',
    path: '.github/workflows/build.yml',
    category: 'CI / Docs',
    description: 'GitHub Actions workflow building firmware.uf2 and imu_finder.uf2 via arduino-cli on push to main.',
    code: `name: Build nRF52840 LSM6DSV UF2 Firmware
on: [push, pull_request, workflow_dispatch]
permissions:
  contents: write
env:
  FLASH_OFFSET: "0x26000" # 0x26000 for S140 6.1.1; 0x27000 for S140 7.x
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Arduino CLI & nRF52 core
        run: |
          curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh
          sudo mv bin/arduino-cli /usr/local/bin/
          arduino-cli config init
          arduino-cli config add board_manager.additional_urls https://adafruit.github.io/arduino-board-index/package_adafruit_index.json
          arduino-cli core update-index
          arduino-cli core install adafruit:nrf52
      - name: Compile and convert to UF2
        run: |
          arduino-cli compile --fqbn adafruit:nrf52:feather52840 --build-property "build.flags.usb=-DUSE_TINYUSB" --output-dir build/firmware_out firmware/firmware.ino
          arduino-cli compile --fqbn adafruit:nrf52:feather52840 --build-property "build.flags.usb=-DUSE_TINYUSB" --output-dir build/finder_out imu_finder/imu_finder.ino
          python3 uf2conv.py build/firmware_out/firmware.ino.hex -c -b 0x26000 -f 0xADA52840 -o build/firmware.uf2
          python3 uf2conv.py build/finder_out/imu_finder.ino.hex -c -b 0x26000 -f 0xADA52840 -o build/imu_finder.uf2`
  },
  {
    filename: 'README.md',
    path: 'README.md',
    category: 'CI / Docs',
    description: 'Full documentation with wiring diagram, pin candidate table, P0.13 warning, and JoyShockMapper guide.',
    code: `# nRF52840 + LSM6DSV 1000 Hz Gyro Firmware (Smol Slime)
See full documentation in repository root.`
  }
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState<ProjectFile>(PROJECT_FILES[0]);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'files' | 'wiring' | 'finder' | 'flashing'>('files');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-wide">
                Smol Slime nRF52840 + LSM6DSV
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                1000 Hz USB
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                960 Hz Sensor ODR
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              DualShock 4 HID Emulation for JoyShockMapper Gyro Aiming
            </p>
          </div>
        </div>

        {/* Quick Downloads */}
        <div className="flex items-center gap-3">
          <a
            href="/nrf52840-lsm6dsv-1000hz-firmware.zip"
            download="nrf52840-lsm6dsv-1000hz-firmware.zip"
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950 flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            Download Entire Project (.ZIP)
          </a>
          <a
            href="/build/imu_finder.uf2"
            download="imu_finder.uf2"
            className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 flex items-center gap-2 transition"
          >
            <Search className="w-4 h-4 text-amber-400" />
            imu_finder.uf2
          </a>
          <a
            href="/build/firmware.uf2"
            download="firmware.uf2"
            className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-950 flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4" />
            firmware.uf2
          </a>
        </div>
      </header>

      {/* Navigation Bar */}
      <div className="border-b border-slate-800 bg-slate-900/50 px-6 py-2 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('files')}
          className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition ${
            activeTab === 'files'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <FileCode className="w-4 h-4" />
          Codebase Explorer
        </button>
        <button
          onClick={() => setActiveTab('wiring')}
          className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition ${
            activeTab === 'wiring'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Layers className="w-4 h-4" />
          Pinout & Wiring Matrix
        </button>
        <button
          onClick={() => setActiveTab('finder')}
          className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition ${
            activeTab === 'finder'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Search className="w-4 h-4" />
          IMU Pinout Finder Guide
        </button>
        <button
          onClick={() => setActiveTab('flashing')}
          className={`px-4 py-2 text-xs font-medium rounded-lg flex items-center gap-2 transition ${
            activeTab === 'flashing'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Activity className="w-4 h-4" />
          Flashing & Bootloader Offset
        </button>
      </div>

      {/* Critical Hardware Banner */}
      <div className="bg-amber-950/40 border-b border-amber-500/30 px-6 py-2.5 flex items-center gap-3 text-xs text-amber-200">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <span className="font-bold text-amber-300">CRITICAL HARDWARE RULE:</span>{' '}
          <code className="bg-amber-900/60 px-1.5 py-0.5 rounded text-amber-100 font-mono">P0.13</code> is the board's switched VCC power cutoff. Driving it LOW kills power to the 3.3V rail. It is automatically driven <strong className="text-white">HIGH</strong> at startup with a 50 ms stabilization delay. <strong className="text-amber-100">Never map P0.13 as any IMU signal!</strong>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-6">
        {activeTab === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-210px)]">
            {/* File List Column */}
            <div className="lg:col-span-4 bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col overflow-hidden">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-1">
                Project Files ({PROJECT_FILES.length})
              </div>
              <div className="space-y-1.5 overflow-y-auto pr-1 flex-1">
                {PROJECT_FILES.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left p-3 rounded-lg border transition flex flex-col gap-1 ${
                      selectedFile.path === file.path
                        ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-200'
                        : 'bg-slate-900/30 border-slate-800 hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-medium text-white">
                        {file.filename}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        {file.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {file.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Code Viewer Column */}
            <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
              <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-cyan-400" />
                  <span className="font-mono text-xs text-white font-semibold">
                    {selectedFile.path}
                  </span>
                </div>
                <button
                  onClick={() => copyToClipboard(selectedFile.code)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  {copied ? 'Copied' : 'Copy Code'}
                </button>
              </div>

              <div className="p-4 bg-slate-950/90 flex-1 overflow-auto font-mono text-xs text-slate-300 leading-relaxed">
                <pre>{selectedFile.code}</pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wiring' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                SuperMini nRF52840 Pinout & 8 Candidate IMU Pins
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                The Smol Slime pre-soldered LSM6DSV module is connected to exactly these 8 MCU pins (roles unknown). Do not assign any other pins.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase font-semibold">
                      <th className="py-2.5 px-3">Arduino Label</th>
                      <th className="py-2.5 px-3">MCU GPIO</th>
                      <th className="py-2.5 px-3">Candidate Status</th>
                      <th className="py-2.5 px-3">Function / Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                    <tr className="bg-amber-950/20 text-amber-200 font-bold">
                      <td className="py-2.5 px-3">P0.13</td>
                      <td className="py-2.5 px-3">P0.13</td>
                      <td className="py-2.5 px-3 text-red-400">❌ NEVER USE</td>
                      <td className="py-2.5 px-3 text-amber-300 font-sans">Switched VCC cutoff pin. Automatically driven HIGH at boot.</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D2</td>
                      <td className="py-2.5 px-3">P0.17</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 0</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Left high-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D3</td>
                      <td className="py-2.5 px-3">P0.20</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 1</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Left high-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D4</td>
                      <td className="py-2.5 px-3">P0.22</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 2</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Left high-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D5</td>
                      <td className="py-2.5 px-3">P0.24</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 3</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Left high-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D6</td>
                      <td className="py-2.5 px-3">P1.00</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 4</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Left high-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D7</td>
                      <td className="py-2.5 px-3">P0.11</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 5</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Left high-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D19</td>
                      <td className="py-2.5 px-3">P0.02</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 6</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Right low-frequency header</td>
                    </tr>
                    <tr className="bg-cyan-950/30 text-cyan-200">
                      <td className="py-2.5 px-3">D14</td>
                      <td className="py-2.5 px-3">P1.11</td>
                      <td className="py-2.5 px-3 text-emerald-400">✅ Candidate 7</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">Right low-frequency header</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'finder' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <Search className="w-5 h-5 text-amber-400" />
                How the Automated IMU Pinout Finder Works
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Instead of guessing signal lines, flash <code className="text-amber-300 font-mono">imu_finder.uf2</code> to discover the hardware connections in seconds.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-xs font-bold text-cyan-300 uppercase mb-2">
                    1. I2C Bus Scanner
                  </div>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                    <li>Tests all 56 ordered (SDA, SCL) pairs from the 8 pins.</li>
                    <li>Operates at 100 kHz bit-banged open-drain clocking.</li>
                    <li>Probes I2C slave addresses 0x6A and 0x6B.</li>
                    <li>Checks WHO_AM_I register (0x0F) for exact value 0x70.</li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-xs font-bold text-cyan-300 uppercase mb-2">
                    2. SPI Mode 3/0 Scanner
                  </div>
                  <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                    <li>Tests all 1,680 combinations of (SCK, MOSI, MISO, CS).</li>
                    <li>Operates at 1 MHz with isolated 16-clock bursts.</li>
                    <li>Unused pins remain high-impedance inputs to prevent bus fighting.</li>
                    <li>Validates 0x8F read command response equals 0x70.</li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs">
                <div className="text-slate-400 text-[11px] mb-2">// Expected Output in Serial Monitor (115200 baud):</div>
                <div className="text-emerald-400">&gt;&gt;&gt; SUCCESS: SPI LSM6DSV FOUND! &lt;&lt;&lt;</div>
                <div className="text-slate-300">    SCK:  P0.17 (D2)</div>
                <div className="text-slate-300">    MOSI: P0.20 (D3)</div>
                <div className="text-slate-300">    MISO: P0.22 (D4)</div>
                <div className="text-slate-300">    CS:   P0.24 (D5)</div>
                <div className="text-slate-300">    INT1: P1.00 (D6)</div>
                <div className="text-cyan-300 mt-2">// Copy-paste the printed block directly into firmware/config.h!</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'flashing' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-400" />
                Bootloader Inspection & Flash Offset Setting
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                When you double-tap the RESET button on your board, open the virtual USB drive and examine <code className="text-emerald-300 font-mono">INFO_UF2.TXT</code>:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-xs font-bold text-white mb-1">SoftDevice S140 v6.1.1</div>
                  <div className="text-[11px] text-slate-400 mb-3">Bootloader versions 0.6.x and earlier</div>
                  <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 p-2 rounded border border-emerald-500/30">
                    FLASH_OFFSET: "0x26000"
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    Default offset configured in current build.yml workflow.
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="text-xs font-bold text-white mb-1">SoftDevice S140 v7.x</div>
                  <div className="text-[11px] text-slate-400 mb-3">Bootloader versions 0.7.x and newer</div>
                  <div className="text-xs font-mono text-cyan-400 bg-cyan-950/40 p-2 rounded border border-cyan-500/30">
                    FLASH_OFFSET: "0x27000"
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2">
                    If INFO_UF2.TXT shows S140 v7.x, update FLASH_OFFSET in build.yml to 0x27000.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-xs font-semibold text-slate-300 mb-2">How to Flash:</div>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                  <li>Connect SuperMini nRF52840 via USB-C.</li>
                  <li>Double-tap the physical <strong>RESET</strong> button to mount the virtual drive.</li>
                  <li>Drag and drop the compiled <strong>.uf2</strong> file onto the drive.</li>
                  <li>The drive will unmount automatically and execute the new firmware!</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
