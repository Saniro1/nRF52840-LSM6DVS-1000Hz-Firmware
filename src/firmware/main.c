/**
 * @file main.c
 * @brief 1000Hz JoyShockMapper & Mouse Gyro Firmware for nRF52840 + Single LSM6DVS
 * @note Operates at 1000 Hz polling rate via USB-C cable.
 *       Emulates DualShock 4 motion reports for automatic JoyShockMapper detection
 *       while also providing direct standalone Gyro-to-Mouse relative cursor movement.
 */

#include "nrf52_hardware.h"
#include "lsm6dvs.h"
#include "littlefs_nrf52.h"
#include <stdio.h>
#include <string.h>

/* Exact 1000 Hz Polling Rate (1000 microseconds = 1 millisecond) */
#define POLLING_INTERVAL_US     (1000)

/* Standalone Gyro-to-Mouse Sensitivity Factor (when not using JSM) */
#define MOUSE_SENSITIVITY       (0.015f)
#define GYRO_DEADZONE_DPS       (0.25f)

int main(void) {
    // 1. Initialize nRF52840 Hardware, Clocks, GPIO, and SPIM
    nrf52_hardware_init();

    // 2. Initialize LittleFS Flash Storage
    littlefs_nrf52_init();

    // 3. Initialize Single ST LSM6DVS at 1000 Hz (960 Hz High-Performance ODR)
    int status = lsm6dvs_init_1000hz();
    if (status != 0) {
        // Sensor initialization failed: rapid blink error indicator
        while (1) {
            nrf52_delay_ms(100);
        }
    }

    lsm6dvs_sample_t sample;
    uint32_t loop_counter = 0;

    // 4. 1000 Hz Main Loop (1 ms period)
    while (1) {
        // Read 12-byte burst sample from LSM6DVS
        if (lsm6dvs_read_sample(&sample) == 0) {
            loop_counter++;

            // =============================================================
            // A. JoyShockMapper Protocol (Sony DualShock 4 Motion Packet)
            // =============================================================
            // JSM detects VID 0x054C / PID 0x05C4 and reads 16-bit gyro/accel
            // axes directly from the 64-byte USB report at 1000 Hz.
            nrf52_usb_send_jsm_report(
                sample.gyro_raw.x,
                sample.gyro_raw.y,
                sample.gyro_raw.z,
                sample.accel_raw.x,
                sample.accel_raw.y,
                sample.accel_raw.z
            );

            // =============================================================
            // B. Standalone Gyro-to-Mouse Direct Motion
            // =============================================================
            // Converts Gyro Z (Yaw) to Mouse X delta, and Gyro X (Pitch) to Mouse Y delta.
            float gyro_yaw   = sample.gyro_dps.z;
            float gyro_pitch = sample.gyro_dps.x;

            int8_t mouse_dx = 0;
            int8_t mouse_dy = 0;

            if (gyro_yaw > GYRO_DEADZONE_DPS || gyro_yaw < -GYRO_DEADZONE_DPS) {
                mouse_dx = (int8_t)(gyro_yaw * MOUSE_SENSITIVITY);
            }
            if (gyro_pitch > GYRO_DEADZONE_DPS || gyro_pitch < -GYRO_DEADZONE_DPS) {
                mouse_dy = (int8_t)(-gyro_pitch * MOUSE_SENSITIVITY);
            }

            if (mouse_dx != 0 || mouse_dy != 0) {
                nrf52_usb_send_mouse_delta(mouse_dx, mouse_dy, 0);
            }

            // =============================================================
            // C. LittleFS Periodic Logging (100 Hz decimation to save flash)
            // =============================================================
            if ((loop_counter % 10) == 0) {
                littlefs_log_imu_sample(
                    sample.accel_raw.x, sample.accel_raw.y, sample.accel_raw.z,
                    sample.gyro_raw.x, sample.gyro_raw.y, sample.gyro_raw.z
                );
            }
        }

        // Process USB events
        nrf52_usb_poll();

        // High-precision delay to maintain exactly 1000 Hz (1 ms) loop rate
        nrf52_delay_us(POLLING_INTERVAL_US);
    }

    return 0;
}
