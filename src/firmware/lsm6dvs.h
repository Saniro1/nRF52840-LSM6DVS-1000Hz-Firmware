/**
 * @file lsm6dvs.h
 * @brief STMicroelectronics LSM6DVS 6-Axis IMU Driver Header for nRF52840
 * @note Configured for 1000 Hz JoyShockMapper & Mouse Gyro Sampling.
 */

#ifndef LSM6DVS_H_
#define LSM6DVS_H_

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* =========================================================================
 * LSM6DVS Register Map Definitions
 * ========================================================================= */
#define LSM6DVS_REG_FUNC_CFG_ACCESS     0x01
#define LSM6DVS_REG_PIN_CTRL            0x02
#define LSM6DVS_REG_FIFO_CTRL1          0x07
#define LSM6DVS_REG_FIFO_CTRL2          0x08
#define LSM6DVS_REG_FIFO_CTRL3          0x09
#define LSM6DVS_REG_FIFO_CTRL4          0x0A
#define LSM6DVS_REG_WHO_AM_I            0x0F    /* Expected: 0x6C (LSM6DVS) or 0x71 (LSM6DVS16X) */

/* Sensor Configuration */
#define LSM6DVS_REG_CTRL1_XL            0x10    /* Accel ODR & Full-scale */
#define LSM6DVS_REG_CTRL2_G             0x11    /* Gyro ODR & Full-scale */
#define LSM6DVS_REG_CTRL3_C             0x12    /* BDU, Auto-increment, SW Reset */
#define LSM6DVS_REG_CTRL4_C             0x13
#define LSM6DVS_REG_CTRL6_C             0x15
#define LSM6DVS_REG_STATUS_REG          0x1E
#define LSM6DVS_REG_OUT_TEMP_L          0x20
#define LSM6DVS_REG_OUT_TEMP_H          0x21

/* Burst Read starting register: Gyro X,Y,Z then Accel X,Y,Z (12 bytes total) */
#define LSM6DVS_REG_OUTX_L_G            0x22
#define LSM6DVS_REG_OUTX_H_G            0x23
#define LSM6DVS_REG_OUTY_L_G            0x24
#define LSM6DVS_REG_OUTY_H_G            0x25
#define LSM6DVS_REG_OUTZ_L_G            0x26
#define LSM6DVS_REG_OUTZ_H_G            0x27
#define LSM6DVS_REG_OUTX_L_A            0x28
#define LSM6DVS_REG_OUTX_H_A            0x29
#define LSM6DVS_REG_OUTY_L_A            0x2A
#define LSM6DVS_REG_OUTY_H_A            0x2B
#define LSM6DVS_REG_OUTZ_L_A            0x2C
#define LSM6DVS_REG_OUTZ_H_A            0x2D

/* SPI Read/Write Flags */
#define LSM6DVS_SPI_READ_BIT            0x80

/* Expected ID */
#define LSM6DVS_WHO_AM_I_VAL            0x6C
#define LSM6DVS16X_WHO_AM_I_VAL         0x71

/* =========================================================================
 * 1000 Hz High-Speed Configuration for JoyShockMapper & USB 1000Hz Polling
 * ========================================================================= */
/* ODR bits [7:4] in CTRL1_XL & CTRL2_G:
 * 0b1000 (0x80) = 960 Hz / ~1 kHz High-Performance Sampling
 * Full-scale:
 * Accel +-8g (0x08) -> 0x88
 * Gyro +-2000dps (0x0C) or +-500dps (0x04) -> 0x84
 */
#define LSM6DVS_CTRL1_XL_1000HZ_8G      0x88    /* 960/1000 Hz ODR, +-8g */
#define LSM6DVS_CTRL2_G_1000HZ_2000DPS  0x8C    /* 960/1000 Hz ODR, +-2000 dps (ideal for JoyShockMapper) */
#define LSM6DVS_CTRL2_G_1000HZ_500DPS   0x84    /* 960/1000 Hz ODR, +-500 dps */
#define LSM6DVS_CTRL3_C_DEFAULT         0x44    /* BDU = 1 (Block Data Update), IF_INC = 1 */

/* Data Structures */
typedef struct {
    int16_t x, y, z;
} lsm6dvs_raw_axes_t;

typedef struct {
    float x, y, z;
} lsm6dvs_float_axes_t;

typedef struct {
    lsm6dvs_raw_axes_t   accel_raw;
    lsm6dvs_raw_axes_t   gyro_raw;
    lsm6dvs_float_axes_t accel_g;
    lsm6dvs_float_axes_t gyro_dps;
    int16_t temperature_raw;
    float   temperature_c;
} lsm6dvs_sample_t;

/* Functions */
int lsm6dvs_init_1000hz(void);
int lsm6dvs_read_sample(lsm6dvs_sample_t *sample);
int lsm6dvs_calibrate(uint16_t num_samples);
int lsm6dvs_read_reg(uint8_t reg, uint8_t *data, uint16_t len);
int lsm6dvs_write_reg(uint8_t reg, const uint8_t *data, uint16_t len);

#ifdef __cplusplus
}
#endif

#endif /* LSM6DVS_H_ */
