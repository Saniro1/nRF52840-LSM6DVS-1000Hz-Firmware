/**
 * @file nrf52_hardware.h
 * @brief nRF52840 Hardware Abstraction Layer & 1000Hz USB HID Driver
 * @note Implements DualShock 4 emulation (VID 0x054C / PID 0x05C4) for JoyShockMapper
 *       and USB 1000 Hz (1ms bInterval) interrupt polling.
 */

#ifndef NRF52_HARDWARE_H_
#define NRF52_HARDWARE_H_

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* =========================================================================
 * JoyShockMapper USB Identifiers (Sony DualShock 4 USB)
 * ========================================================================= */
#define JSM_USB_VID                     0x054C  /* Sony Interactive Entertainment */
#define JSM_USB_PID                     0x05C4  /* DualShock 4 USB Controller */
#define JSM_USB_POLLING_RATE_HZ         1000    /* 1000 Hz */
#define JSM_USB_INTERVAL_MS             1       /* bInterval = 1 ms (1000 Hz) */

/* Pin Mapping on nRF52840 (Port 0) */
#define NRF52_PIN_IMU_SCK               (27)    /* P0.27 */
#define NRF52_PIN_IMU_MOSI              (26)    /* P0.26 */
#define NRF52_PIN_IMU_MISO              (2)     /* P0.02 */
#define NRF52_PIN_IMU_CS                (29)    /* P0.29 (Single Chip Select for LSM6DVS) */
#define NRF52_PIN_IMU_INT1              (28)    /* P0.28 */
#define NRF52_PIN_LED_STATUS            (13)    /* P0.13 */

/* =========================================================================
 * JoyShockMapper 64-Byte DualShock 4 USB Input Report Structure
 * ========================================================================= */
typedef struct __attribute__((packed)) {
    uint8_t  report_id;         /* 0x01 */
    uint8_t  left_stick_x;      /* 0x80 center */
    uint8_t  left_stick_y;      /* 0x80 center */
    uint8_t  right_stick_x;     /* 0x80 center */
    uint8_t  right_stick_y;     /* 0x80 center */
    uint8_t  dpad_buttons;      /* Bits 0-3: D-pad neutral (0x08), Bits 4-7: Square, Cross, Circle, Triangle */
    uint8_t  buttons_misc1;     /* L1, R1, L2, R2, Share, Options, L3, R3 */
    uint8_t  buttons_misc2;     /* PS Button, Touchpad Click, Counter */
    uint8_t  trigger_left;      /* Analog L2: 0x00..0xFF */
    uint8_t  trigger_right;     /* Analog R2: 0x00..0xFF */
    uint16_t timestamp;         /* Monotonic 187.5 kHz timer */
    uint8_t  battery_level;     /* Battery / Cable status */
    
    /* 6-Axis Motion Sensor Data read by JoyShockLibrary */
    int16_t  gyro_x;            /* Raw Gyro X (pitch/yaw depending on orientation) */
    int16_t  gyro_y;            /* Raw Gyro Y */
    int16_t  gyro_z;            /* Raw Gyro Z (roll/yaw) */
    int16_t  accel_x;           /* Raw Accel X */
    int16_t  accel_y;           /* Raw Accel Y */
    int16_t  accel_z;           /* Raw Accel Z */
    
    /* Extended DS4 controller fields (touchpad, audio status) */
    uint8_t  reserved[39];
} ds4_jsm_usb_report_t;

/* Standard Relative USB Mouse Report (Standalone Gyro-to-Mouse mode) */
typedef struct __attribute__((packed)) {
    uint8_t buttons;            /* Bit 0: Left, Bit 1: Right, Bit 2: Middle */
    int8_t  x;                  /* Relative X delta */
    int8_t  y;                  /* Relative Y delta */
    int8_t  wheel;              /* Wheel delta */
} usb_mouse_report_t;

/* =========================================================================
 * HAL API Functions
 * ========================================================================= */

int nrf52_hardware_init(void);
void nrf52_imu_cs_low(void);
void nrf52_imu_cs_high(void);

int nrf52_spim_transfer(const uint8_t *tx_buf, size_t tx_len, uint8_t *rx_buf, size_t rx_len);
int nrf52_spim_transfer_split(const uint8_t *tx_header, size_t header_len, uint8_t *rx_payload, size_t payload_len);

void nrf52_delay_ms(uint32_t ms);
void nrf52_delay_us(uint32_t us);
uint32_t nrf52_get_time_ms(void);

/**
 * @brief Sends 64-byte DualShock 4 motion packet to JoyShockMapper at 1000 Hz.
 */
int nrf52_usb_send_jsm_report(int16_t gx, int16_t gy, int16_t gz, int16_t ax, int16_t ay, int16_t az);

/**
 * @brief Sends standard HID Mouse relative movement (standalone gyro-to-mouse).
 */
int nrf52_usb_send_mouse_delta(int8_t dx, int8_t dy, uint8_t buttons);

void nrf52_usb_poll(void);

#ifdef __cplusplus
}
#endif

#endif /* NRF52_HARDWARE_H_ */
