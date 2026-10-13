/**
 * @file calib.h
 * @brief Startup Zero-Rate Gyroscope Bias Calibration and Filtering
 */

#ifndef CALIB_H_
#define CALIB_H_

#include <stdint.h>
#include <stdbool.h>
#include "lsm6dsv.h"

typedef struct {
    int32_t bias_x;
    int32_t bias_y;
    int32_t bias_z;
    bool calibrated;
} gyro_calibration_t;

class GyroCalibrator {
public:
    GyroCalibrator();
    bool calibrate(LSM6DSV& sensor);
    void apply(lsm6dsv_raw_data_t* data);
    bool isCalibrated() const { return _calib.calibrated; }

private:
    gyro_calibration_t _calib;
};

extern GyroCalibrator calibrator;

#endif // CALIB_H_
