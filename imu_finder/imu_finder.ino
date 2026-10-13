/**
 * @file imu_finder.ino
 * @brief Automated LSM6DSV Pinout Scanner for Smol Slime / SuperMini nRF52840
 * 
 * Exhaustively tests candidate pins P0.17, P0.20, P0.22, P0.24, P1.00, P0.11, P0.02, P1.11
 * for I2C (0x6A / 0x6B) and SPI Mode 3 / Mode 0 WHO_AM_I (0x70) responses.
 * Detects INT1 / INT2 lines and prints ready-to-paste #define blocks.
 */

#include <Arduino.h>
#include <nrf_gpio.h>

// Board power switch: P0.13 controls VCC cutoff. Drive HIGH to enable power to IMU!
#define PIN_POWER_VCC_CUTOFF      13  // P0.13
#define POWER_ON_DELAY_MS         50

#define LSM6DSV_WHO_AM_I_REG      0x0F
#define LSM6DSV_EXPECTED_ID       0x70

#define LSM6DSV_INT1_CTRL         0x0D
#define LSM6DSV_INT2_CTRL         0x0E
#define LSM6DSV_CTRL1_XL          0x10
#define LSM6DSV_CTRL2_G           0x11
#define LSM6DSV_CTRL3_C           0x12

struct PinDesc {
    const char* label;
    uint32_t port;
    uint32_t pin;
    uint32_t raw_pin;
};

// Exactly the 8 pins wired to the LSM6DSV module on the Smol Slime board
static const PinDesc CANDIDATES[8] = {
    { "P0.17 (D2)",  0, 17, NRF_GPIO_PIN_MAP(0, 17) },
    { "P0.20 (D3)",  0, 20, NRF_GPIO_PIN_MAP(0, 20) },
    { "P0.22 (D4)",  0, 22, NRF_GPIO_PIN_MAP(0, 22) },
    { "P0.24 (D5)",  0, 24, NRF_GPIO_PIN_MAP(0, 24) },
    { "P1.00 (D6)",  1,  0, NRF_GPIO_PIN_MAP(1,  0) },
    { "P0.11 (D7)",  0, 11, NRF_GPIO_PIN_MAP(0, 11) },
    { "P0.02 (D19)", 0,  2, NRF_GPIO_PIN_MAP(0,  2) },
    { "P1.11 (D14)", 1, 11, NRF_GPIO_PIN_MAP(1, 11) }
};

// Reset all 8 candidate pins to high-impedance inputs
static void reset_candidate_pins() {
    for (int i = 0; i < 8; i++) {
        nrf_gpio_cfg_input(CANDIDATES[i].raw_pin, NRF_GPIO_PIN_PULLUP);
    }
}

// ==============================================================================
// 1. FAST BIT-BANG I2C SCANNER (100 kHz)
// ==============================================================================
static void i2c_delay() {
    delayMicroseconds(5); // ~100 kHz half-period
}

static void i2c_sda_high(uint32_t sda) {
    nrf_gpio_cfg_input(sda, NRF_GPIO_PIN_PULLUP); // Open-drain release HIGH
}

static void i2c_sda_low(uint32_t sda) {
    nrf_gpio_cfg_output(sda);
    nrf_gpio_pin_clear(sda);
}

static void i2c_scl_high(uint32_t scl) {
    nrf_gpio_cfg_input(scl, NRF_GPIO_PIN_PULLUP); // Open-drain release HIGH
}

static void i2c_scl_low(uint32_t scl) {
    nrf_gpio_cfg_output(scl);
    nrf_gpio_pin_clear(scl);
}

static void i2c_start(uint32_t sda, uint32_t scl) {
    i2c_sda_high(sda);
    i2c_scl_high(scl);
    i2c_delay();
    i2c_sda_low(sda);
    i2c_delay();
    i2c_scl_low(scl);
    i2c_delay();
}

static void i2c_stop(uint32_t sda, uint32_t scl) {
    i2c_sda_low(sda);
    i2c_delay();
    i2c_scl_high(scl);
    i2c_delay();
    i2c_sda_high(sda);
    i2c_delay();
}

static bool i2c_write_byte(uint32_t sda, uint32_t scl, uint8_t byte) {
    for (uint8_t i = 0; i < 8; i++) {
        if (byte & 0x80) i2c_sda_high(sda);
        else             i2c_sda_low(sda);
        byte <<= 1;
        i2c_delay();
        i2c_scl_high(scl);
        i2c_delay();
        i2c_scl_low(scl);
        i2c_delay();
    }
    // Read ACK
    i2c_sda_high(sda);
    i2c_delay();
    i2c_scl_high(scl);
    i2c_delay();
    bool ack = (nrf_gpio_pin_read(sda) == 0);
    i2c_scl_low(scl);
    i2c_delay();
    return ack;
}

