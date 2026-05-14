const fs = require('fs');

global.window = {};
global.global = global;

const matcherCode = fs.readFileSync('matcher.js', 'utf8');
eval(matcherCode);

const RoadTracer = global.RoadTracer;

async function run() {
  console.log("Geocoding...");
  const geoRes = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent('福岡市 薬院') + '&format=json&limit=1&countrycodes=jp');
  const geoJson = await geoRes.json();
  const lat = parseFloat(geoJson[0].lat);
  const lon = parseFloat(geoJson[0].lon);
  
  console.log("Fetching roads...", lat, lon);
  const dLat = 2000 / 111320;
  const dLon = 2000 / (111320 * Math.cos(lat * Math.PI / 180));
  
  const query = `[out:json][timeout:25];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${lat-dLat},${lon-dLon},${lat+dLat},${lon+dLon});out geom;`;
  
  const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
  const json = await res.json();
  const ways = (json.elements || []).map(el => (el.geometry || []).map(p => [p.lat, p.lon])).filter(w => w.length >= 2);
  
  console.log("Tracing...");
  // Medium scale = 500m
  const results = RoadTracer.traceText("ROAD\nTRACER", [lat, lon], 500, ways, false); // Normal style
  
  fs.writeFileSync('demo-data.js', 'const DEMO_DATA = ' + JSON.stringify(results) + ';\nconst DEMO_LOC = {lat: ' + lat + ', lon: ' + lon + '};');
  console.log("Done!");
}
run();
