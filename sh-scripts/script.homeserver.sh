#!/bin/bash

# Setup script for Orange Pi Zero 2W to install Bun and run the TV monitor server
# Copy this to the SD card (e.g., /home/user/setup.sh) and run after first boot

# Exit on any error
set -e

# Define variables
USER_HOME="/home/user"
BUN_DIR="$USER_HOME/.bun"
SERVER_DIR="$USER_HOME/tv-monitor"
SERVER_FILE="$SERVER_DIR/server.ts"

# Replace 'user' with the actual username you’ll set up on first boot
# If using root, change USER_HOME to "/root"

# Step 1: Update system and install dependencies
echo "Updating system and installing dependencies..."
sudo apt update
sudo apt install -y curl unzip

# Step 2: Install Bun
echo "Installing Bun..."
curl -fsSL https://bun.sh/install | bash
echo 'export PATH="$HOME/.bun/bin:$PATH"' >>"$USER_HOME/.bashrc"
source "$USER_HOME/.bashrc"

# Step 3: Create server directory and script
echo "Setting up server script..."
mkdir -p "$SERVER_DIR"
cat <<'EOF' >"$SERVER_FILE"
#!/usr/bin/env bun
export { }
const TV_IP: string = "192.168.1.222:8060";
const POLL_INTERVAL: number = 3000;
let powerON = false
while (true) {
  try {
    const response = await fetch(`http://${TV_IP}/query/active-app`);
    const text = await response.text();
    if (text.includes("tvinput.hdmi3")) {
      await Bun.spawn(["sh", "-c", 'curl "http://tasmota-208a6f-2671.lan/cm?cmnd=Power%20ON"']).exited;
      powerON = true;
    }
    if (!text.includes("tvinput.hdmi3") && powerON !== false) {
      await Bun.spawn(["sh", "-c", 'curl "http://tasmota-208a6f-2671.lan/cm?cmnd=Power%20OFF"']).exited;
      powerON = false;
    }
  } catch (error) {
    console.error("Error:", error);
  }
  await Bun.sleep(POLL_INTERVAL);
}
EOF
chmod +x "$SERVER_FILE"

# Step 4: Create systemd service
echo "Creating systemd service..."
sudo bash -c "cat << 'EOF' > /etc/systemd/system/tv-monitor.service
[Unit]
Description=TV Monitor Bun Script
After=network.target

[Service]
ExecStart=$BUN_DIR/bin/bun $SERVER_FILE
WorkingDirectory=$SERVER_DIR
Restart=always
User=user

[Install]
WantedBy=multi-user.target
EOF"

# Step 5: Enable and start the service
echo "Starting the server..."
sudo systemctl enable tv-monitor.service
sudo systemctl start tv-monitor.service

echo "Setup complete! Check status with: sudo systemctl status tv-monitor.service"
