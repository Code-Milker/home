#!/usr/bin/env bun
import { createInterface } from "readline/promises";
import { execSync, spawn } from "child_process";
import { networkInterfaces } from "os";

const PASSWORD = '6087';

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
  return null;
}

async function scanDevices(): Promise<Array<{ ip: string; hostname: string }>> {
  const subnet = getLocalSubnet();
  if (!subnet) return [];

  const nmap = spawn("nmap", ["-p", "22", "--open", "-sV", subnet, "-oG", "-"], {
    stdio: ["ignore", "pipe", "inherit"],
  });

  let output = "";
  for await (const chunk of nmap.stdout!) output += chunk;
  await new Promise((resolve) => nmap.on("close", resolve));

  const devices = new Map<string, string>();
  output.split("\n").forEach(line => {
    const match = line.match(/Host: (\d+\.\d+\.\d+\.\d+)\s+\(([^)]*)\)/);
    if (match) devices.set(match[1], match[2] || "unknown");
  });

  return Array.from(devices).map(([ip, hostname]) => ({ ip, hostname }));
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let devices: Array<{ ip: string; hostname: string }> = [];

  while (true) {
    if (devices.length === 0) {
      console.log("\nScanning network...");
      devices = await scanDevices();
    }

    console.log("\n=== Devices ===");
    devices.forEach((d, i) => console.log(` ${i + 1}: ${d.ip.padEnd(15)} (${d.hostname})`));
    console.log("===============");
    console.log(` ${devices.length + 1}: Rescan network`);
    console.log(` ${devices.length + 2}: Exit`);

    const answer = await rl.question(`Select option [1-${devices.length + 2}]: `);
    const choice = parseInt(answer);

    if (choice === devices.length + 1) {
      devices = [];
      continue;
    }
    if (choice === devices.length + 2) {
      console.log("Exiting...");
      break;
    }
    if (isNaN(choice) || choice < 1 || choice > devices.length) {
      console.log("Invalid selection.");
      continue;
    }

    const selected = devices[choice - 1];
    console.log(`\nSelected device: ${selected.hostname} (${selected.ip})`);

    if ((await rl.question("Set hostname? (y/N): ")).toLowerCase() === 'y') {
      const newHostname = await rl.question("Enter new hostname: ");

      try {
        const commands = [
          `hostnamectl set-hostname '${newHostname}'`,
          `echo '${newHostname}' > /etc/hostname`,
          // Fixed tab character handling with sed -E
          `sed -i -E "s/127.0.1.1.*/127.0.1.1\\\\t${newHostname}/g" /etc/hosts`,
          `command -v avahi-daemon >/dev/null 2>&1 && systemctl restart avahi-daemon || true`,
          `{ command -v dhclient >/dev/null 2>&1 && dhclient -r >/dev/null 2>&1 && dhclient >/dev/null 2>&1; } || ` +
          `{ command -v dhcpcd >/dev/null 2>&1 && dhcpcd -k >/dev/null 2>&1 && dhcpcd >/dev/null 2>&1; } || true`,
          `resolvectl flush-caches >/dev/null 2>&1 || true`
        ].join('; ');

        execSync(
          `sshpass -p '${PASSWORD}' ssh -q ` +
          `-o StrictHostKeyChecking=no ` +
          `-o UserKnownHostsFile=/dev/null ` +
          `root@${selected.ip} "${commands}"`,
          { stdio: "inherit" }
        );

        execSync(`sudo killall -HUP mDNSResponder 2>/dev/null || true`);
        console.log("\nHostname updated successfully!");
      } catch (error) {
        console.log("\nHostname configuration completed with minor warnings");
      }
    }

    console.log("\nConnecting to device...");
    execSync(
      `sshpass -p '${PASSWORD}' ssh -q ` +
      `-o StrictHostKeyChecking=no ` +
      `root@${selected.ip}`,
      { stdio: "inherit" }
    );
    break;
  }

  rl.close();
}

try {
  execSync("which nmap sshpass >/dev/null 2>&1");
  main().catch(console.error);
} catch {
  console.log("Missing requirements. Install with:");
  console.log("brew install nmap sshpass");
  process.exit(1);
}
