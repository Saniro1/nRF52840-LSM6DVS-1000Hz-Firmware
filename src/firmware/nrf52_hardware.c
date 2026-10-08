/**
 * @file nrf52_hardware.c
 * @brief nRF52840 Hardware Abstraction Layer & 1000Hz USB JoyShockMapper Driver
 */

#include "nrf52_hardware.h"
#include <string.h>

#define NRF_P0_BASE         (0x50000000UL)
#define DWT_CYCCNT_ADDR     (0xE0001004UL)
#define DWT_CTRL_ADDR       (0xE0001000UL)

typedef struct {
    volatile uint32_t OUT;
    volatile uint32_t OUTSET;
    volatile uint32_t OUTCLR;
    volatile uint32_t IN;
    volatile uint32_t DIR;
    volatile uint32_t DIRSET;
    volatile uint32_t DIRCLR;
} NRF_GPIO_Regs;

#define NRF_P0 ((NRF_GPIO_Regs *)NRF_P0_BASE)

static volatile uint32_t s_system_tick_ms = 0;
static uint16_t s_jsm_timestamp = 0;

int nrf52_hardware_init(void) {
    // Configure CS Pin as Output & set HIGH (idle)
    NRF_P0->DIRSET = (1UL << NRF52_PIN_IMU_CS);
    NRF_P0->OUTSET = (1UL << NRF52_PIN_IMU_CS);

    // Configure SPI Pins
    NRF_P0->DIRSET = (1UL << NRF52_PIN_IMU_SCK) | (1UL << NRF52_PIN_IMU_MOSI);
    NRF_P0->DIRCLR = (1UL << NRF52_PIN_IMU_MISO);

    // Configure Status LED
    NRF_P0->DIRSET = (1UL << NRF52_PIN_LED_STATUS);
    NRF_P0->OUTCLR = (1UL << NRF52_PIN_LED_STATUS);

    // Enable Cortex-M4 DWT Cycle Counter
    volatile uint32_t *dwt_ctrl = (volatile uint32_t *)DWT_CTRL_ADDR;
    *dwt_ctrl |= 1;

    return 0;
}

void nrf52_imu_cs_low(void) {
    NRF_P0->OUTCLR = (1UL << NRF52_PIN_IMU_CS); // Atomic Pin Clear
}

void nrf52_imu_cs_high(void) {
    NRF_P0->OUTSET = (1UL << NRF52_PIN_IMU_CS); // Atomic Pin Set
}

int nrf52_spim_transfer(const uint8_t *tx_buf, size_t tx_len, uint8_t *rx_buf, size_t rx_len) {
    for (size_t i = 0; i < tx_len; i++) {
        uint8_t byte = tx_buf[i];
        for (int bit = 7; bit >= 0; bit--) {
            if (byte & (1 << bit)) NRF_P0->OUTSET = (1UL << NRF52_PIN_IMU_MOSI);
            else NRF_P0->OUTCLR = (1UL << NRF52_PIN_IMU_MOSI);
            NRF_P0->OUTSET = (1UL << NRF52_PIN_IMU_SCK);
            nrf52_delay_us(1);
            NRF_P0->OUTCLR = (1UL << NRF52_PIN_IMU_SCK);
            nrf52_delay_us(1);
        }
    }
    if (rx_buf && rx_len > 0) {
        for (size_t i = 0; i < rx_len; i++) {
            uint8_t in_byte = 0;
            for (int bit = 7; bit >= 0; bit--) {
                NRF_P0->OUTSET = (1UL << NRF52_PIN_IMU_SCK);
                nrf52_delay_us(1);
                if (NRF_P0->IN & (1UL << NRF52_PIN_IMU_MISO)) in_byte |= (1 << bit);
                NRF_P0->OUTCLR = (1UL << NRF52_PIN_IMU_SCK);
                nrf52_delay_us(1);
            }
            rx_buf[i] = in_byte;
        }
    }
    return 0;
}

int nrf52_spim_transfer_split(const uint8_t *tx_header, size_t header_len, uint8_t *rx_payload, size_t payload_len) {
    nrf52_spim_transfer(tx_header, header_len, NULL, 0);
    return nrf52_spim_transfer(NULL, 0, rx_payload, payload_len);
}

void nrf52_delay_us(uint32_t us) {
    volatile uint32_t *cyccnt = (volatile uint32_t *)DWT_CYCCNT_ADDR;
    uint32_t start = *cyccnt;
    uint32_t target = us * 64; // 64 MHz Cortex-M4
    while ((*cyccnt - start) < target) {
        __asm volatile("nop");
    }
}

void nrf52_delay_ms(uint32_t ms) {
    while (ms--) nrf52_delay_us(1000);
}

uint32_t nrf52_get_time_ms(void) {
    return s_system_tick_ms;
}

/**
 * @brief Transmits a DualShock 4 formatted input report directly to JoyShockMapper.
 * JoyShockLibrary inspects bytes 13-24 for signed 16-bit Gyro and Accel values.
 * Transmitted at 1000 Hz (1 ms interval).
 */
int nrf52_usb_send_jsm_report(int16_t gx, int16_t gy, int16_t gz, int16_t ax, int16_t ay, int16_t az) {
    ds4_jsm_usb_report_t report;
    memset(&report, 0, sizeof(report));

    report.report_id = 0x01;
    report.left_stick_x  = 0x80; // Centered
    report.left_stick_y  = 0x80;
    report.right_stick_x = 0x80;
    report.right_stick_y = 0x80;
    report.dpad_buttons  = 0x08; // Neutral D-pad
    report.timestamp     = ++s_jsm_timestamp;
    report.battery_level = 0x1B; // 100% battery, USB cable connected

    // Motion axes (Little-endian signed 16-bit)
    report.gyro_x  = gx;
    report.gyro_y  = gy;
    report.gyro_z  = gz;
    report.accel_x = ax;
    report.accel_y = ay;
    report.accel_z = az;

    // In actual Nordic SDK / TinyUSB, this is tud_hid_report(0, &report, sizeof(report));
    return sizeof(report);
}

/**
 * @brief Standalone USB HID Mouse packet.
 * Converts angular velocity directly into relative mouse X/Y cursor deltas.
 */
int nrf52_usb_send_mouse_delta(int8_t dx, int8_t dy, uint8_t buttons) {
    usb_mouse_report_t mouse;
    mouse.buttons = buttons;
    mouse.x = dx;
    mouse.y = dy;
    mouse.wheel = 0;

    // tud_hid_n_report(1, 0, &mouse, sizeof(mouse));
    return sizeof(mouse);
}

void nrf52_usb_poll(void) {
    // Process USB interrupt FIFO
}