static uint8_t i2c_read_byte(uint32_t sda, uint32_t scl, bool ack) {
    uint8_t byte = 0;
    i2c_sda_high(sda);
    for (uint8_t i = 0; i < 8; i++) {
        byte <<= 1;
        i2c_scl_high(scl);
        i2c_delay();
        if (nrf_gpio_pin_read(sda)) byte |= 1;
        i2c_scl_low(scl);
        i2c_delay();
    }
    // Send ACK or NACK
    if (ack) i2c_sda_low(sda);
    else     i2c_sda_high(sda);
    i2c_delay();
    i2c_scl_high(scl);
    i2c_delay();
    i2c_scl_low(scl);
    i2c_delay();
    i2c_sda_high(sda);
    return byte;
}

static uint8_t test_i2c_whoami(uint32_t sda, uint32_t scl, uint8_t addr) {
    i2c_start(sda, scl);
    if (!i2c_write_byte(sda, scl, (addr << 1) | 0)) { // Write
        i2c_stop(sda, scl);
        return 0x00;
    }
    if (!i2c_write_byte(sda, scl, LSM6DSV_WHO_AM_I_REG)) {
        i2c_stop(sda, scl);
        return 0x00;
    }
    // Repeated start
    i2c_start(sda, scl);
    if (!i2c_write_byte(sda, scl, (addr << 1) | 1)) { // Read
        i2c_stop(sda, scl);
        return 0x00;
    }
    uint8_t id = i2c_read_byte(sda, scl, false); // NACK final byte
    i2c_stop(sda, scl);
    return id;
}

static void i2c_write_reg(uint32_t sda, uint32_t scl, uint8_t addr, uint8_t reg, uint8_t val) {
    i2c_start(sda, scl);
    i2c_write_byte(sda, scl, (addr << 1) | 0);
    i2c_write_byte(sda, scl, reg);
    i2c_write_byte(sda, scl, val);
    i2c_stop(sda, scl);
}

// ==============================================================================
// 2. FAST BIT-BANG SPI SCANNER (Mode 3 & Mode 0, ~1 MHz)
// ==============================================================================
static void spi_delay() {
    // Single cycle NOPs for ~1 MHz at 64 MHz M4F
    __NOP(); __NOP(); __NOP(); __NOP();
}

static uint8_t test_spi_whoami(uint32_t sck, uint32_t mosi, uint32_t miso, uint32_t cs, uint8_t mode) {
    nrf_gpio_cfg_output(cs);
    nrf_gpio_pin_set(cs); // Inactive HIGH

    nrf_gpio_cfg_output(sck);
    if (mode == 3) nrf_gpio_pin_set(sck);   // Mode 3: CPOL = 1 (idle HIGH)
    else           nrf_gpio_pin_clear(sck); // Mode 0: CPOL = 0 (idle LOW)

    nrf_gpio_cfg_output(mosi);
    nrf_gpio_pin_clear(mosi);

    nrf_gpio_cfg_input(miso, NRF_GPIO_PIN_PULLUP);

    spi_delay();
    nrf_gpio_pin_clear(cs); // Assert CS LOW
    spi_delay();

    uint8_t tx_cmd = 0x80 | LSM6DSV_WHO_AM_I_REG; // Read bit + 0x0F
    uint8_t rx_val = 0;

    // Send 8-bit command
    for (uint8_t b = 0; b < 8; b++) {
        if (tx_cmd & 0x80) nrf_gpio_pin_set(mosi);
        else               nrf_gpio_pin_clear(mosi);
        tx_cmd <<= 1;
        spi_delay();

        if (mode == 3) {
            nrf_gpio_pin_clear(sck); // Falling edge (CPHA = 1)
            spi_delay();
            nrf_gpio_pin_set(sck);   // Rising edge
        } else {
            nrf_gpio_pin_set(sck);   // Rising edge (CPHA = 0)
            spi_delay();
            nrf_gpio_pin_clear(sck); // Falling edge
        }
        spi_delay();
    }

    // Read 8-bit response
    for (uint8_t b = 0; b < 8; b++) {
        rx_val <<= 1;
        if (mode == 3) {
            nrf_gpio_pin_clear(sck);
            spi_delay();
            if (nrf_gpio_pin_read(miso)) rx_val |= 1;
            nrf_gpio_pin_set(sck);
        } else {
            nrf_gpio_pin_set(sck);
            spi_delay();
            if (nrf_gpio_pin_read(miso)) rx_val |= 1;
            nrf_gpio_pin_clear(sck);
        }
        spi_delay();
    }

    nrf_gpio_pin_set(cs); // Release CS HIGH
    spi_delay();

    // Reset pins back to high-impedance inputs
    nrf_gpio_cfg_input(cs, NRF_GPIO_PIN_PULLUP);
    nrf_gpio_cfg_input(sck, NRF_GPIO_PIN_PULLUP);
    nrf_gpio_cfg_input(mosi, NRF_GPIO_PIN_PULLUP);
    nrf_gpio_cfg_input(miso, NRF_GPIO_PIN_PULLUP);

    return rx_val;
}

