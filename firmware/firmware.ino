/**
 * @file firmware.ino
 * @brief Main Application Firmware for Smol Slime (nRF52840 + LSM6DSV)
 * 
 * 1000 Hz USB JoyShockMapper Gyroscope Controller.
 * Sensor ODR is 960 Hz; reporting rate over USB is 1000 Hz (1 ms bInterval).
 */

#include "config.h"
#include "board_power.h"
#include "lsm6dsv.h"
#include "calib.h"
#include "usb_hid.h"
#include <nrf_gpio.h>

static volatile bool imu_drdy_event = false;
static lsm6dsv_raw_data_t current_motion;
static uint32_t last_report_micros = 0;

#if (PIN_IMU_INT1 != PIN_UNUSED)
void imu_data_ready_isr() {
    imu_drdy_event = true;
}
#endif

void setup() {
    // 1. Initialize Board Power Switch
    // Drives P0.13 HIGH to power the LSM6DSV and waits 50 ms
    board_power_init();

    // 2. Initialize 1000 Hz USB HID interface (DualShock 4 emulation for JoyShockMapper)
    usbMotion.begin();

    // Optional Serial for diagnostics
    Serial.begin(115200);

    // 3. Initialize LSM6DSV IMU
    bool imu_ok = false;
    for (int retry = 0; retry < 5; retry++) {
        if (imu.begin()) {
            imu_ok = true;
            break;
        }
        delay(50);
    }

    if (!imu_ok) {
        Serial.println(F("[ERROR] LSM6DSV initialization failed! Check wiring or run imu_finder."));
        // Fast error blink if LED is available
        while (1) {
            delay(100);
        }
    }

    Serial.println(F("[OK] LSM6DSV online! Keep device stationary for gyro bias calibration..."));

    // 4. Perform Startup Zero-Rate Gyro Calibration (~1.2 seconds)
    if (calibrator.calibrate(imu)) {
        Serial.println(F("[OK] Gyro calibration complete."));
    } else {
        Serial.println(F("[WARN] Gyro calibration timed out or experienced movement."));
    }

    // 5. Attach Data-Ready Interrupt if configured
#if (PIN_IMU_INT1 != PIN_UNUSED)
    pinMode(PIN_IMU_INT1, INPUT);
    attachInterrupt(digitalPinToInterrupt(PIN_IMU_INT1), imu_data_ready_isr, RISING);
    Serial.println(F("[INFO] Operating in INT1 Data-Ready interrupt mode (960 Hz sync)."));
#else
    Serial.println(F("[INFO] Operating in 1000 Hz high-precision polling mode."));
#endif

    last_report_micros = micros();
}

void loop() {
    uint32_t now = micros();

    bool sample_ready = false;

#if (PIN_IMU_INT1 != PIN_UNUSED)
    if (imu_drdy_event) {
        imu_drdy_event = false;
        sample_ready = true;
    }
#else
    // Precision 1000 Hz loop (~1000 µs interval)
    if ((now - last_report_micros) >= 1000) {
        last_report_micros += 1000;
        sample_ready = true;
    }
#endif

    if (sample_ready) {
        // Read 6-axis gyro + accel data
        if (imu.readRawMotion(&current_motion)) {
            // Apply zero-rate offset calibration and deadband
            calibrator.apply(&current_motion);

            // Transmit 64-byte report to JoyShockMapper at 1000 Hz
            usbMotion.sendMotionReport(current_motion);
        }
    }
}
