/**
 * @file lsm6dvs.c
 * @brief STMicroelectronics LSM6DVS 6-Axis IMU Driver Implementation
 * @note Optimized for 1000 Hz real-time JoyShockMapper & Mouse Gyro Tracking.
 */

#include "lsm6dvs.h"
#include "nrf52_hardware.h"
#include <string.h>

static struct {
    int16_t accel[3];
    int16_t gyro[3];
    bool valid;
} s_calib = { {0,0,0}, {0,0,0}, false };

/* Sensitivity:
 * Accel @ +-8g: 0.000244 g/LSB
 * Gyro @ +-2000dps: 0.070 dps/LSB (70 mdps/LSB)
 */
#define LSM6DVS_ACCEL_8G_SENSITIVITY      (0.000244f)
#define LSM6DVS_GYRO_2000DPS_SENSITIVITY  (0.07000f)

int lsm6dvs_write_reg(uint8_t reg, const uint8_t *data, uint16_t len) {
    uint8_t tx_buf[32];
    if (len + 1 > sizeof(tx_buf)) return -1;

    tx_buf[0] = reg & 0x7F; // Write mode
    if (data && len > 0) memcpy(&tx_buf[1], data, len);

    nrf52_imu_cs_low();
    int err = nrf52_spim_transfer(tx_buf, len + 1, NULL, 0);
    nrf52_imu_cs_high();
    return err;
}

int lsm6dvs_read_reg(uint8_t reg, uint8_t *data, uint16_t len) {
    if (!data || len == 0) return -1;

    uint8_t tx_header = reg | LSM6DVS_SPI_READ_BIT; // 0x80 read bit

    nrf52_imu_cs_low();
    int err = nrf52_spim_transfer_split(&tx_header, 1, data, len);
    nrf52_imu_cs_high();
    return err;
}

/**
 * @brief Initializes the single LSM6DVS at 1000 Hz (960 Hz High-Performance ODR).
 */
int lsm6dvs_init_1000hz(void) {
    uint8_t id = 0;
    uint8_t reg = 0;

    nrf52_delay_ms(15);

    // 1. Verify WHO_AM_I
    if (lsm6dvs_read_reg(LSM6DVS_REG_WHO_AM_I, &id, 1) != 0 ||
        (id != LSM6DVS_WHO_AM_I_VAL && id != LSM6DVS16X_WHO_AM_I_VAL)) {
        return -1;
    }

    // 2. Software Reset
    reg = 0x01;
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL3_C, &reg, 1);
    nrf52_delay_ms(10);
    do {
        lsm6dvs_read_reg(LSM6DVS_REG_CTRL3_C, &reg, 1);
    } while (reg & 0x01);

    // 3. Set Block Data Update (BDU) and Auto-Increment (IF_INC)
    reg = LSM6DVS_CTRL3_C_DEFAULT; // 0x44
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL3_C, &reg, 1);
    nrf52_delay_ms(5);

    // 4. Configure Accel for 1000 Hz ODR (960 Hz high-performance, +-8g)
    reg = LSM6DVS_CTRL1_XL_1000HZ_8G; // 0x88
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL1_XL, &reg, 1);
    nrf52_delay_ms(5);

    // 5. Configure Gyro for 1000 Hz ODR (960 Hz high-performance, +-2000 dps)
    // 2000 dps provides maximum angular velocity headroom for gaming flick-shots
    reg = LSM6DVS_CTRL2_G_1000HZ_2000DPS; // 0x8C
    lsm6dvs_write_reg(LSM6DVS_REG_CTRL2_G, &reg, 1);
    nrf52_delay_ms(50); // Sensor internal PLL settling time

    // 6. Zero-rate gyro bias calibration (128 samples)
    lsm6dvs_calibrate(128);
    return 0;
}

int lsm6dvs_read_sample(lsm6dvs_sample_t *sample) {
    if (!sample) return -1;
    uint8_t raw[12];

    // Burst read 12 bytes: Gyro X,Y,Z (6B) then Accel X,Y,Z (6B)
    if (lsm6dvs_read_reg(LSM6DVS_REG_OUTX_L_G, raw, sizeof(raw)) != 0) {
        return -1;
    }

    int16_t gx = (int16_t)(raw[0] | (raw[1] << 8));
    int16_t gy = (int16_t)(raw[2] | (raw[3] << 8));
    int16_t gz = (int16_t)(raw[4] | (raw[5] << 8));

    int16_t ax = (int16_t)(raw[6] | (raw[7] << 8));
    int16_t ay = (int16_t)(raw[8] | (raw[9] << 8));
    int16_t az = (int16_t)(raw[10] | (raw[11] << 8));

    // Zero-rate calibration subtraction
    sample->gyro_raw.x = gx - s_calib.gyro[0];
    sample->gyro_raw.y = gy - s_calib.gyro[1];
    sample->gyro_raw.z = gz - s_calib.gyro[2];

    sample->accel_raw.x = ax - s_calib.accel[0];
    sample->accel_raw.y = ay - s_calib.accel[1];
    sample->accel_raw.z = az - s_calib.accel[2];

    // Hardware FPU floating point conversion
    sample->gyro_dps.x = (float)sample->gyro_raw.x * LSM6DVS_GYRO_2000DPS_SENSITIVITY;
    sample->gyro_dps.y = (float)sample->gyro_raw.y * LSM6DVS_GYRO_2000DPS_SENSITIVITY;
    sample->gyro_dps.z = (float)sample->gyro_raw.z * LSM6DVS_GYRO_2000DPS_SENSITIVITY;

    sample->accel_g.x = (float)sample->accel_raw.x * LSM6DVS_ACCEL_8G_SENSITIVITY;
    sample->accel_g.y = (float)sample->accel_raw.y * LSM6DVS_ACCEL_8G_SENSITIVITY;
    sample->accel_g.z = (float)sample->accel_raw.z * LSM6DVS_ACCEL_8G_SENSITIVITY;

    return 0;
}

int lsm6dvs_calibrate(uint16_t num_samples) {
    if (num_samples == 0) num_samples = 128;
    int32_t sax = 0, say = 0, saz = 0;
    int32_t sgx = 0, sgy = 0, sgz = 0;

    for (uint16_t i = 0; i < num_samples; i++) {
        uint8_t raw[12];
        if (lsm6dvs_read_reg(LSM6DVS_REG_OUTX_L_G, raw, 12) == 0) {
            sgx += (int16_t)(raw[0] | (raw[1] << 8));
            sgy += (int16_t)(raw[2] | (raw[3] << 8));
            sgz += (int16_t)(raw[4] | (raw[5] << 8));
            sax += (int16_t)(raw[6] | (raw[7] << 8));
            say += (int16_t)(raw[8] | (raw[9] << 8));
            saz += (int16_t)(raw[10] | (raw[11] << 8));
        }
        nrf52_delay_us(1000); // 1 ms between samples at 1000 Hz
    }

    s_calib.gyro[0] = (int16_t)(sgx / num_samples);
    s_calib.gyro[1] = (int16_t)(sgy / num_samples);
    s_calib.gyro[2] = (int16_t)(sgz / num_samples);

    s_calib.accel[0] = (int16_t)(sax / num_samples);
    s_calib.accel[1] = (int16_t)(say / num_samples);
    s_calib.accel[2] = (int16_t)((saz / num_samples) - 4096); // Keep 1g (4096 LSB @ +-8g)
    s_calib.valid = true;
    return 0;
}
