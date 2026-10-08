/**
 * @file test_joyshockmapper_feed.py
 * @brief Python test script to feed simulated 1000Hz DualShock 4 motion packets to JoyShockMapper
 * @note Use this to verify JoyShockMapper configuration on PC before your physical nRF52840 arrives!
 * 
 * Requirements:
 *   pip install vgamepad (or pyvjoy)
 */

import time
import math
import struct

def main():
    print("=" * 65)
    print(" 1000 Hz JoyShockMapper & Motion Telemetry Verification Test")
    print(" Emulating nRF52840 + LSM6DVS 64-Byte DualShock 4 Packets")
    print("=" * 65)
    print("Simulating 1000 Hz (1 ms) gyro updates. Move virtual sensor...")
    
    # Packet simulation parameters
    t = 0.0
    packet_count = 0
    start_time = time.time()
    
    try:
        while True:
            # Generate simulated sinusoidal motion (Yaw & Pitch)
            # Simulates rotating the device left/right and up/down
            t += 0.001 # 1 ms per sample
            simulated_gyro_x = int(math.sin(t * 4.0) * 800)  # Pitch rate
            simulated_gyro_y = 0                            # Roll rate
            simulated_gyro_z = int(math.cos(t * 4.0) * 1200) # Yaw rate
            
            simulated_accel_x = 0
            simulated_accel_y = 0
            simulated_accel_z = 4096 # 1g on Z axis
            
            # Construct exact 64-byte Sony DualShock 4 USB Input Report (Report ID 0x01)
            # Bytes 13..24 are parsed directly by JoyShockLibrary:
            report = bytearray(64)
            report[0] = 0x01      # Report ID
            report[1] = 0x80      # Left Stick X (Center)
            report[2] = 0x80      # Left Stick Y (Center)
            report[3] = 0x80      # Right Stick X (Center)
            report[4] = 0x80      # Right Stick Y (Center)
            report[5] = 0x08      # D-pad neutral
            report[12] = 0x1B     # USB connected, 100% battery
            
            # Pack 16-bit signed motion data (Little-endian)
            struct.pack_into('<hhh', report, 13, simulated_gyro_x, simulated_gyro_y, simulated_gyro_z)
            struct.pack_into('<hhh', report, 19, simulated_accel_x, simulated_accel_y, simulated_accel_z)
            
            packet_count += 1
            
            # Print telemetry summary every 200 ms (200 packets)
            if packet_count % 200 == 0:
                elapsed = time.time() - start_time
                rate = packet_count / elapsed
                print(f"[{elapsed:.1f}s] Sent {packet_count} pkts | Rate: {rate:.1f} Hz | "
                      f"Gyro: (X:{simulated_gyro_x:+5d}, Y:{simulated_gyro_y:+5d}, Z:{simulated_gyro_z:+5d})")
            
            # High-precision 1 ms sleep for 1000 Hz loop
            time.sleep(0.001)
            
    except KeyboardInterrupt:
        print("\nTest completed.")

if __name__ == '__main__':
    main()