static void spi_write_reg(uint32_t sck, uint32_t mosi, uint32_t cs, uint8_t reg, uint8_t val) {
    nrf_gpio_cfg_output(cs);
    nrf_gpio_pin_clear(cs);
    nrf_gpio_cfg_output(sck);
    nrf_gpio_pin_set(sck);
    nrf_gpio_cfg_output(mosi);

    uint8_t tx[2] = { (uint8_t)(reg & ~0x80), val };
    for (int byte = 0; byte < 2; byte++) {
        uint8_t d = tx[byte];
        for (int i = 0; i < 8; i++) {
            if (d & 0x80) nrf_gpio_pin_set(mosi);
            else          nrf_gpio_pin_clear(mosi);
            d <<= 1;
            spi_delay();
            nrf_gpio_pin_clear(sck);
            spi_delay();
            nrf_gpio_pin_set(sck);
            spi_delay();
        }
    }
    nrf_gpio_pin_set(cs);
}

// ==============================================================================
// 3. INTERRUPT PIN DETECTOR (INT1 / INT2)
// ==============================================================================
static int detect_active_pin(const int* unused_indices, int count) {
    uint32_t high_counts[8] = {0};
    for (int t = 0; t < 200; t++) {
        for (int i = 0; i < count; i++) {
            int idx = unused_indices[i];
            if (nrf_gpio_pin_read(CANDIDATES[idx].raw_pin) == 1) {
                high_counts[idx]++;
            }
        }
        delayMicroseconds(50);
    }
    int best_pin_idx = -1;
    uint32_t max_count = 50; // threshold
    for (int i = 0; i < count; i++) {
        int idx = unused_indices[i];
        if (high_counts[idx] > max_count) {
            max_count = high_counts[idx];
            best_pin_idx = idx;
        }
    }
    return best_pin_idx;
}

