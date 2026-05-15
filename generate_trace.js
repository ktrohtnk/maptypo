const fs = require('fs');

// Mock browser objects for matcher.js
global.Math = Math;
global.console = console;

// Load matcher.js code (we just eval it since it sets RoadTracer on window)
global.window = {};
const matcherCode = fs.readFileSync('matcher.js', 'utf8');
eval(matcherCode);

const overpassData = JSON.parse(fs.readFileSync('fukuoka_yakuin.json', 'utf8'));

// Convert overpassData to "ways" format expected by matcher.js
// Actually, in app.js we do:
const elements = overpassData.ways.elements;
const nodes = {};
elements.forEach(el => {
  if (el.type === 'node') nodes[el.id] = [el.lat, el.lon];
});

const ways = [];
elements.forEach(el => {
  if (el.type === 'way' && el.nodes) {
    const coords = el.nodes.map(nid => nodes[nid]).filter(c => c);
    if (coords.length > 0) ways.push(coords);
  }
});

const traceResults = window.RoadTracer.traceText('ROAD\nTRACER', [33.5828, 130.3986], 40, ways, true);

// Clean up coordinates to exactly 4 decimal places to save space
const optimizedResults = traceResults.map(res => {
  return {
    paths: res.paths.map(path => {
      return path.map(p => [Number(p[0].toFixed(5)), Number(p[1].toFixed(5))]);
    })
  };
});

fs.writeFileSync('default_trace.js', `const DEFAULT_TRACE_RESULTS = ${JSON.stringify(optimizedResults)};\nconst DEFAULT_TRACE_CENTER = [33.5828, 130.3986];\n`);
console.log("Done generating default trace!");
