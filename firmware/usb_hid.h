/**
 * @file usb_hid.h
 * @brief 1000 Hz USB HID JoyShockMapper & Gamepad Motion Interface
 */

#ifndef USB_HID_H_
#define USB_HID_H_

#include <stdint.h>
#include <stdbool.h>
#include "lsm6dsv.h"

// DualShock 4 USB Report 0x01 packet structure (64 bytes)
typedef struct __attribute__((packed)) {
    uint8_t report_id;        // 0x01
    uint8_t left_stick_x;     // 0x80 (Center)
    uint8_t left_stick_y;     // 0x80 (Center)
    uint8_t right_stick_x;    // 0x80 (Center)
    uint8_t right_stick_y;    // 0x80 (Center)
    uint8_t buttons1;         // D-pad (0x08 = released) & action buttons
    uint8_t buttons2;         // Shoulders, triggers, share, options
    uint8_t buttons3;         // PS button, clickpad, counter
    uint8_t trigger_left;     // 0x00
    uint8_t trigger_right;    // 0x00
    uint16_t timestamp;       // Microsecond / tick counter
    uint8_t battery_level;    // 0xFF (Full / USB Powered)
    int16_t gyro_x;           // Angular rate pitch / yaw (little-endian)
    int16_t gyro_y;           // Angular rate
    int16_t gyro_z;           // Angular rate roll
    int16_t accel_x;          // Acceleration X (little-endian)
    int16_t accel_y;          // Acceleration Y
    int16_t accel_z;          // Acceleration Z
    uint8_t padding[40];      // Touchpad and state padding (to 64 bytes)
} ds4_usb_report_t;

class USBMotionDevice {
public:
    USBMotionDevice();
    bool begin();
    bool sendMotionReport(const lsm6dsv_raw_data_t& motion);
    bool isReady();

private:
    ds4_usb_report_t _report;
    uint16_t _packet_counter;
};

extern USBMotionDevice usbMotion;

#endif // USB_HID_H_
