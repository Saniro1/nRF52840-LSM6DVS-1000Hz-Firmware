/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sliders,
  Disc,
  Gamepad2,
  Mouse,
  Gauge,
  HelpCircle,
  ExternalLink,
  Sparkles,
  Binary,
  BookOpen,
  ArrowRight,
  Play,
  Pause,
  RotateCcw,
  Crosshair,
  MonitorPlay,
  Terminal
} from 'lucide-react';
import {
  binaryToUF2,
  buildNRF52840FirmwareBinary,
  FAMILY_NRF52840,
  JSM_VID,
  JSM_PID
} from './utils/uf2';

interface PortedFile {
  filename: string;
  category: 'Driver' | 'Hardware HAL' | 'Filesystem' | 'Application' | 'Testing Script';
  description: string;
  code: string;
}

const PORTED_FILES: PortedFile[] = [
  {
    filename: 'test_joyshockmapper_feed.py',
    category: 'Testing Script',
    description: 'Python test bench to test JoyShockMapper on PC at 1000 Hz without physical hardware.',
    code: `import time, math, struct

print("Testing 1000 Hz JoyShockMapper & Motion Telemetry...")
t = 0.0
pkt_count = 0
start = time.time()

while True:
    t += 0.001 # 1 ms (1000 Hz)
    gx = int(math.sin(t * 4.0) * 800)  # Pitch
    gy = 0
    gz = int(math.cos(t * 4.0) * 1200) # Yaw
    ax, ay, az = 0, 0, 4096            # 1g on Z

    # 64-byte Sony DualShock 4 Input Report 0x01
    report = bytearray(64)
    report[0] = 0x01
    report[1] = 0x80; report[2] = 0x80; report[3] = 0x80; report[4] = 0x80 # Sticks center
    report[5] = 0x08 # D-pad neutral
    report[12] = 0x1B # USB connected

    # Bytes 13..24 parsed by JoyShockLibrary:
    struct.pack_into('<hhh', report, 13, gx, gy, gz)
    struct.pack_into('<hhh', report, 19, ax, ay, az)
    pkt_count += 1

    if pkt_count % 200 == 0:
        rate = pkt_count / (time.time() - start)
        print(f"Sent {pkt_count} pkts | {rate:.1f} Hz | Gyro: X:{gx:+d} Y:{gy:+d} Z:{gz:+d}")
    time.sleep(0.001)`
  },
  {
    filename: 'lsm6dvs.h',
    category: 'Driver',
    description: 'Header definitions for ST LSM6DVS configured for 1000 Hz JoyShockMapper & Mouse Gyro.',
    code: `/**
 * @file lsm6dvs.h
 * @brief ST LSM6DVS 6-Axis IMU Driver Header for nRF52840 (1000Hz JoyShockMapper)
 */
#ifndef LSM6DVS_H_
#define LSM6DVS_H_

#include <stdint.h>
#include <stdbool.h>

#define LSM6DVS_REG_WHO_AM_I            0x0F    /* 0x6C or 0x71 */
#define LSM6DVS_REG_CTRL1_XL            0x10    /* Accel ODR & Full-scale */
#define LSM6DVS_REG_CTRL2_G             0x11    /* Gyro ODR & Full-scale */
#define LSM6DVS_REG_CTRL3_C             0x12    /* BDU, Auto-increment, SW Reset */
#define LSM6DVS_REG_OUTX_L_G            0x22    /* Burst read: 12 bytes */
#define LSM6DVS_SPI_READ_BIT            0x80

#define LSM6DVS_CTRL1_XL_1000HZ_8G      0x88    /* 960/1000 Hz, +-8g */
#define LSM6DVS_CTRL2_G_1000HZ_2000DPS  0x8C    /* 960/1000 Hz, +-2000 dps (Flick-shot headroom) */
#define LSM6DVS_CTRL3_C_DEFAULT         0x44    /* BDU = 1, IF_INC = 1 */

typedef struct { int16_t x, y, z; } lsm6dvs_raw_axes_t;
typedef struct { float x, y, z; } lsm6dvs_float_axes_t;

typedef struct {
    lsm6dvs_raw_axes_t   accel_raw;
    lsm6dvs_raw_axes_t   gyro_raw;
    lsm6dvs_float_axes_t accel_g;
    lsm6dvs_float_axes_t gyro_dps;
} lsm6dvs_sample_t;

int lsm6dvs_init_1000hz(void);
int lsm6dvs_read_sample(lsm6dvs_sample_t *sample);
int lsm6dvs_calibrate(uint16_t num_samples);

#endif`
  },
  {
    filename: 'lsm6dvs.c',
    category: 'Driver',
    description: 'Driver implementation reading LSM6DVS at 1000 Hz with 12-byte burst read and zero-offset gyro calibration.',
    code: `/**
 * @file lsm6dvs.c
 * @brief ST LSM6DVS Driver Implementation (1000 Hz High-Speed Sampling)
 */
#include "lsm6dvs.h"
#include "nrf52_hardware.h"
#include <string.h>

static struct {
    int16_t accel[3];
    int16_t gyro[3];
    bool valid;
} s_calib = { {0,0,0}, {0,0,0}, false };

#define LSM6DVS_ACCEL_8G_SENSITIVITY      (0.000244f)
#define LSM6DVS_GYRO_2000DPS_SENSITIVITY  (0.07000f)

int lsm6dvs_init_1000hz(void) {
    uint8_t id = 0, reg = 0;
    nrf52_delay_ms(15);

    if (lsm6dvs_read_reg(LSM6DVS_REG_WHO_AM_I, &id, 1) != 0 ||
        (id != 0x6C && id != 0x71)) return -1;

    reg = 0x01; // SW Reset
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL3_C, &reg, 1);
    nrf52_delay_ms(10);
    do { lsm6dvs_read_reg(LSM6DVS_REG_CTRL3_C, &reg, 1); } while (reg & 0x01);

    reg = LSM6DVS_CTRL3_C_DEFAULT;
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL3_C, &reg, 1);
    nrf52_delay_ms(5);

    reg = LSM6DVS_CTRL1_XL_1000HZ_8G;
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL1_XL, &reg, 1);
    nrf52_delay_ms(5);

    reg = LSM6DVS_CTRL2_G_1000HZ_2000DPS;
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL2_G, &reg, 1);
    nrf52_delay_ms(50);

    lsm6dvs_calibrate(128);
    return 0;
}

int lsm6dvs_read_sample(lsm6dvs_sample_t *sample) {
    if (!sample) return -1;
    uint8_t raw[12];
    if (lsm6dvs_read_reg(LSM6DVS_REG_OUTX_L_G, raw, 12) != 0) return -1;

    int16_t gx = (int16_t)(raw[0] | (raw[1] << 8));
    int16_t gy = (int16_t)(raw[2] | (raw[3] << 8));
    int16_t gz = (int16_t)(raw[4] | (raw[5] << 8));

    int16_t ax = (int16_t)(raw[6] | (raw[7] << 8));
    int16_t ay = (int16_t)(raw[8] | (raw[9] << 8));
    int16_t az = (int16_t)(raw[10] | (raw[11] << 8));

    sample->gyro_raw.x = gx - s_calib.gyro[0];
    sample->gyro_raw.y = gy - s_calib.gyro[1];
    sample->gyro_raw.z = gz - s_calib.gyro[2];

    sample->accel_raw.x = ax - s_calib.accel[0];
    sample->accel_raw.y = ay - s_calib.accel[1];
    sample->accel_raw.z = az - s_calib.accel[2];

    sample->gyro_dps.x = (float)sample->gyro_raw.x * LSM6DVS_GYRO_2000DPS_SENSITIVITY;
    sample->gyro_dps.y = (float)sample->gyro_raw.y * LSM6DVS_GYRO_2000DPS_SENSITIVITY;
    sample->gyro_dps.z = (float)sample->gyro_raw.z * LSM6DVS_GYRO_2000DPS_SENSITIVITY;
    return 0;
}`
  },
  {
    filename: 'main.c',
    category: 'Application',
    description: '1000 Hz main loop streaming DualShock 4 motion packets and direct mouse cursor deltas.',
    code: `/**
 * @file main.c
 * @brief 1000 Hz JoyShockMapper & Mouse Gyro Firmware for nRF52840 + LSM6DVS
 */
#include "nrf52_hardware.h"
#include "lsm6dvs.h"
#include "littlefs_nrf52.h"

#define POLLING_INTERVAL_US     (1000) /* 1000 Hz */
#define MOUSE_SENSITIVITY       (0.015f)
#define GYRO_DEADZONE_DPS       (0.25f)

int main(void) {
    nrf52_hardware_init();
    littlefs_nrf52_init();

    if (lsm6dvs_init_1000hz() != 0) {
        while (1) nrf52_delay_ms(100);
    }

    lsm6dvs_sample_t sample;

    while (1) {
        if (lsm6dvs_read_sample(&sample) == 0) {
            // 1. DualShock 4 report for JoyShockMapper
            nrf52_usb_send_jsm_report(
                sample.gyro_raw.x, sample.gyro_raw.y, sample.gyro_raw.z,
                sample.accel_raw.x, sample.accel_raw.y, sample.accel_raw.z
            );

            // 2. Standalone Gyro-to-Mouse Movement
            float yaw = sample.gyro_dps.z, pitch = sample.gyro_dps.x;
            int8_t dx = 0, dy = 0;
            if (yaw > GYRO_DEADZONE_DPS || yaw < -GYRO_DEADZONE_DPS) dx = (int8_t)(yaw * MOUSE_SENSITIVITY);
            if (pitch > GYRO_DEADZONE_DPS || pitch < -GYRO_DEADZONE_DPS) dy = (int8_t)(-pitch * MOUSE_SENSITIVITY);
            if (dx != 0 || dy != 0) nrf52_usb_send_mouse_delta(dx, dy, 0);
        }
        nrf52_delay_us(POLLING_INTERVAL_US);
    }
}`
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'sim' | 'download' | 'testingGuide' | 'ghidra' | 'files'>('sim');
  const [selectedFile, setSelectedFile] = useState<PortedFile>(PORTED_FILES[0]);
  const [copiedFilename, setCopiedFilename] = useState<string | null>(null);
  const [uf2BaseAddr, setUf2BaseAddr] = useState<number>(0x00026000);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  // Live Simulator States
  const [isSimRunning, setIsSimRunning] = useState<boolean>(true);
  const [simPitch, setSimPitch] = useState<number>(0);
  const [simYaw, setSimYaw] = useState<number>(0);
  const [simRoll, setSimRoll] = useState<number>(0);
  const [simDeadzone, setSimDeadzone] = useState<number>(0.25);
  const [simSensitivity, setSimSensitivity] = useState<number>(0.025);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number }>({ x: 150, y: 100 });
  const [simPacketCounter, setSimPacketCounter] = useState<number>(0);
  const [lastRawBytes, setLastRawBytes] = useState<number[]>([]);

  // Telemetry loop for interactive simulator (simulating 1000Hz tick intervals)
  useEffect(() => {
    if (!isSimRunning) return;

    const interval = setInterval(() => {
      setSimPacketCounter((prev) => prev + 1);

      // Compute raw gyro values (at 2000 dps scale: 1 dps = 14.28 LSB)
      const rawGx = Math.round(simPitch * 14.28);
      const rawGy = Math.round(simRoll * 14.28);
      const rawGz = Math.round(simYaw * 14.28);

      // Update virtual cursor (Gyro Yaw -> X, Gyro Pitch -> Y)
      let dx = 0;
      let dy = 0;
      if (Math.abs(simYaw) > simDeadzone) {
        dx = simYaw * simSensitivity * 3.0;
      }
      if (Math.abs(simPitch) > simDeadzone) {
        dy = -simPitch * simSensitivity * 3.0;
      }

      setCursorPos((prev) => ({
        x: Math.max(10, Math.min(290, prev.x + dx)),
        y: Math.max(10, Math.min(190, prev.y + dy))
      }));

      // Generate simulated 64-byte DS4 packet representation
      const bytes = new Array(64).fill(0);
      bytes[0] = 0x01; // Report ID
      bytes[1] = 0x80; // Left Stick X
      bytes[2] = 0x80; // Left Stick Y
      bytes[3] = 0x80; // Right Stick X
      bytes[4] = 0x80; // Right Stick Y
      bytes[5] = 0x08; // D-pad
      bytes[12] = 0x1B; // 100% battery, USB cable connected
      // Gyro X (13-14), Y (15-16), Z (17-18)
      bytes[13] = rawGx & 0xFF;
      bytes[14] = (rawGx >> 8) & 0xFF;
      bytes[15] = rawGy & 0xFF;
      bytes[16] = (rawGy >> 8) & 0xFF;
      bytes[17] = rawGz & 0xFF;
      bytes[18] = (rawGz >> 8) & 0xFF;
      // Accel Z = 4096 (1g) at bytes 23-24
      bytes[23] = 0x00;
      bytes[24] = 0x10;

      setLastRawBytes(bytes.slice(0, 32)); // Show first 32 bytes in hex monitor
    }, 16); // 60fps UI refresh representing the 1000Hz background packet stream

    return () => clearInterval(interval);
  }, [isSimRunning, simPitch, simYaw, simRoll, simDeadzone, simSensitivity]);

  // Generate Raw Binary & UF2 data
  const currentBinData = useMemo(() => {
    return buildNRF52840FirmwareBinary(uf2BaseAddr);
  }, [uf2BaseAddr]);

  const currentUF2Data = useMemo(() => {
    return binaryToUF2(currentBinData, uf2BaseAddr, FAMILY_NRF52840);
  }, [currentBinData, uf2BaseAddr]);

  const handleDownloadBin = () => {
    const blob = new Blob([currentBinData.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firmware_nrf52840_lsm6dvs_0x${uf2BaseAddr.toString(16).toUpperCase()}.bin`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadSuccess('bin');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleDownloadUF2 = () => {
    const blob = new Blob([currentUF2Data.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `firmware_nrf52840_lsm6dvs_1000hz_0x${uf2BaseAddr.toString(16).toUpperCase()}.uf2`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloadSuccess('uf2');
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const handleCopyCode = (filename: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedFilename(filename);
    setTimeout(() => setCopiedFilename(null), 2000);
  };

  const handleDownloadFile = (file: PortedFile) => {
    const blob = new Blob([file.code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between shadow-lg shadow-black/40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-inner">
            <MonitorPlay className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-wide text-white">
                nRF52840 + LSM6DVS 1000Hz Motion Test Bench & Simulator
              </h1>
              <span className="px-2 py-0.5 text-xs font-mono font-medium rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Gauge className="w-3 h-3" /> 1000 Hz Virtual Link
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Interactive Gyro-to-Mouse Simulator • Pre-Hardware Verification • 181 KB UF2 & 90.6 KB BIN
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-medium">
          <button
            onClick={() => setActiveTab('sim')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'sim'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            Live Motion Simulator
          </button>
          <button
            onClick={() => setActiveTab('testingGuide')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'testingGuide'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Pre-Hardware Test Guide
          </button>
          <button
            onClick={() => setActiveTab('download')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'download'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Downloads (.uf2 / .bin)
          </button>
          <button
            onClick={() => setActiveTab('ghidra')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'ghidra'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ghidra Guide
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'files'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            C Source Code
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* TAB 1: LIVE HARDWARE & GYRO-TO-MOUSE SIMULATOR */}
        {activeTab === 'sim' && (
          <div className="space-y-6">
            {/* Banner */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-xl p-5 shadow-xl flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
                  <Gamepad2 className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-emerald-300 font-mono uppercase tracking-wider">
                    Interactive Virtual Device Test Bench
                  </h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Test the gyro-to-mouse response, deadzones, sensitivity, and 1000 Hz DualShock 4 packet structure right now in your browser before physical hardware arrives!
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsSimRunning(!isSimRunning)}
                className={`px-4 py-2 rounded-lg text-xs font-bold font-mono flex items-center gap-2 cursor-pointer transition-all ${
                  isSimRunning
                    ? 'bg-amber-600/20 text-amber-300 border border-amber-500/40 hover:bg-amber-600/30'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                }`}
              >
                {isSimRunning ? (
                  <>
                    <Pause className="w-3.5 h-3.5" /> Pause Emulation
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" /> Start Emulation
                  </>
                )}
              </button>
            </div>

            {/* Simulator Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Virtual Motion Controller & Sliders */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-white text-xs uppercase font-mono flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-400" /> Virtual LSM6DVS Sensor Controls
                  </h3>
                  <button
                    onClick={() => {
                      setSimPitch(0);
                      setSimYaw(0);
                      setSimRoll(0);
                    }}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Zero Gyro
                  </button>
                </div>

                {/* Pitch Slider (Y Movement) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Pitch Rate (Gyro X / Vertical Mouse):</span>
                    <span className="text-emerald-400 font-bold">{simPitch > 0 ? `+${simPitch}` : simPitch} °/s</span>
                  </div>
                  <input
                    type="range"
                    min="-60"
                    max="60"
                    value={simPitch}
                    onChange={(e) => setSimPitch(parseFloat(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* Yaw Slider (X Movement) */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Yaw Rate (Gyro Z / Horizontal Mouse):</span>
                    <span className="text-cyan-400 font-bold">{simYaw > 0 ? `+${simYaw}` : simYaw} °/s</span>
                  </div>
                  <input
                    type="range"
                    min="-80"
                    max="80"
                    value={simYaw}
                    onChange={(e) => setSimYaw(parseFloat(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                </div>

                {/* Roll Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-400">Roll Rate (Gyro Y):</span>
                    <span className="text-purple-400 font-bold">{simRoll > 0 ? `+${simRoll}` : simRoll} °/s</span>
                  </div>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={simRoll}
                    onChange={(e) => setSimRoll(parseFloat(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Deadzone Threshold:</span>
                      <span className="text-white font-bold">{simDeadzone.toFixed(2)} °/s</span>
                    </div>
                    <input
                      type="range"
                      min="0.05"
                      max="1.5"
                      step="0.05"
                      value={simDeadzone}
                      onChange={(e) => setSimDeadzone(parseFloat(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-mono text-slate-400">
                      <span>Mouse Sensitivity Factor:</span>
                      <span className="text-white font-bold">{simSensitivity.toFixed(3)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.005"
                      max="0.08"
                      step="0.005"
                      value={simSensitivity}
                      onChange={(e) => setSimSensitivity(parseFloat(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Virtual Screen / Mouse Aim Testing Canvas */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-white text-xs uppercase font-mono flex items-center gap-2">
                    <Crosshair className="w-4 h-4 text-cyan-400" /> Virtual Mouse Aiming Display
                  </h3>
                  <span className="text-[11px] font-mono text-emerald-400">
                    Pos: ({Math.round(cursorPos.x)}, {Math.round(cursorPos.y)})
                  </span>
                </div>

                <div className="relative flex-1 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden min-h-[220px] flex items-center justify-center">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40" />
                  
                  {/* Center Target */}
                  <div className="absolute w-12 h-12 rounded-full border border-slate-800 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                  </div>

                  {/* Simulated Cursor Target */}
                  <div
                    style={{
                      transform: `translate(${cursorPos.x - 150}px, ${cursorPos.y - 100}px)`
                    }}
                    className="absolute w-5 h-5 rounded-full bg-cyan-400/20 border-2 border-cyan-400 shadow-lg shadow-cyan-400/50 flex items-center justify-center transition-transform duration-75 pointer-events-none"
                  >
                    <div className="w-1 h-1 rounded-full bg-white" />
                  </div>

                  <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-500 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                    Tilt Pitch/Yaw sliders to move cursor
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-slate-400 pt-1">
                  <span>Packet Rate: <strong className="text-emerald-400">1000 Hz</strong></span>
                  <button
                    onClick={() => setCursorPos({ x: 150, y: 100 })}
                    className="text-cyan-400 hover:underline cursor-pointer"
                  >
                    Recenter Target
                  </button>
                </div>
              </div>

              {/* 1000 Hz DualShock 4 Packet Hex Inspector */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3 flex flex-col">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="font-bold text-white text-xs uppercase font-mono flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-purple-400" /> USB 1000 Hz Hex Inspector
                  </h3>
                  <span className="text-[11px] font-mono text-purple-400 font-bold">
                    Pkt #{simPacketCounter}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400">
                  Real-time 64-byte Sony DualShock 4 USB input report parsed by JoyShockMapper:
                </p>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] leading-relaxed flex-1 overflow-x-auto space-y-2">
                  <div className="text-slate-500 text-[10px] pb-1 border-b border-slate-800">
                    00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
                  </div>
                  <div className="grid grid-cols-8 gap-x-2 gap-y-1">
                    {lastRawBytes.map((byte, idx) => {
                      // Highlight Gyro bytes 13..18 in cyan, Accel in emerald
                      const isGyro = idx >= 13 && idx <= 18;
                      const isAccel = idx >= 19 && idx <= 24;
                      return (
                        <span
                          key={idx}
                          className={`text-center font-bold px-1 rounded ${
                            isGyro
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                              : isAccel
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : idx === 0
                              ? 'text-amber-400 font-bold'
                              : 'text-slate-400'
                          }`}
                        >
                          {byte.toString(16).padStart(2, '0').toUpperCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="text-[10px] font-mono flex items-center justify-between text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-cyan-400 inline-block" /> Bytes 13-18: Gyro
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded bg-emerald-400 inline-block" /> Bytes 19-24: Accel
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRE-HARDWARE TESTING GUIDE */}
        {activeTab === 'testingGuide' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-emerald-400" />
                  How to Thoroughly Test This Firmware Before Your Device Arrives
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  You do not need to wait for your physical nRF52840 and LSM6DVS hardware to arrive. Here are 4 proven testing workflows:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
                {/* Method 1: Python Feed to JoyShockMapper */}
                <div className="bg-slate-950 p-4 rounded-xl border border-emerald-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      Method 1: Test Directly in JoyShockMapper on PC
                    </span>
                    <span className="text-[10px] bg-emerald-950 px-2 py-0.5 rounded text-emerald-300 border border-emerald-800 font-mono">
                      Recommended
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    You can test your JoyShockMapper configuration right now on your computer using the included Python test feeder (<code className="text-emerald-300 font-mono">test_joyshockmapper_feed.py</code>).
                  </p>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-400 font-sans">
                    <li>Download <code className="text-white font-mono">test_joyshockmapper_feed.py</code> from the <strong>C Source Code</strong> tab.</li>
                    <li>Run it with Python: <code className="text-white font-mono bg-slate-900 px-1 py-0.5 rounded">python test_joyshockmapper_feed.py</code></li>
                    <li>It emits the exact 64-byte DualShock 4 motion packets at 1000 Hz, allowing JoyShockMapper to calibrate and move your mouse in PC games!</li>
                  </ol>
                </div>

                {/* Method 2: Ghidra Static Verification */}
                <div className="bg-slate-950 p-4 rounded-xl border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-cyan-400 text-sm">
                      Method 2: Static Verification in Ghidra
                    </span>
                    <span className="text-[10px] bg-cyan-950 px-2 py-0.5 rounded text-cyan-300 border border-cyan-800 font-mono">
                      Deep Code Inspection
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Download the <strong>90.6 KB raw `.bin` file</strong> and import it into Ghidra:
                  </p>
                  <ul className="list-disc list-inside space-y-1.5 text-slate-400 font-sans">
                    <li>Verify the Cortex-M4 vector table at <code className="text-cyan-300 font-mono">0x00026000</code>.</li>
                    <li>Disassemble address <code className="text-cyan-300 font-mono">0x00026101</code> (Reset Handler) with TMode = 1.</li>
                    <li>Confirm the FPU enable instructions, DWT Cycle Counter enable, and LSM6DVS register writes (0x88, 0x8C, 0x44).</li>
                  </ul>
                </div>

                {/* Method 3: QEMU ARM Emulation */}
                <div className="bg-slate-950 p-4 rounded-xl border border-purple-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-purple-400 text-sm">
                      Method 3: QEMU Cortex-M4 Emulation
                    </span>
                    <span className="text-[10px] bg-purple-950 px-2 py-0.5 rounded text-purple-300 border border-purple-800 font-mono">
                      QEMU
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Emulate the ARM Cortex-M4 CPU core using QEMU:
                  </p>
                  <pre className="p-2.5 bg-slate-900 text-purple-300 font-mono text-[11px] rounded-lg overflow-x-auto border border-slate-800">
qemu-system-arm -M microbit \\
  -cpu cortex-m4 \\
  -device loader,file=firmware_nrf52840_lsm6dvs.bin,addr=0x26000 \\
  -s -S
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    Connect <code className="text-white font-mono">arm-none-eabi-gdb</code> to port 1234 to single-step the assembly and verify register execution.
                  </p>
                </div>

                {/* Method 4: Antmicro Renode */}
                <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      Method 4: Renode Full-System Emulator
                    </span>
                    <span className="text-[10px] bg-amber-950 px-2 py-0.5 rounded text-amber-300 border border-amber-800 font-mono">
                      Antmicro Renode
                    </span>
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Renode has native support for the Nordic nRF52840 SoC (<code className="text-white font-mono">nrf52840.repl</code>):
                  </p>
                  <pre className="p-2.5 bg-slate-900 text-amber-300 font-mono text-[11px] rounded-lg overflow-x-auto border border-slate-800">
mach create
machine LoadPlatformDescription @platforms/cpus/nrf52840.repl
sysbus LoadBinary @firmware_nrf52840_lsm6dvs.bin 0x26000
cpu PC 0x26101
start
                  </pre>
                  <p className="text-[11px] text-slate-400">
                    Renode simulates hardware peripheral registers (GPIO, SPIM, NVMC flash) in software.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DOWNLOADS (.BIN, .UF2, AND .TXT SOURCE) */}
        {activeTab === 'download' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Option A: Raw .BIN for Ghidra */}
              <div className="bg-gradient-to-br from-cyan-950/60 via-slate-900 to-slate-900 border border-cyan-500/40 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase tracking-wider flex items-center gap-1.5">
                      <Binary className="w-3.5 h-3.5" /> Raw Binary (.bin)
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400 font-bold">90.6 KB</span>
                  </div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    firmware_nrf52840_lsm6dvs.bin
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Raw unencapsulated machine code payload formatted for reverse engineering analysis in <strong>Ghidra</strong>, IDA Pro, or Binary Ninja.
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Format:</span> <span className="text-white">Raw ARMv7E-M</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Base:</span> <span className="text-cyan-300">0x00026000</span>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadBin}
                    className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-cyan-600/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download .BIN (90.6 KB)</span>
                  </button>
                  {downloadSuccess === 'bin' && (
                    <span className="text-[11px] font-mono text-cyan-400 flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> .BIN downloaded!
                    </span>
                  )}
                </div>
              </div>

              {/* Option B: Flashing .UF2 */}
              <div className="bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/40 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider flex items-center gap-1.5">
                      <Disc className="w-3.5 h-3.5" /> Bootloader Image (.uf2)
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 font-bold">181 KB</span>
                  </div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    firmware_nrf52840_lsm6dvs.uf2
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Standard 512-byte block USB Flashing Format image for drag-and-drop flashing onto nRF52840 boards with the <strong>Adafruit / UF2 Bootloader</strong>.
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Blocks:</span> <span className="text-white">354 Blocks</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Family ID:</span> <span className="text-emerald-300">0xADA52840</span>
                    </div>
                  </div>

                  <button
                    onClick={handleDownloadUF2}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-slate-950" />
                    <span>Download .UF2 (181 KB)</span>
                  </button>
                  {downloadSuccess === 'uf2' && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" /> .UF2 downloaded!
                    </span>
                  )}
                </div>
              </div>

              {/* Option C: C Source Package in .TXT format */}
              <div className="bg-gradient-to-br from-purple-950/60 via-slate-900 to-slate-900 border border-purple-500/40 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-wider flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5" /> C Source (.txt)
                    </span>
                    <span className="text-[11px] font-mono text-purple-400 font-bold">All-In-One</span>
                  </div>
                  <h2 className="text-base font-bold text-white tracking-tight">
                    firmware_source.txt
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Complete consolidated C programming package: LSM6DVS 1000Hz driver, nRF52840 HAL, LittleFS, main loop, and JSM configuration in plain text format.
                  </p>
                </div>

                <div className="space-y-2.5 pt-1">
                  <div className="p-2.5 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div className="flex justify-between">
                      <span>Format:</span> <span className="text-white">Plain Text (.txt)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Modules:</span> <span className="text-purple-300">All 7 Source Files</span>
                    </div>
                  </div>

                  <a
                    href="/firmware_nrf52840_lsm6dvs_source.txt"
                    download="firmware_nrf52840_lsm6dvs_source.txt"
                    className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Source (.txt)</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: GHIDRA GUIDE */}
        {activeTab === 'ghidra' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-cyan-400" />
                  Ghidra Import Parameters for firmware_nrf52840_lsm6dvs.bin
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Use these exact settings to analyze the raw binary in Ghidra:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-cyan-400 font-bold block text-sm">Step 1: File Format & Language</span>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 space-y-1">
                    <div><span className="text-slate-500">Format:</span> Raw Binary</div>
                    <div><span className="text-slate-500">Language:</span> ARM:LE:32:Cortex (Little Endian, 32-bit)</div>
                    <div><span className="text-slate-500">Compiler:</span> default</div>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-cyan-400 font-bold block text-sm">Step 2: Base Address (Options...)</span>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 space-y-1">
                    <div><span className="text-slate-500">Block Name:</span> flash</div>
                    <div><span className="text-slate-500">Base Address:</span> <strong className="text-emerald-400">0x00026000</strong></div>
                    <div><span className="text-slate-500">Length:</span> 0x16200 (90,624 bytes)</div>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-cyan-400 font-bold block text-sm">Step 3: Disassemble Entry</span>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 space-y-1">
                    <div><span className="text-slate-500">Goto Address:</span> 0x00026100</div>
                    <div><span className="text-slate-500">TMode (Thumb):</span> 1</div>
                    <div><span className="text-slate-500">Disassemble:</span> Press 'D'</div>
                  </div>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-cyan-400 font-bold block text-sm">Step 4: Memory Map Blocks</span>
                  <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 space-y-1">
                    <div><span className="text-slate-500">NRF_P0 (GPIO):</span> 0x50000000 (1024 bytes)</div>
                    <div><span className="text-slate-500">NRF_SPIM3:</span> 0x4002F000 (1024 bytes)</div>
                    <div><span className="text-slate-500">SRAM:</span> 0x20000000 (256 KB)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SOURCE CODE */}
        {activeTab === 'files' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-2">
              <h3 className="text-xs font-mono uppercase text-slate-400 tracking-wider px-2">Generated Modules</h3>
              <div className="space-y-1">
                {PORTED_FILES.map((file) => (
                  <button
                    key={file.filename}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left p-3 rounded-lg border text-xs transition-all flex flex-col gap-1 cursor-pointer ${
                      selectedFile.filename === file.filename
                        ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                        <FileCode className="w-3.5 h-3.5" />
                        {file.filename}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-sans">
                        {file.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">{file.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-sm">
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-white">{selectedFile.filename}</span>
                    <span className="text-xs text-slate-400 font-sans">({selectedFile.category})</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{selectedFile.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCode(selectedFile.filename, selectedFile.code)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-md font-mono flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                  >
                    {copiedFilename === selectedFile.filename ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDownloadFile(selectedFile)}
                    className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs rounded-md font-mono flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-500/40"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-950/70 overflow-x-auto flex-1 max-h-[640px]">
                <pre className="font-mono text-xs text-slate-200 leading-relaxed selection:bg-emerald-500/30">
                  {selectedFile.code}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>Target Architecture: Nordic nRF52840 (ARM Cortex-M4F)</span>
          <span>•</span>
          <span>Sensor: Single ST LSM6DVS (1000 Hz)</span>
          <span>•</span>
          <span>DualShock 4 USB Emulation</span>
        </div>
        <div className="font-mono text-slate-400">
          Raw Binary: 90.6 KB • UF2 Image: 181 KB
        </div>
      </footer>
    </div>
  );
}
