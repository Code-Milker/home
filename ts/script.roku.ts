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
  }
  await Bun.sleep(POLL_INTERVAL); // Separate async delay
}
