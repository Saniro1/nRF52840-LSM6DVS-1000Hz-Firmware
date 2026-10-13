/**
 * @file usb_hid.cpp
 * @brief 1000 Hz USB HID JoyShockMapper & Gamepad Motion Interface Implementation
 */

#include "usb_hid.h"
#include <Adafruit_TinyUSB.h>
#include <string.h>

USBMotionDevice usbMotion;

// DualShock 4 HID Report Descriptor for JoyShockMapper compatibility
// Advertises 64-byte input report with 1 ms (1000 Hz) interrupt endpoint
static const uint8_t desc_hid_report[] = {
    0x05, 0x01,        // Usage Page (Generic Desktop Ctrls)
    0x09, 0x05,        // Usage (Game Pad)
    0xA1, 0x01,        // Collection (Application)
    0x85, 0x01,        //   Report ID (1)
    0x09, 0x30,        //   Usage (X)
    0x09, 0x31,        //   Usage (Y)
    0x09, 0x32,        //   Usage (Z)
    0x09, 0x35,        //   Usage (Rz)
    0x15, 0x00,        //   Logical Minimum (0)
    0x26, 0xFF, 0x00,  //   Logical Maximum (255)
    0x75, 0x08,        //   Report Size (8)
    0x95, 0x04,        //   Report Count (4)
    0x81, 0x02,        //   Input (Data,Var,Abs)
    0x09, 0x39,        //   Usage (Hat switch)
    0x15, 0x00,        //   Logical Minimum (0)
    0x25, 0x07,        //   Logical Maximum (7)
    0x35, 0x00,        //   Physical Minimum (0)
    0x46, 0x3B, 0x01,  //   Physical Maximum (315)
    0x65, 0x14,        //   Unit (Eng Rot:Angular Pos)
    0x75, 0x04,        //   Report Size (4)
    0x95, 0x01,        //   Report Count (1)
    0x81, 0x42,        //   Input (Data,Var,Abs,Null)
    0x65, 0x00,        //   Unit (None)
    0x05, 0x09,        //   Usage Page (Button)
    0x19, 0x01,        //   Usage Minimum (0x01)
    0x29, 0x0E,        //   Usage Maximum (0x0E)
    0x15, 0x00,        //   Logical Minimum (0)
    0x25, 0x01,        //   Logical Maximum (1)
    0x75, 0x01,        //   Report Size (1)
    0x95, 0x0E,        //   Report Count (14)
    0x81, 0x02,        //   Input (Data,Var,Abs)
    0x06, 0x00, 0xFF,  //   Usage Page (Vendor Defined 0xFF00)
    0x09, 0x20,        //   Usage (0x20)
    0x75, 0x06,        //   Report Size (6)
    0x95, 0x01,        //   Report Count (1)
    0x81, 0x02,        //   Input (Data,Var,Abs)
    0x09, 0x21,        //   Usage (0x21 - Gyro & Accel Motion Data)
    0x15, 0x00,        //   Logical Minimum (0)
    0x26, 0xFF, 0x00,  //   Logical Maximum (255)
    0x75, 0x08,        //   Report Size (8)
    0x95, 0x38,        //   Report Count (56 bytes vendor motion & status)
    0x81, 0x02,        //   Input (Data,Var,Abs)
    0xC0               // End Collection
};

static Adafruit_USBD_HID usb_hid;

USBMotionDevice::USBMotionDevice() : _packet_counter(0) {
    memset(&_report, 0, sizeof(_report));
    _report.report_id = 0x01;
    _report.left_stick_x = 0x80;
    _report.left_stick_y = 0x80;
    _report.right_stick_x = 0x80;
    _report.right_stick_y = 0x80;
    _report.buttons1 = 0x08; // Hat switch released
    _report.battery_level = 0xFF; // Full power over USB
}

bool USBMotionDevice::begin() {
    // Set USB Vendor and Product ID
    TinyUSBDevice.setID(USB_VID, USB_PID);
    TinyUSBDevice.setManufacturerDescriptor(USB_MANUFACTURER_NAME);
    TinyUSBDevice.setProductDescriptor(USB_PRODUCT_NAME);

    // Configure 1000 Hz polling rate (bInterval = 1 ms)
    usb_hid.setPollInterval(1);
    usb_hid.setReportDescriptor(desc_hid_report, sizeof(desc_hid_report));
    
    return usb_hid.begin();
}

bool USBMotionDevice::isReady() {
    return TinyUSBDevice.mounted() && usb_hid.ready();
}

bool USBMotionDevice::sendMotionReport(const lsm6dsv_raw_data_t& motion) {
    if (!isReady()) return false;

    _report.timestamp = (uint16_t)(micros() & 0xFFFF);
    _report.gyro_x = motion.gyro_x;
    _report.gyro_y = motion.gyro_y;
    _report.gyro_z = motion.gyro_z;
    _report.accel_x = motion.accel_x;
    _report.accel_y = motion.accel_y;
    _report.accel_z = motion.accel_z;

    _packet_counter++;
    _report.buttons3 = (uint8_t)((_packet_counter << 2) & 0xFC);

    // Send 64-byte report 0x01
    return usb_hid.sendReport(0x01, ((uint8_t*)&_report) + 1, sizeof(ds4_usb_report_t) - 1);
}
