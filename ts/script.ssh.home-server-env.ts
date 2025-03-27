#!/usr/bin/env bun

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

// Configuration
const PASSWORD = process.env.REMOTE_PASSWORD || "6087";
const selectedDevice = { ip: "192.168.1.45", hostname: "home.lan" };
const SERVICES_TO_RESTART = ["home-server", "NetworkManager"]; // Services to restart
const REBOOT_AFTER_SYNC = false; // Set to true to reboot the server after syncing

// Paths
const orangepiDir = join(process.cwd(), "image-config", selectedDevice.hostname);

// Verify local directory exists
if (!existsSync(orangepiDir)) {
  console.error(`Local directory ${orangepiDir} not found!`);
  process.exit(1);
}

// Check if the device is reachable
try {
  execSync(`ping -c 1 ${selectedDevice.ip}`, { stdio: "ignore" });
} catch {
  console.error(`Cannot reach ${selectedDevice.ip}. Check the IP or network connection.`);
  process.exit(1);
}

// Sync files to /root/ on the remote device using tar (since it worked)
try {
  console.log(`Syncing ${orangepiDir} to /root/ on ${selectedDevice.ip}...`);
  const tarCmd = `tar -C ${orangepiDir} -cvf - . | sshpass -p '${PASSWORD}' ssh root@${selectedDevice.ip} "tar -C /root/ -xvf -"`;
  execSync(tarCmd, { stdio: "inherit" });
  console.log("Files successfully synced to /root/!");
} catch (error) {
  console.error("Sync failed:", error);
  process.exit(1);
}

// Restart specified services
for (const service of SERVICES_TO_RESTART) {
  try {
    console.log(`Restarting ${service}...`);
    execSync(
      `sshpass -p '${PASSWORD}' ssh root@${selectedDevice.ip} "systemctl restart ${service}"`,
      { stdio: "inherit" }
    );
    console.log(`${service} restarted successfully!`);
  } catch (error) {
    console.error(`Failed to restart ${service}:`, error.message);
  }
}

// Reboot the server if specified
if (REBOOT_AFTER_SYNC) {
  console.log("Rebooting the server...");
  try {
    execSync(
      `sshpass -p '${PASSWORD}' ssh root@${selectedDevice.ip} "reboot"`,
      { stdio: "inherit" }
    );
    console.log("Reboot command sent successfully.");
  } catch (error) {
    console.error("Failed to reboot:", error.message);
  }
}

console.log("Script completed.");
