#!/usr/bin/env bun
import { createInterface } from "readline/promises";
import { z } from "zod";

// Script to flash Armbian image to a microSD card and validate the partition layout at the end

// Path to your pre-downloaded Armbian image
const EXTRACTED_PATH = "./images/Armbian_community_25.5.0-trunk.256_Orangepizero2w_noble_current_6.6.75_gnome_desktop.img";

// Zod schemas for input validation
const DiskSelectionSchema = z
  .string()
  .transform(val => parseInt(val, 10))
  .refine(val => !isNaN(val), { message: "Selection must be a number" })
  .refine(val => val > 0, { message: "Selection must be a positive number" });

const DiskIndexSchema = z
  .number()
  .int()
  .min(0, { message: "Index must be non-negative" });

// Step 1: List available removable disks
console.log("Listing available disks...");
const diskutilListSpawn = Bun.spawn(["diskutil", "list"], { stdout: "pipe" });
const diskutilOutput = await new Response(diskutilListSpawn.stdout).text();
await diskutilListSpawn.exited;
const diskLines = diskutilOutput.split("\n");

// Filter for physical disks (external or internal)
const allDisks = diskLines
  .filter(line => line.includes("(external, physical)") || line.includes("(internal, physical)"))
  .map(line => {
    const match = line.match(/(\/dev\/disk\d+)/);
    return match ? match[1] : null;
  })
  .filter(disk => disk !== null) as string[];

// Filter for removable disks under 128 GB
const disks: string[] = [];
const SIZE_THRESHOLD = 128 * 1024 * 1024 * 1024; // 128 GB in bytes

for (const disk of allDisks) {
  const diskInfoSpawn = Bun.spawn(["diskutil", "info", disk], { stdout: "pipe" });
  const diskInfoOutput = await new Response(diskInfoSpawn.stdout).text();
  await diskInfoSpawn.exited;

  const isRemovable = diskInfoOutput.includes("Removable Media:           Yes") ||
    diskInfoOutput.includes("Removable Media:           Removable");
  const sizeMatch = diskInfoOutput.match(/Disk Size:.*\(([\d.]+) Bytes\)/);
  const sizeBytes = sizeMatch ? parseFloat(sizeMatch[1]) : Infinity;

  if (isRemovable && sizeBytes <= SIZE_THRESHOLD) {
    disks.push(disk);
  }
}

if (disks.length === 0) {
  throw new Error("No removable disks found under 128 GB. Insert a microSD card and try again.");
}

// Step 2: Let you pick a disk
console.log("Available removable disks:");
disks.forEach((disk, index) => {
  console.log(`${index + 1}: ${disk}`);
});

const rl = createInterface({ input: process.stdin, output: process.stdout });
const userInput = await rl.question("Select a disk by number (e.g., 1): ");
rl.close();

const selectedNumber = DiskSelectionSchema.parse(userInput);
const selectedIndex = selectedNumber - 1;

DiskIndexSchema.parse(selectedIndex);
if (selectedIndex >= disks.length) {
  throw new Error("Invalid selection: Number out of range.");
}

const DISK = disks[selectedIndex];
const RAW_DISK = DISK.replace("disk", "rdisk"); // Raw disk for faster flashing
console.log(`Selected disk: ${DISK}`);

// Step 3: Unmount the disk
console.log(`Unmounting ${DISK}...`);
const unmountProcess = await Bun.spawn(["diskutil", "unmountDisk", DISK]).exited;
if (unmountProcess !== 0) {
  throw new Error(`Failed to unmount ${DISK}.`);
}

// Step 4: Flash the image
console.log(`Flashing image to ${RAW_DISK}...`);
console.log("Run this script with 'sudo bun flash_armbian.ts' to avoid password prompts.");
const flashProcess = Bun.spawn(["sudo", "dd", `if=${EXTRACTED_PATH}`, `of=${RAW_DISK}`, "bs=1m", "status=progress"], {
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
});
const flashExitCode = await flashProcess.exited;
if (flashExitCode !== 0) {
  throw new Error(`Flashing failed with exit code ${flashExitCode}.`);
}
console.log("Flashing done.");

// Step 5: Validate the fucking partition layout
console.log("Checking if the partition layout is what it’s supposed to be...");
const validateProcess = Bun.spawn(["diskutil", "list", DISK], { stdout: "pipe" });
const validateOutput = await new Response(validateProcess.stdout).text();
await validateProcess.exited;

const validateLines = validateOutput.split("\n");
let linuxPartitionCount = 0;
let freeSpaceFound = false;

for (const line of validateLines) {
  if (line.includes("Linux")) {
    linuxPartitionCount++;
  } else if (line.includes("(free space)")) {
    freeSpaceFound = true;
  }
}

if (linuxPartitionCount === 1 && freeSpaceFound) {
  console.log("Partition layout is good: 1 Linux partition and free space found, just like it should be.");
} else {
  console.error("Partition layout is fucked up.");
  console.error("What it should be: 1 Linux partition and some free space.");
  console.error("What it actually is:");
  console.error(validateOutput);
  throw new Error("Partition layout doesn’t match what it’s supposed to be.");
}

// Step 6: Eject the disk
console.log(`Ejecting ${DISK}...`);
const ejectProcess = await Bun.spawn(["diskutil", "eject", DISK]).exited;
if (ejectProcess !== 0) {
  throw new Error(`Failed to eject ${DISK}.`);
}

console.log("Done. MicroSD card is flashed and validated. Stick it in your Orange Pi and boot it up.");
