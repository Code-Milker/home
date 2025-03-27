see devices on network: nmap -sn 192.168.1.0/24


tasmota plug: 
curl "http://tasmota-208a6f-2671.lan/cm?cmnd=Power%20ON"
curl "http://tasmota-208a6f-2671.lan/cm?cmnd=Power%20OFF"
curl "http://tasmota-208a6f-2671.lan/cm?cmnd=Power%20TOGGLE"


roku tv: 
curl -v -d '' http://192.168.1.222:8060/keypress/VolumeUp
curl -v -d '' http://192.168.1.222:8060/input/tvinput.hdmi3
curl -d '' http://192.168.1.222:8060/keypress/VolumeDown
curl -d '' http://192.168.1.222:8060/keypress/VolumeMute

// netflix
curl -d '' http://192.168.1.222:8060/launch/12 

curl -d '' http://192.168.1.222:8060/keypress/Power

hatch rest
ping 192.168.1.189


curl http://192.168.1.222:8060/query/active-app
res: <?xml version="1.0" encoding="UTF-8" ?>
<active-app>
        <app id="tvinput.hdmi4" type="tvin" version="1.0.0" ui-location="tvinput.hdmi4">Nintendo Switch</app>
</active-app>

