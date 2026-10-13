/**
 * @file board_power.h
 * @brief Board power supply management for SuperMini nRF52840 / Smol Slime
 */

#ifndef BOARD_POWER_H_
#define BOARD_POWER_H_

#include <Arduino.h>
#include "config.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * @brief Initialize power circuitry on the board.
 * Drives P0.13 HIGH to provide power to the switched 3.3V/VCC pin powering the LSM6DSV,
 * then pauses for POWER_ON_DELAY_MS to allow the power rail and IMU power-on-reset to stabilize.
 */
void board_power_init(void);

#ifdef __cplusplus
}
#endif

#endif // BOARD_POWER_H_
