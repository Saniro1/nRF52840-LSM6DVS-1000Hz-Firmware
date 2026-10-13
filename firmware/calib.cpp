/**
 * @file calib.cpp
 * @brief Startup Zero-Rate Gyroscope Bias Calibration and Filtering Implementation
 */

#include "calib.h"
#include <Arduino.h>
#include <stdlib.h>

GyroCalibrator calibrator;

GyroCalibrator::GyroCalibrator() {
    _calib.bias_x = 0;
    _calib.bias_y = 0;
    _calib.bias_z = 0;
    _calib.calibrated = false;
}

bool GyroCalibrator::calibrate(LSM6DSV& sensor) {
    int64_t sum_x = 0;
    int64_t sum_y = 0;
    int64_t sum_z = 0;

    int valid_samples = 0;
    lsm6dsv_raw_data_t sample;

    // Discard initial 50 samples while filter stabilizes
    for (int i = 0; i < 50; i++) {
        sensor.readRawMotion(&sample);
        delayMicroseconds(1040); // ~960 Hz sample period
    }

    // Collect CALIBRATION_SAMPLES
    for (int i = 0; i < CALIBRATION_SAMPLES; i++) {
        if (sensor.readRawMotion(&sample)) {
            sum_x += sample.gyro_x;
            sum_y += sample.gyro_y;
            sum_z += sample.gyro_z;
            valid_samples++;
        }
        delayMicroseconds(1040);
    }

    if (valid_samples > 0) {
        _calib.bias_x = (int32_t)(sum_x / valid_samples);
        _calib.bias_y = (int32_t)(sum_y / valid_samples);
        _calib.bias_z = (int32_t)(sum_z / valid_samples);
        _calib.calibrated = true;
        return true;
    }

    return false;
}

void GyroCalibrator::apply(lsm6dsv_raw_data_t* data) {
    if (!data || !_calib.calibrated) return;

    // Subtract zero-rate bias offset
    int32_t gx = data->gyro_x - _calib.bias_x;
    int32_t gy = data->gyro_y - _calib.bias_y;
    int32_t gz = data->gyro_z - _calib.bias_z;

    // Axis inversion according to physical mounting in config.h
    if (GYRO_AXIS_INVERT_X) gx = -gx;
    if (GYRO_AXIS_INVERT_Y) gy = -gy;
    if (GYRO_AXIS_INVERT_Z) gz = -gz;

    // Zero-velocity deadband (noise threshold)
    if (abs(gx) <= GYRO_DEADBAND_LSB) gx = 0;
    if (abs(gy) <= GYRO_DEADBAND_LSB) gy = 0;
    if (abs(gz) <= GYRO_DEADBAND_LSB) gz = 0;

    data->gyro_x = (int16_t)gx;
    data->gyro_y = (int16_t)gy;
    data->gyro_z = (int16_t)gz;
}
