# Installation

Use a **Raspberry Pi 5** running Raspberry Pi OS Lite **64-bit (Trixie)**, with **Node.js 24** and Node-RED installed as a normal Linux user. Run the commands below as the user that runs Node-RED. The commands assume its user directory is `~/.node-red` and its service is `nodered`.

1. Enable **SPI** in `sudo raspi-config` > Interface Options > SPI for an MCP3008. Enable I2C instead if using an Adafruit STEMMA soil sensor.

2. Install the build prerequisites:

   ```bash
   sudo apt update
   sudo apt install -y git python3 build-essential libgpiod-dev pkg-config raspi-utils
   ```

3. Download the package source from GitHub:

   ```bash
   git clone --branch v0.5.0 https://github.com/Anon772000/node-red-contrib-pi5-servo-hardware.git
   cd node-red-contrib-pi5-servo-hardware
   plugin_dir="$(pwd)"
   ```

   Alternatively, download `node-red-contrib-pi5-servo-hardware-0.5.0.tgz` from the [v0.5.0 release](https://github.com/Anon772000/node-red-contrib-pi5-servo-hardware/releases/tag/v0.5.0), extract it with `tar -xzf node-red-contrib-pi5-servo-hardware-0.5.0.tgz`, enter the extracted `package` directory and set `plugin_dir="$(pwd)"` there.

4. Install the PWM helper and boot service:

   ```bash
   sudo bash tools/install-pwm.sh "$(id -un)"
   ```

   This grants GPIO/SPI/I2C access and installs the root-owned PWM helper, a restricted sudo rule and the `pi5-servo-pwm` service. Its initial configuration is GPIO18 (physical pin 12), 50 Hz and a 1 ms closed-position pulse.

5. Build and install the palette package:

   ```bash
   npm pack
   mkdir -p ~/.node-red
   cd ~/.node-red
   npm_config_use_libgpiod=true npm install "$plugin_dir/node-red-contrib-pi5-servo-hardware-0.5.0.tgz"
   sudo reboot
   ```

6. Open `http://YOUR_PI_HOSTNAME:1880` and refresh the editor. The Raspberry Pi palette includes **Pi 5 Servo PWM**, **Apply Site settings**, **Valve GPIO**, **DHT sensor**, **Saved hub thresholds**, **Heltec USB soil**, **Adafruit STEMMA I2C soil** and **XC4604 / MCP3008 soil**.

7. Check the installation:

   ```bash
   systemctl status pi5-servo-pwm nodered --no-pager
   ls -l /dev/spidev0.0
   ```

   The SPI device should exist and the Node-RED user needs the `spi` group. Reboot after installation to apply group membership. For a custom service name or user directory, substitute your actual service/directory in these commands.