void setup() {
    // 1. Critical Power Enable
    // Drive P0.13 HIGH to provide power to the switched VCC pin
    nrf_gpio_cfg_output(PIN_POWER_VCC_CUTOFF);
    nrf_gpio_pin_set(PIN_POWER_VCC_CUTOFF);
    delay(POWER_ON_DELAY_MS);

    // 2. Initialize USB Serial
    Serial.begin(115200);
    while (!Serial && millis() < 3000); // Wait up to 3s for Serial Monitor

    Serial.println();
    Serial.println(F("================================================================"));
    Serial.println(F(" Smol Slime / SuperMini nRF52840 - LSM6DSV Pinout Finder"));
    Serial.println(F("================================================================"));
    Serial.println(F("[INFO] P0.13 driven HIGH (switched VCC power ON)."));
    Serial.println(F("[INFO] Testing candidate pins:"));
    for (int i = 0; i < 8; i++) {
        Serial.print(F("       Candidate "));
        Serial.print(i);
        Serial.print(F(": "));
        Serial.println(CANDIDATES[i].label);
    }
    Serial.println(F("----------------------------------------------------------------"));
    Serial.println(F("[1/2] Scanning I2C combinations..."));

    reset_candidate_pins();
    bool found_any = false;

    // --- I2C SCAN ---
    const uint8_t i2c_addrs[2] = { 0x6A, 0x6B };
    for (int sda_i = 0; sda_i < 8; sda_i++) {
        for (int scl_i = 0; scl_i < 8; scl_i++) {
            if (sda_i == scl_i) continue;
            for (int a = 0; a < 2; a++) {
                uint8_t id = test_i2c_whoami(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a]);
                if (id == LSM6DSV_EXPECTED_ID) {
                    found_any = true;
                    Serial.println();
                    Serial.println(F(">>> SUCCESS: I2C LSM6DSV FOUND! <<<"));
                    Serial.print(F("    SDA: ")); Serial.println(CANDIDATES[sda_i].label);
                    Serial.print(F("    SCL: ")); Serial.println(CANDIDATES[scl_i].label);
                    Serial.print(F("    Address: 0x")); Serial.println(i2c_addrs[a], HEX);

                    // Test INT1 / INT2 on remaining 6 pins
                    int remaining[6];
                    int r_cnt = 0;
                    for (int k = 0; k < 8; k++) {
                        if (k != sda_i && k != scl_i) remaining[r_cnt++] = k;
                    }

                    // Enable sensor
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_CTRL3_C, 0x44);
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_CTRL1_XL, 0x09);
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_CTRL2_G, 0x09);

                    // Route DRDY to INT1
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_INT1_CTRL, 0x03);
                    int int1_idx = detect_active_pin(remaining, r_cnt);
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_INT1_CTRL, 0x00);

                    // Route DRDY to INT2
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_INT2_CTRL, 0x03);
                    int int2_idx = detect_active_pin(remaining, r_cnt);
                    i2c_write_reg(CANDIDATES[sda_i].raw_pin, CANDIDATES[scl_i].raw_pin, i2c_addrs[a], LSM6DSV_INT2_CTRL, 0x00);

                    print_copy_paste_config_i2c(sda_i, scl_i, i2c_addrs[a], int1_idx, int2_idx);
                }
            }
        }
    }

    Serial.println(F("----------------------------------------------------------------"));
    Serial.println(F("[2/2] Scanning SPI Mode 3 & Mode 0 combinations..."));

    // --- SPI SCAN ---
    // 8 * 7 * 6 * 5 = 1680 permutations
    for (int sck_i = 0; sck_i < 8; sck_i++) {
        for (int mosi_i = 0; mosi_i < 8; mosi_i++) {
            if (mosi_i == sck_i) continue;
            for (int miso_i = 0; miso_i < 8; miso_i++) {
                if (miso_i == sck_i || miso_i == mosi_i) continue;
                for (int cs_i = 0; cs_i < 8; cs_i++) {
                    if (cs_i == sck_i || cs_i == mosi_i || cs_i == miso_i) continue;

                    // Test SPI Mode 3 first (standard for ST IMUs)
                    uint8_t id = test_spi_whoami(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin,
                                                 CANDIDATES[miso_i].raw_pin, CANDIDATES[cs_i].raw_pin, 3);
                    uint8_t detected_mode = 3;
                    if (id != LSM6DSV_EXPECTED_ID) {
                        id = test_spi_whoami(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin,
                                             CANDIDATES[miso_i].raw_pin, CANDIDATES[cs_i].raw_pin, 0);
                        detected_mode = 0;
                    }

                    if (id == LSM6DSV_EXPECTED_ID) {
                        found_any = true;
                        Serial.println();
                        Serial.println(F(">>> SUCCESS: SPI LSM6DSV FOUND! <<<"));
                        Serial.print(F("    SCK:  ")); Serial.println(CANDIDATES[sck_i].label);
                        Serial.print(F("    MOSI: ")); Serial.println(CANDIDATES[mosi_i].label);
                        Serial.print(F("    MISO: ")); Serial.println(CANDIDATES[miso_i].label);
                        Serial.print(F("    CS:   ")); Serial.println(CANDIDATES[cs_i].label);
                        Serial.print(F("    Mode: ")); Serial.println(detected_mode);

                        // Find remaining 4 pins
                        int remaining[4];
                        int r_cnt = 0;
                        for (int k = 0; k < 8; k++) {
                            if (k != sck_i && k != mosi_i && k != miso_i && k != cs_i) {
                                remaining[r_cnt++] = k;
                            }
                        }

                        // Enable sensor and detect INT1 / INT2
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_CTRL3_C, 0x44);
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_CTRL1_XL, 0x09);
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_CTRL2_G, 0x09);

                        // Route DRDY to INT1
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_INT1_CTRL, 0x03);
                        int int1_idx = detect_active_pin(remaining, r_cnt);
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_INT1_CTRL, 0x00);

                        // Route DRDY to INT2
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_INT2_CTRL, 0x03);
                        int int2_idx = detect_active_pin(remaining, r_cnt);
                        spi_write_reg(CANDIDATES[sck_i].raw_pin, CANDIDATES[mosi_i].raw_pin, CANDIDATES[cs_i].raw_pin, LSM6DSV_INT2_CTRL, 0x00);

                        print_copy_paste_config_spi(sck_i, mosi_i, miso_i, cs_i, int1_idx, int2_idx);
                    }
                }
            }
        }
    }

    Serial.println();
    if (!found_any) {
        Serial.println(F("[FAIL] No working combination found. Please check:"));
        Serial.println(F("       1. Is P0.13 correctly powering the board VCC?"));
        Serial.println(F("       2. Is the LSM6DSV soldered properly?"));
    } else {
        Serial.println(F("[DONE] Copy the configuration block above into firmware/config.h and flash firmware.uf2!"));
    }
}

