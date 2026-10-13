/**
 * @file board_power.cpp
 * @brief Board power supply management implementation
 */

#include "board_power.h"
#include <nrf_gpio.h>

void board_power_init(void) {
    // Configure P0.13 as output with standard drive
    nrf_gpio_cfg_output(PIN_POWER_VCC_CUTOFF);

    // Drive HIGH to turn ON power to the switched VCC pin
    nrf_gpio_pin_set(PIN_POWER_VCC_CUTOFF);

    // Wait for the power supply capacitor to charge and IMU internal POR (Power-on Reset) to complete
    delay(POWER_ON_DELAY_MS);
}
