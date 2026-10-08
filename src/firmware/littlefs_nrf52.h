/**
 * @file littlefs_nrf52.h
 * @brief LittleFS v2 Block Device Configuration & Port for nRF52840
 * @note Directly implements the LittleFS config structure corresponding to
 *       the reverse-engineered routines FUN_100007d4 (lfs_bd_read) and FUN_10000a5c (lfs_dir_traverse).
 */

#ifndef LITTLEFS_NRF52_H_
#define LITTLEFS_NRF52_H_

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Standard LittleFS Block Device Geometry for nRF52840 Flash */
#define LFS_READ_SIZE           (4)         /* 4-byte word read */
#define LFS_PROG_SIZE           (4)         /* 4-byte word program */
#define LFS_BLOCK_SIZE          (4096)      /* 4 KB sector size on nRF52 flash */
#define LFS_BLOCK_COUNT         (64)        /* 256 KB reserved filesystem area */
#define LFS_CACHE_SIZE          (64)        /* Lookahead & read cache */
#define LFS_LOOKAHEAD_SIZE      (16)
#define LFS_BLOCK_CYCLES        (500)       /* Wear leveling cycle count */

/* LittleFS Error Codes (matching -0x54 / -84 from FUN_100007d4) */
#define LFS_ERR_OK              (0)
#define LFS_ERR_IO              (-5)
#define LFS_ERR_CORRUPT         (-84)       /* -0x54 */
#define LFS_ERR_NOENT           (-2)
#define LFS_ERR_EXIST           (-17)
#define LFS_ERR_NOTDIR          (-20)
#define LFS_ERR_ISDIR           (-21)
#define LFS_ERR_NOTEMPTY        (-39)
#define LFS_ERR_BADF            (-9)
#define LFS_ERR_FBIG            (-27)
#define LFS_ERR_INVAL           (-22)
#define LFS_ERR_NOSPC           (-28)
#define LFS_ERR_NOMEM           (-12)

typedef uint32_t lfs_size_t;
typedef uint32_t lfs_off_t;
typedef uint32_t lfs_block_t;

struct lfs_config;

typedef struct lfs_config {
    void *context;
    int (*read)(const struct lfs_config *c, lfs_block_t block, lfs_off_t off, void *buffer, lfs_size_t size);
    int (*prog)(const struct lfs_config *c, lfs_block_t block, lfs_off_t off, const void *buffer, lfs_size_t size);
    int (*erase)(const struct lfs_config *c, lfs_block_t block);
    int (*sync)(const struct lfs_config *c);

    lfs_size_t read_size;
    lfs_size_t prog_size;
    lfs_size_t block_size;
    lfs_size_t block_count;
    int32_t block_cycles;
    lfs_size_t cache_size;
    lfs_size_t lookahead_size;
    void *read_buffer;
    void *prog_buffer;
    void *lookahead_buffer;
} lfs_config_t;

/**
 * @brief Initialize LittleFS on nRF52840 flash storage.
 */
int littlefs_nrf52_init(void);

/**
 * @brief Append an IMU sample to a binary or CSV log file on LittleFS.
 */
int littlefs_log_imu_sample(int16_t ax, int16_t ay, int16_t az, int16_t gx, int16_t gy, int16_t gz);

#ifdef __cplusplus
}
#endif

#endif /* LITTLEFS_NRF52_H_ */
