/**
 * @file lsm6dsv.cpp
 * @brief STMicroelectronics LSM6DSV 6-Axis IMU Driver Implementation
 */

#include "lsm6dsv.h"
#include <SPI.h>
#include <Wire.h>
#include <nrf_gpio.h>

LSM6DSV imu;

#if (IMU_BUS == IMU_BUS_SPI)
static SPISettings spiSettings(SPI_BUS_SPEED_HZ, MSBFIRST, SPI_MODE3);
#endif

LSM6DSV::LSM6DSV() : _initialized(false) {}

uint8_t LSM6DSV::readRegister(uint8_t reg) {
    uint8_t val = 0;
#if (IMU_BUS == IMU_BUS_SPI)
    nrf_gpio_pin_clear(PIN_IMU_CS);
    SPI.beginTransaction(spiSettings);
    SPI.transfer(reg | LSM6DSV_SPI_READ_BIT);
    val = SPI.transfer(0x00);
    SPI.endTransaction();
    nrf_gpio_pin_set(PIN_IMU_CS);
#elif (IMU_BUS == IMU_BUS_I2C)
    Wire.beginTransmission(IMU_I2C_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)IMU_I2C_ADDR, (uint8_t)1);
    if (Wire.available()) {
        val = Wire.read();
    }
#endif
    return val;
}

void LSM6DSV::writeRegister(uint8_t reg, uint8_t val) {
#if (IMU_BUS == IMU_BUS_SPI)
    nrf_gpio_pin_clear(PIN_IMU_CS);
    SPI.beginTransaction(spiSettings);
    SPI.transfer(reg & ~LSM6DSV_SPI_READ_BIT);
    SPI.transfer(val);
    SPI.endTransaction();
    nrf_gpio_pin_set(PIN_IMU_CS);
#elif (IMU_BUS == IMU_BUS_I2C)
    Wire.beginTransmission(IMU_I2C_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
#endif
}

void LSM6DSV::readBurst(uint8_t start_reg, uint8_t* buffer, uint8_t length) {
#if (IMU_BUS == IMU_BUS_SPI)
    nrf_gpio_pin_clear(PIN_IMU_CS);
    SPI.beginTransaction(spiSettings);
    SPI.transfer(start_reg | LSM6DSV_SPI_READ_BIT);
    for (uint8_t i = 0; i < length; i++) {
        buffer[i] = SPI.transfer(0x00);
    }
    SPI.endTransaction();
    nrf_gpio_pin_set(PIN_IMU_CS);
#elif (IMU_BUS == IMU_BUS_I2C)
    Wire.beginTransmission(IMU_I2C_ADDR);
    Wire.write(start_reg);
    Wire.endTransmission(false);
    Wire.requestFrom((uint8_t)IMU_I2C_ADDR, length);
    for (uint8_t i = 0; i < length && Wire.available(); i++) {
        buffer[i] = Wire.read();
    }
#endif
}

uint8_t LSM6DSV::readWhoAmI() {
    return readRegister(LSM6DSV_WHO_AM_I_REG);
}

bool LSM6DSV::begin() {
#if (IMU_BUS == IMU_BUS_SPI)
    // Configure CS pin as output and set HIGH (inactive)
    nrf_gpio_cfg_output(PIN_IMU_CS);
    nrf_gpio_pin_set(PIN_IMU_CS);

    // Initialize SPI bus with custom pins
    SPI.setPins(PIN_IMU_MISO, PIN_IMU_SCK, PIN_IMU_MOSI);
    SPI.begin();
#elif (IMU_BUS == IMU_BUS_I2C)
    // Initialize I2C bus with custom pins
    Wire.setPins(PIN_IMU_SDA, PIN_IMU_SCL);
    Wire.begin();
    Wire.setClock(I2C_BUS_SPEED_HZ);
#endif

    delay(10);

    // Verify WHO_AM_I register (must be 0x70)
    uint8_t whoami = readWhoAmI();
    if (whoami != LSM6DSV_WHO_AM_I_VAL) {
        return false;
    }

    // Reset device
    writeRegister(LSM6DSV_CTRL3_C, 0x01); // SW_RESET
    delay(15);

    // Configure CTRL3_C: BDU (Block Data Update) = 1, IF_INC (Register Address Auto-increment) = 1
    writeRegister(LSM6DSV_CTRL3_C, 0x44);

    // Configure CTRL1_XL: ODR 960 Hz High-Performance mode (0x09)
    writeRegister(LSM6DSV_CTRL1_XL, 0x09);

    // Configure CTRL2_G: ODR 960 Hz High-Performance mode (0x09)
    writeRegister(LSM6DSV_CTRL2_G, 0x09);

    // Configure Gyro full-scale: ±2000 dps (CTRL6_G = 0x04)
    writeRegister(LSM6DSV_CTRL6_G, 0x04);

    // Configure Accel full-scale: ±4g (CTRL8_XL = 0x01)
    writeRegister(LSM6DSV_CTRL8_XL, 0x01);

    configureInterrupts();

    _initialized = true;
    return true;
}

void LSM6DSV::configureInterrupts() {
    // Route Gyro and Accel Data Ready signals to INT1
    writeRegister(LSM6DSV_INT1_CTRL, 0x03); // INT1_DRDY_G (bit 1) | INT1_DRDY_XL (bit 0)
}

bool LSM6DSV::isDataReady() {
    uint8_t status = readRegister(LSM6DSV_STATUS_REG);
    return (status & 0x02) != 0; // GDA (Gyro Data Available)
}

bool LSM6DSV::readRawMotion(lsm6dsv_raw_data_t* data) {
    if (!data) return false;

    // Burst read 12 bytes starting at 0x22 (OUTX_L_G) to 0x2D (OUTZ_H_XL)
    uint8_t buf[12];
    readBurst(LSM6DSV_OUTX_L_G, buf, 12);

    // Gyro raw data (little-endian)
    data->gyro_x = (int16_t)(((uint16_t)buf[1] << 8) | buf[0]);
    data->gyro_y = (int16_t)(((uint16_t)buf[3] << 8) | buf[2]);
    data->gyro_z = (int16_t)(((uint16_t)buf[5] << 8) | buf[4]);

    // Accel raw data (little-endian)
    data->accel_x = (int16_t)(((uint16_t)buf[7] << 8) | buf[6]);
    data->accel_y = (int16_t)(((uint16_t)buf[9] << 8) | buf[8]);
    data->accel_z = (int16_t)(((uint16_t)buf[11] << 8) | buf[10]);

    return true;
}
