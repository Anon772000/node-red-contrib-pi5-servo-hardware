#!/usr/bin/env bash
set -euo pipefail

if [[ $EUID -ne 0 || $# -ne 1 ]]; then
  echo "Usage: sudo bash tools/install-pwm.sh NODE_RED_USER" >&2
  exit 1
fi
node_red_user="$1"
if [[ ! "$node_red_user" =~ ^[a-z_][a-z0-9_.-]*\$?$ ]] || [[ "$node_red_user" == root ]]; then
  echo "Supply the non-root Linux user that runs Node-RED." >&2
  exit 1
fi
id "$node_red_user" >/dev/null
if [[ ! -r /proc/device-tree/model ]] || ! grep -aq 'Raspberry Pi 5' /proc/device-tree/model; then
  echo "This PWM setup requires a Raspberry Pi 5." >&2
  exit 1
fi
[[ -x /usr/bin/node ]] || { echo "Install Node.js first." >&2; exit 1; }
for command_name in pinctrl dtoverlay visudo getent systemctl; do
  command -v "$command_name" >/dev/null || { echo "Missing prerequisite: $command_name" >&2; exit 1; }
done
tools_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
for group_name in gpio dialout; do
  getent group "$group_name" >/dev/null || groupadd --system "$group_name"
done
usermod -aG gpio,dialout "$node_red_user"
install -o root -g root -m 0755 "$tools_dir/pi5-servo-pwm-setup.cjs" /usr/local/lib/pi5-servo-pwm-setup.cjs
install -o root -g root -m 0644 "$tools_dir/pi5-servo-pwm.service" /etc/systemd/system/pi5-servo-pwm.service

# Grant only this root-owned helper's validated pin/position configuration command.
sudoers_tmp="$(mktemp)"
trap 'rm -f -- "$sudoers_tmp"' EXIT
printf '%s ALL=(root) NOPASSWD: /usr/bin/node /usr/local/lib/pi5-servo-pwm-setup.cjs configure *\n' "$node_red_user" > "$sudoers_tmp"
chmod 0600 "$sudoers_tmp"
visudo -cf "$sudoers_tmp"
install -o root -g root -m 0440 "$sudoers_tmp" /etc/sudoers.d/pi5-servo-pwm
systemctl daemon-reload
systemctl enable --now pi5-servo-pwm.service
echo "PWM setup installed. Reboot before starting Node-RED with this plugin."