void print_copy_paste_config_i2c(int sda_i, int scl_i, uint8_t addr, int int1_i, int int2_i) {
    Serial.println();
    Serial.println(F("// ========================================================"));
    Serial.println(F("// COPY AND PASTE THIS BLOCK INTO firmware/config.h:"));
    Serial.println(F("// ========================================================"));
    Serial.println(F("#define IMU_BUS         IMU_BUS_I2C"));
    Serial.print  (F("#define PIN_IMU_SDA     NRF_GPIO_PIN_MAP("));
    Serial.print(CANDIDATES[sda_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[sda_i].pin); Serial.println(F(")"));
    Serial.print  (F("#define PIN_IMU_SCL     NRF_GPIO_PIN_MAP("));
    Serial.print(CANDIDATES[scl_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[scl_i].pin); Serial.println(F(")"));
    Serial.print  (F("#define IMU_I2C_ADDR    0x")); Serial.println(addr, HEX);
    if (int1_i >= 0) {
        Serial.print(F("#define PIN_IMU_INT1    NRF_GPIO_PIN_MAP("));
        Serial.print(CANDIDATES[int1_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[int1_i].pin); Serial.println(F(")"));
    } else {
        Serial.println(F("#define PIN_IMU_INT1    PIN_UNUSED"));
    }
    if (int2_i >= 0) {
        Serial.print(F("#define PIN_IMU_INT2    NRF_GPIO_PIN_MAP("));
        Serial.print(CANDIDATES[int2_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[int2_i].pin); Serial.println(F(")"));
    } else {
        Serial.println(F("#define PIN_IMU_INT2    PIN_UNUSED"));
    }
    Serial.println(F("// ========================================================"));
}

void print_copy_paste_config_spi(int sck_i, int mosi_i, int miso_i, int cs_i, int int1_i, int int2_i) {
    Serial.println();
    Serial.println(F("// ========================================================"));
    Serial.println(F("// COPY AND PASTE THIS BLOCK INTO firmware/config.h:"));
    Serial.println(F("// ========================================================"));
    Serial.println(F("#define IMU_BUS         IMU_BUS_SPI"));
    Serial.print  (F("#define PIN_IMU_SCK     NRF_GPIO_PIN_MAP("));
    Serial.print(CANDIDATES[sck_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[sck_i].pin); Serial.println(F(")"));
    Serial.print  (F("#define PIN_IMU_MOSI    NRF_GPIO_PIN_MAP("));
    Serial.print(CANDIDATES[mosi_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[mosi_i].pin); Serial.println(F(")"));
    Serial.print  (F("#define PIN_IMU_MISO    NRF_GPIO_PIN_MAP("));
    Serial.print(CANDIDATES[miso_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[miso_i].pin); Serial.println(F(")"));
    Serial.print  (F("#define PIN_IMU_CS      NRF_GPIO_PIN_MAP("));
    Serial.print(CANDIDATES[cs_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[cs_i].pin); Serial.println(F(")"));
    if (int1_i >= 0) {
        Serial.print(F("#define PIN_IMU_INT1    NRF_GPIO_PIN_MAP("));
        Serial.print(CANDIDATES[int1_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[int1_i].pin); Serial.println(F(")"));
    } else {
        Serial.println(F("#define PIN_IMU_INT1    PIN_UNUSED"));
    }
    if (int2_i >= 0) {
        Serial.print(F("#define PIN_IMU_INT2    NRF_GPIO_PIN_MAP("));
        Serial.print(CANDIDATES[int2_i].port); Serial.print(F(", ")); Serial.print(CANDIDATES[int2_i].pin); Serial.println(F(")"));
    } else {
        Serial.println(F("#define PIN_IMU_INT2    PIN_UNUSED"));
    }
    Serial.println(F("// ========================================================"));
}

void loop() {
    // Repeat scan message every 5 seconds if running continuously
    delay(5000);
    Serial.println(F("[HEARTBEAT] imu_finder running. Scan completed. Reset board to re-scan."));
}
