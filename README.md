# nRF52840 + LSM6DSV 1000 Hz Gyro Firmware (Smol Slime)

Ultra-low-latency, high-precision motion controller firmware for **Smol Slime / SuperMini nRF52840** (Pro-Micro footprint) paired with a single **STMicroelectronics LSM6DSV** 6-axis IMU. Designed for seamless plug-and-play gyro aiming with **JoyShockMapper**.

Inspired by [alpakka-lite](https://github.com/steviegalluscio/alpakka-lite), adapted for Nordic Semiconductor nRF52840 Cortex-M4F hardware.

---

## ⚡ Key Highlights

* **1000 Hz USB HID Reporting:** High-speed 1 ms interrupt polling (`bInterval = 1`) over USB-C.
* **960 Hz Sensor ODR:** Configures the ST LSM6DSV internal High-Performance engine to 960 Hz (`CTRL2_G = 0x09`, `CTRL1_XL = 0x09`), delivering fresh gyro and accelerometer data with minimal phase delay.
* **Dual-Bus Support (SPI & I2C):** Both high-speed 8 MHz SPI and 400 kHz I2C are fully supported via a single `#define` toggle in `config.h`.
* **JoyShockMapper Auto-Detection:** Emulates a Sony DualShock 4 controller (VID `0x054C`, PID `0x05C4`), enabling immediate motion capture in JoyShockMapper without custom drivers.
* **Startup Zero-Rate Calibration:** Automatically samples 1000 resting readings on boot to eliminate stationary gyro drift and bias.
* **Automated Pinout Scanner (`imu_finder.uf2`):** Exhaustively scans candidate board pins, identifies exact IMU signals, verifies WHO_AM_I (`0x70`), discovers INT1/INT2 lines, and prints ready-to-paste `#define` code.

---

## ⚠️ Hardware Alert: Power Cutoff Pin `P0.13`

On the SuperMini nRF52840 / Smol Slime board, **`P0.13` is the external VCC cutoff power control pin**:
* **Driving `P0.13` LOW turns OFF power** to the 3.3V/VCC pin.
* **Driving `P0.13` HIGH turns ON power** to the 3.3V/VCC pin (powering the LSM6DSV module).
* **NEVER use `P0.13` as a bus signal (SCK, MOSI, MISO, SDA, SCL, CS, or INT).**
* Both `imu_finder` and `firmware` automatically set `P0.13` to `OUTPUT` and drive it `HIGH` with a 50 ms delay at boot before issuing any IMU commands.

---

## 📋 Board Pinout & Candidate Signal Matrix

### SuperMini nRF52840 (Pro-Micro Footprint)

| Position | Arduino Label | MCU GPIO | Candidate for LSM6DSV? | Role / Note |
| :--- | :--- | :--- | :---: | :--- |
| **Power** | `VCC` / `RAW` | — | Power | Powered via switched P0.13 circuit |
| **Power** | `P0.13` | `P0.13` | ❌ **NEVER USE** | **VCC Power Cutoff Control** (Drive HIGH) |
| Left (HF) | `D1` | `P0.06` | No | Left side high-frequency |
| Left (HF) | `D0` | `P0.08` | No | Left side high-frequency |
| Left (HF) | `D2` | `P0.17` | ✅ **Candidate** | Candidate Pin 0 |
| Left (HF) | `D3` | `P0.20` | ✅ **Candidate** | Candidate Pin 1 |
| Left (HF) | `D4` | `P0.22` | ✅ **Candidate** | Candidate Pin 2 |
| Left (HF) | `D5` | `P0.24` | ✅ **Candidate** | Candidate Pin 3 |
| Left (HF) | `D6` | `P1.00` | ✅ **Candidate** | Candidate Pin 4 |
| Left (HF) | `D7` | `P0.11` | ✅ **Candidate** | Candidate Pin 5 |
| Left (LF) | `D8` | `P1.04` | No | Low frequency |
| Left (LF) | `D9` | `P1.06` | No | Low frequency |
| Right (LF) | `D21` | `P0.31` | No | Low frequency |
| Right (LF) | `D20` | `P0.29` | No | Low frequency |
| Right (LF) | `D19` | `P0.02` | ✅ **Candidate** | Candidate Pin 6 |
| Right (LF) | `D18` | `P1.15` | No | Low frequency |
| Right (LF) | `D15` | `P1.13` | No | Low frequency |
| Right (LF) | `D14` | `P1.11` | ✅ **Candidate** | Candidate Pin 7 |
| Right (LF) | `D16` | `P0.10` | No | Low frequency |
| Right (LF) | `D10` | `P0.09` | No | Low frequency |
| Bottom | Pad | `P1.01` | No | Bottom solder pad |
| Bottom | Pad | `P1.02` | No | Bottom solder pad |
| Bottom | Pad | `P1.07` | No | Bottom solder pad |

---

## 🚀 Quick Start: 3-Step Setup Guide

### Step 1: Flash `imu_finder.uf2` to Identify Pinout

Because the pre-soldered LSM6DSV module is connected to a subset of the 8 candidate pins, use the automated diagnostic finder first:

1. Connect your SuperMini nRF52840 board to your computer via USB-C.
2. **Double-tap the physical RESET button** on the board. The board will mount as a USB storage drive (e.g. `NICENANO` or `NRF52BOOT`).
3. Drag and drop **`build/imu_finder.uf2`** onto the drive.
4. Open the Arduino Serial Monitor or any terminal emulator (PuTTY, minicom) at **115200 baud**.
5. `imu_finder` will test every combination, verify `WHO_AM_I` (`0x70`), test INT1 and INT2, and output a copy-paste ready code block.

Example output:
```c
// ========================================================
// COPY AND PASTE THIS BLOCK INTO firmware/config.h:
// ========================================================
#define IMU_BUS         IMU_BUS_SPI
#define PIN_IMU_SCK     NRF_GPIO_PIN_MAP(0, 17)
#define PIN_IMU_MOSI    NRF_GPIO_PIN_MAP(0, 20)
#define PIN_IMU_MISO    NRF_GPIO_PIN_MAP(0, 22)
#define PIN_IMU_CS      NRF_GPIO_PIN_MAP(0, 24)
#define PIN_IMU_INT1    NRF_GPIO_PIN_MAP(1,  0)
#define PIN_IMU_INT2    PIN_UNUSED
// ========================================================
```

---

### Step 2: Paste Pinout into `firmware/config.h`

Open `firmware/config.h` and paste the generated lines into **Section 3 (IMU PIN ASSIGNMENTS)**.

If using I2C:
```c
#define IMU_BUS         IMU_BUS_I2C
#define PIN_IMU_SDA     NRF_GPIO_PIN_MAP(...)
#define PIN_IMU_SCL     NRF_GPIO_PIN_MAP(...)
#define IMU_I2C_ADDR    0x6A
```

---

### Step 3: Flash `firmware.uf2`

1. Push your updated `config.h` to your GitHub repo.
2. GitHub Actions will automatically compile `build/firmware.uf2`.
3. Double-tap RESET on your board, and drag and drop `firmware.uf2` onto the virtual drive.
4. **Keep the device still for 1.2 seconds on startup** so the zero-rate gyro calibration can record the stationary bias.
5. Launch JoyShockMapper. Your controller will be detected immediately as a motion device.

---

## 🔍 How to Read `INFO_UF2.TXT` for Flash Offset

When you double-tap RESET, open the mounted USB drive and view the file **`INFO_UF2.TXT`**.

Look for lines similar to:
```text
UF2 Bootloader 0.6.2 lib/nrfx (v2.0.0)
Model: Nice!Nano
Board-ID: s140_v6.1.1
Date: Jan 2021
```

* **If `Board-ID` specifies `s140_v6.1.1`** (or Bootloader 0.6.x):
  * Application Flash Offset is **`0x26000`** *(Default in `build.yml`)*.
* **If `Board-ID` specifies `s140_v7.x`** (or Bootloader 0.7.x and newer):
  * Application Flash Offset is **`0x27000`**.
  * Update `FLASH_OFFSET: "0x27000"` in `.github/workflows/build.yml`.

---

## ⏱️ Sensor ODR vs. USB Reporting Rate

* **Sensor Internal ODR:** Configured to **960 Hz** (`CTRL2_G = 0x09`, `CTRL1_XL = 0x09`).
  * *Why 960 Hz?* The ST LSM6DSV hardware does not have an exact 1000.0 Hz internal clock divider. Its closest high-performance modes are 480 Hz, 960 Hz, and 1.92 kHz. Setting 960 Hz provides native, unfiltered gyro data without artificial interpolation jitter.
* **USB HID Polling Rate:** Configured to **1000 Hz** (`bInterval = 1`).
  * The USB Full-Speed interrupt endpoint transfers fresh 64-byte packets every 1.0 ms. When new data is ready on INT1, it is immediately dispatched into the active USB frame.

---

## 🎮 JoyShockMapper Configuration Example

Save the following as `smol_slime.txt` in your JoyShockMapper autoload directory:

```ini
# Smol Slime LSM6DSV 1000Hz Configuration
RESET_MAPPINGS

# Gyro Aim Settings
GYRO_OFF = NONE
GYRO_SENS = 2.5
GYRO_SMOOTH_THRESHOLD = 0.0
GYRO_SPACE = LOCAL

# Calibration
CALIBRATE
```

---

## 🛠️ GitHub Actions CI Build Workflow

The included `.github/workflows/build.yml`:
1. Triggers on every push to `main`.
2. Sets up `arduino-cli` with the `adafruit:nrf52` BSP.
3. Compiles both `firmware/firmware.ino` and `imu_finder/imu_finder.ino`.
4. Converts both `.hex` outputs into UF2 format using `uf2conv.py` (Family ID `0xADA52840`, Offset `0x26000`).
5. Publishes both files as GitHub Actions artifacts.
6. Automatically commits the newly built `.uf2` files into the `build/` directory in your repository.
