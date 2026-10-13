/**
 * @file lsm6dsv.h
 * @brief STMicroelectronics LSM6DSV 6-Axis IMU Driver Header
 * Dual SPI and I2C support with 960 Hz ODR and high-performance pipeline.
 */

#ifndef LSM6DSV_H_
#define LSM6DSV_H_

#include <stdint.h>
#include <stdbool.h>
#include "config.h"

#define LSM6DSV_WHO_AM_I_REG        0x0F
#define LSM6DSV_WHO_AM_I_VAL        0x70

#define LSM6DSV_INT1_CTRL           0x0D
#define LSM6DSV_INT2_CTRL           0x0E
#define LSM6DSV_CTRL1_XL            0x10
#define LSM6DSV_CTRL2_G             0x11
#define LSM6DSV_CTRL3_C             0x12
#define LSM6DSV_CTRL4_C             0x13
#define LSM6DSV_CTRL6_G             0x15
#define LSM6DSV_CTRL8_XL            0x17
#define LSM6DSV_STATUS_REG          0x1E
#define LSM6DSV_OUTX_L_G            0x22
#define LSM6DSV_OUTX_L_XL           0x28

#define LSM6DSV_SPI_READ_BIT        0x80

typedef struct {
    int16_t gyro_x;
    int16_t gyro_y;
    int16_t gyro_z;
    int16_t accel_x;
    int16_t accel_y;
    int16_t accel_z;
} lsm6dsv_raw_data_t;

class LSM6DSV {
public:
    LSM6DSV();
    bool begin();
    uint8_t readWhoAmI();
    bool readRawMotion(lsm6dsv_raw_data_t* data);
    bool isDataReady();
    void configureInterrupts();

    uint8_t readRegister(uint8_t reg);
    void writeRegister(uint8_t reg, uint8_t val);
    void readBurst(uint8_t start_reg, uint8_t* buffer, uint8_t length);

private:
    bool _initialized;
};

extern LSM6DSV imu;

#endif // LSM6DSV_H_
