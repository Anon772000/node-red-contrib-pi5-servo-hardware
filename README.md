# Installation

Use a **Raspberry Pi 5** running Raspberry Pi OS Lite 64-bit (Trixie), with Node.js 24 and Node-RED installed. Run these commands as the Linux user that runs Node-RED, not as root. They assume Node-RED uses `~/.node-red` and the `nodered` systemd service.

1. Install the prerequisites:

   ```bash
   sudo apt update
   sudo apt install -y git python3 build-essential libgpiod-dev pkg-config raspi-utils
   ```

2. Download the plugin and create the package:

   ```bash
   git clone https://github.com/Anon772000/node-red-contrib-pi5-servo-hardware.git
   cd node-red-contrib-pi5-servo-hardware
   plugin_dir="$(pwd)"
   npm pack
   ```

3. Install the PWM setup helper and boot service:

   ```bash
   sudo bash tools/install-pwm.sh "$(id -un)"
   ```

   This sets up GPIO18 (physical pin 12) at 50 Hz, initially using a 1 ms servo pulse.

4. Install the palette package into Node-RED:

   ```bash
   mkdir -p ~/.node-red
   cd ~/.node-red
   npm_config_use_libgpiod=true npm install "$plugin_dir/node-red-contrib-pi5-servo-hardware-0.3.1.tgz"
   ```

   For a custom Node-RED user directory, use that directory instead of `~/.node-red`.

5. Reboot to apply GPIO group membership and start the PWM service:

   ```bash
   sudo reboot
   ```

6. Refresh the Node-RED editor. The **Raspberry Pi** palette category should include **Pi 5 Servo PWM**, **Apply Site settings**, **Valve GPIO**, **DHT sensor**, **Heltec USB soil**, and **Saved hub thresholds**.

   To check the PWM service:

   ```bash
   systemctl status pi5-servo-pwm --no-pager
   ```
