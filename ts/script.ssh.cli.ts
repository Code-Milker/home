#!/usr/bin/env bun

import { createInterface } from "readline/promises";
import { execSync, spawn } from "child_process";
import { networkInterfaces } from "os";
import { readdirSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Hardcoded password (replace with a secure method in production)
const PASSWORD = "6087"; // Default is often 1234, adjust as needed

// Path to the cached devices file
const DEVICES_FILE = "./devices.json";

// **Check disk space on the remote device**
function checkRemoteDiskSpace(ip: string, dir: string): boolean {
  try {
    const output = execSync(`sshpass -p '${PASSWORD}' ssh root@${ip} "df -k ${dir} | tail -1"`).toString();
    const [, , , available] = output.trim().split(/\s+/);
    const availableKB = parseInt(available, 10);
    if (availableKB < 51200) { // Require ~50MB free
      console.error(`Insufficient space in ${dir}. Available: ${availableKB} KB, required: 51200 KB`);
      return false;
    }
    return true;
  } catch (error) {
    console.error("Disk space check failed:", error.message);
    return false;
  }
}

// **Scan devices using nmap**
async function scanDevices(): Promise<Array<{ ip: string; hostname: string }>> {
  const subnet = getLocalSubnet();
  if (!subnet) {
    console.error("Could not determine local subnet!");
    return [];
  }

  console.log(`Scanning subnet ${subnet} with nmap...`);
  const nmap = spawn("nmap", ["-p", "22", "--open", "-sV", subnet, "-oG", "-"], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  let output = "";
  for await (const chunk of nmap.stdout!) output += chunk;
  await new Promise((resolve) => nmap.on("close", resolve));

  const devices = new Map<string, string>();
  output.split("\n").forEach((line) => {
    const match = line.match(/Host: (\d+\.\d+\.\d+\.\d+)\s+\(([^)]*)\)/);
    if (match) devices.set(match[1], match[2] || "unknown");
  });

  const deviceList = Array.from(devices).map(([ip, hostname]) => ({ ip, hostname }));
  try {
    writeFileSync(DEVICES_FILE, JSON.stringify(deviceList, null, 2), "utf-8");
    console.log(`Devices saved to ${DEVICES_FILE}`);
  } catch (error) {
    console.error("Failed to save devices:", error.message);
  }
  return deviceList;
}

// **Load cached devices**
function loadDevicesFromFile(): Array<{ ip: string; hostname: string }> | null {
  if (!existsSync(DEVICES_FILE)) return null;
  try {
    const data = readFileSync(DEVICES_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Failed to load devices:", error.message);
    return null;
  }
}

// **Find available scripts**
function findScripts(): string[] {
  return readdirSync(process.cwd())
    .filter((file) => file.startsWith("script.ssh") && file.endsWith(".ts"))
    .sort();
}

// **Get local subnet for nmap**
function getLocalSubnet(): string | null {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === "IPv4" && !net.internal) {
        const ipParts = net.address.split(".");
        ipParts.pop();
        return `${ipParts.join(".")}.0/24`;
      }
    }
  }
  console.error("No valid network interface found!");
  return null;
}

// **Main execution logic**
async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // ### Device Selection with nmap
  let devices: Array<{ ip: string; hostname: string }>;
  let deviceChoice: string;
  const cachedDevices = loadDevicesFromFile();

  if (cachedDevices && cachedDevices.length > 0) {
    console.log("\n=== Cached Devices ===");
    devices = cachedDevices;
    devices.forEach((d, i) => console.log(` ${i + 1}: ${d.ip.padEnd(15)} (${d.hostname})`));
    console.log(` ${devices.length + 1}: Refresh with nmap`);
    deviceChoice = await rl.question(`Select device [1-${devices.length + 1}]: `);
    const choiceIndex = parseInt(deviceChoice) - 1;

    if (choiceIndex === devices.length) {
      console.log("Refreshing device list with nmap...");
      devices = await scanDevices();
      if (devices.length === 0) {
        console.error("No devices found after scan!");
        process.exit(1);
      }
      console.log("\n=== Refreshed Devices ===");
      devices.forEach((d, i) => console.log(` ${i + 1}: ${d.ip.padEnd(15)} (${d.hostname})`));
      deviceChoice = await rl.question(`Select device [1-${devices.length}]: `);
    }
  } else {
    console.log("No cached devices, scanning with nmap...");
    devices = await scanDevices();
    if (devices.length === 0) {
      console.error("No devices found!");
      process.exit(1);
    }
    console.log("\n=== Scanned Devices ===");
    devices.forEach((d, i) => console.log(` ${i + 1}: ${d.ip.padEnd(15)} (${d.hostname})`));
    deviceChoice = await rl.question(`Select device [1-${devices.length}]: `);
  }

  const selectedDeviceIndex = parseInt(deviceChoice) - 1;
  if (isNaN(selectedDeviceIndex) || selectedDeviceIndex < 0 || selectedDeviceIndex >= devices.length) {
    console.error("Invalid device selection!");
    process.exit(1);
  }
  const selectedDevice = devices[selectedDeviceIndex];

  // ### Script Selection
  const scripts = findScripts();
  if (scripts.length === 0) {
    console.error("No scripts found with prefix 'script.ssh' and suffix '.ts'!");
    process.exit(1);
  }
  console.log("\n=== Available Scripts ===");
  scripts.forEach((s, i) => console.log(` ${i + 1}: ${s}`));
  const scriptChoices = await rl.question(`Select scripts (e.g., 1 or 1,2) [1-${scripts.length}]: `);
  const selectedIndices = scriptChoices
    .split(",")
    .map((n) => parseInt(n.trim()) - 1)
    .filter((n) => n >= 0 && n < scripts.length);
  const selectedScripts = selectedIndices.map((i) => scripts[i]);
  if (selectedScripts.length === 0) {
    console.error("No valid scripts selected!");
    process.exit(1);
  }

  // ### Clear /tmp on Remote Device
  console.log("\nClearing /tmp on remote device...");
  try {
    execSync(`sshpass -p '${PASSWORD}' ssh root@${selectedDevice.ip} "find /tmp -mindepth 1 -delete"`, { stdio: "inherit" });
  } catch (error) {
    console.error("Failed to clear /tmp:", error.message);
    process.exit(1);
  }

  // ### Check Disk Space
  if (!checkRemoteDiskSpace(selectedDevice.ip, "/tmp") || !checkRemoteDiskSpace(selectedDevice.ip, "/")) {
    console.error("Insufficient disk space on remote device!");
    process.exit(1);
  }


  try {
    // Execute scripts
    console.log("\nExecuting scripts...");
    for (const script of selectedScripts) {
      console.log(`Running ${script}...`);
    }
  } catch {

    rl.close();
  }
}

// **Run the script**
try {
  execSync("which nmap sshpass >/dev/null 2>&1");
  main().catch((error) => console.error("Error:", error));
} catch {
  console.error("Missing dependencies. Install with:\nbrew install nmap sshpass");
  process.exit(1);
}
