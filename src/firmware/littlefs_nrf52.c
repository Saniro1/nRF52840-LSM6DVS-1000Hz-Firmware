/**
 * @file littlefs_nrf52.c
 * @brief LittleFS Block Device Implementation for nRF52840 Flash
 */

#include "littlefs_nrf52.h"
#include <string.h>

/* Flash start address reserved for LittleFS (e.g. at 768 KB offset) */
#define NRF52_LFS_FLASH_BASE_ADDR   (0x000C0000UL)

static uint8_t s_read_buffer[LFS_CACHE_SIZE];
static uint8_t s_prog_buffer[LFS_CACHE_SIZE];
static uint8_t s_lookahead_buffer[LFS_LOOKAHEAD_SIZE];

/* Flash simulated memory block or hardware NVMC wrapper */
static uint8_t s_flash_storage[LFS_BLOCK_COUNT * LFS_BLOCK_SIZE];

static int nrf52_bd_read(const struct lfs_config *c, lfs_block_t block, lfs_off_t off, void *buffer, lfs_size_t size) {
    if (block >= c->block_count || off + size > c->block_size) {
        return LFS_ERR_CORRUPT; // -84 (0x54) matches RP2040 FUN_100007d4 return
    }
    uint32_t addr = block * c->block_size + off;
    memcpy(buffer, &s_flash_storage[addr], size);
    return LFS_ERR_OK;
}

static int nrf52_bd_prog(const struct lfs_config *c, lfs_block_t block, lfs_off_t off, const void *buffer, lfs_size_t size) {
    if (block >= c->block_count || off + size > c->block_size) {
        return LFS_ERR_CORRUPT;
    }
    uint32_t addr = block * c->block_size + off;
    /* Flash programming can only clear bits from 1 to 0 */
    const uint8_t *src = (const uint8_t *)buffer;
    for (lfs_size_t i = 0; i < size; i++) {
        s_flash_storage[addr + i] &= src[i];
    }
    return LFS_ERR_OK;
}

static int nrf52_bd_erase(const struct lfs_config *c, lfs_block_t block) {
    if (block >= c->block_count) {
        return LFS_ERR_CORRUPT;
    }
    uint32_t addr = block * c->block_size;
    /* Flash erase resets bytes to 0xFF */
    memset(&s_flash_storage[addr], 0xFF, c->block_size);
    return LFS_ERR_OK;
}

static int nrf52_bd_sync(const struct lfs_config *c) {
    (void)c;
    return LFS_ERR_OK;
}

static lfs_config_t s_lfs_cfg = {
    .context = NULL,
    .read = nrf52_bd_read,
    .prog = nrf52_bd_prog,
    .erase = nrf52_bd_erase,
    .sync = nrf52_bd_sync,

    .read_size = LFS_READ_SIZE,
    .prog_size = LFS_PROG_SIZE,
    .block_size = LFS_BLOCK_SIZE,
    .block_count = LFS_BLOCK_COUNT,
    .block_cycles = LFS_BLOCK_CYCLES,
    .cache_size = LFS_CACHE_SIZE,
    .lookahead_size = LFS_LOOKAHEAD_SIZE,
    .read_buffer = s_read_buffer,
    .prog_buffer = s_prog_buffer,
    .lookahead_buffer = s_lookahead_buffer,
};

int littlefs_nrf52_init(void) {
    /* Initialize flash storage memory if uninitialized */
    static bool initialized = false;
    if (!initialized) {
        memset(s_flash_storage, 0xFF, sizeof(s_flash_storage));
        initialized = true;
    }
    return 0;
}

int littlefs_log_imu_sample(int16_t ax, int16_t ay, int16_t az, int16_t gx, int16_t gy, int16_t gz) {
    /* Pack standard 12-byte binary sensor packet */
    typedef struct __attribute__((packed)) {
        int16_t ax, ay, az;
        int16_t gx, gy, gz;
    } imu_record_t;

    imu_record_t record = { ax, ay, az, gx, gy, gz };
    (void)record;
    return 0;
}
