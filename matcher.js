/**
 * tracer.js (formerly matcher.js) — Generative Road Tracing Engine
 * Walks the OpenStreetMap road graph to draw letters.
 */
(function(global) {
'use strict';

// ─── Vector Templates (0.0 to 1.0) ──────────────────────────────────────────
// Sequences of strokes. Each stroke is an array of [x, y] points.
// Order of strokes = Writing order.
const TEMPLATES = {
  'A': [[[0.5,0.0], [0.1,1.0]], [[0.5,0.0], [0.9,1.0]], [[0.25,0.6], [0.75,0.6]]],
  'B': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.7,0.0], [0.9,0.25], [0.9,0.4], [0.7,0.5], [0.2,0.5]], [[0.2,0.5], [0.8,0.5], [1.0,0.75], [1.0,0.9], [0.8,1.0], [0.2,1.0]]],
  'C': [[[0.9,0.2], [0.5,0.0], [0.1,0.2], [0.1,0.8], [0.5,1.0], [0.9,0.8]]],
  'D': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.7,0.0], [1.0,0.3], [1.0,0.7], [0.7,1.0], [0.2,1.0]]],
  'E': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.9,0.0]], [[0.2,0.5], [0.7,0.5]], [[0.2,1.0], [0.9,1.0]]],
  'F': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.9,0.0]], [[0.2,0.5], [0.7,0.5]]],
  'G': [[[0.9,0.2], [0.5,0.0], [0.1,0.2], [0.1,0.8], [0.5,1.0], [0.9,0.8], [0.9,0.5], [0.5,0.5]]],
  'H': [[[0.2,0.0], [0.2,1.0]], [[0.8,0.0], [0.8,1.0]], [[0.2,0.5], [0.8,0.5]]],
  'I': [[[0.5,0.0], [0.5,1.0]], [[0.2,0.0], [0.8,0.0]], [[0.2,1.0], [0.8,1.0]]],
  'J': [[[0.8,0.0], [0.8,0.8], [0.5,1.0], [0.2,0.8]]],
  'K': [[[0.2,0.0], [0.2,1.0]], [[0.9,0.0], [0.2,0.5]], [[0.2,0.5], [0.9,1.0]]],
  'L': [[[0.2,0.0], [0.2,1.0]], [[0.2,1.0], [0.9,1.0]]],
  'M': [[[0.1,1.0], [0.1,0.0], [0.5,0.5], [0.9,0.0], [0.9,1.0]]],
  'N': [[[0.2,1.0], [0.2,0.0], [0.8,1.0], [0.8,0.0]]],
  'O': [[[0.5,0.0], [0.9,0.2], [1.0,0.5], [0.9,0.8], [0.5,1.0], [0.1,0.8], [0.0,0.5], [0.1,0.2], [0.5,0.0]]],
  'P': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.8,0.0], [1.0,0.25], [1.0,0.45], [0.8,0.5], [0.2,0.5]]],
  'Q': [[[0.5,0.0], [0.9,0.2], [1.0,0.5], [0.9,0.8], [0.5,1.0], [0.1,0.8], [0.0,0.5], [0.1,0.2], [0.5,0.0]], [[0.6,0.7], [1.0,1.0]]],
  'R': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.8,0.0], [1.0,0.25], [1.0,0.45], [0.8,0.5], [0.2,0.5]], [[0.5,0.5], [1.0,1.0]]],
  'S': [[[0.9,0.2], [0.5,0.0], [0.1,0.2], [0.1,0.4], [0.9,0.6], [0.9,0.8], [0.5,1.0], [0.1,0.8]]],
  'T': [[[0.5,0.0], [0.5,1.0]], [[0.1,0.0], [0.9,0.0]]],
  'U': [[[0.1,0.0], [0.1,0.8], [0.5,1.0], [0.9,0.8], [0.9,0.0]]],
  'V': [[[0.1,0.0], [0.5,1.0], [0.9,0.0]]],
  'W': [[[0.0,0.0], [0.25,1.0], [0.5,0.5], [0.75,1.0], [1.0,0.0]]],
  'X': [[[0.1,0.0], [0.9,1.0]], [[0.9,0.0], [0.1,1.0]]],
  'Y': [[[0.1,0.0], [0.5,0.5]], [[0.9,0.0], [0.5,0.5]], [[0.5,0.5], [0.5,1.0]]],
  'Z': [[[0.1,0.0], [0.9,0.0], [0.1,1.0], [0.9,1.0]]],
  '0': [[[0.5,0.0], [0.9,0.2], [1.0,0.5], [0.9,0.8], [0.5,1.0], [0.1,0.8], [0.0,0.5], [0.1,0.2], [0.5,0.0]]],
  '1': [[[0.2,0.2], [0.5,0.0], [0.5,1.0]]],
  '2': [[[0.1,0.2], [0.5,0.0], [0.9,0.2], [0.9,0.5], [0.1,1.0], [0.9,1.0]]],
  '3': [[[0.1,0.2], [0.5,0.0], [0.9,0.2], [0.5,0.5], [0.9,0.8], [0.5,1.0], [0.1,0.8]]],
  '4': [[[0.8,0.0], [0.1,0.7], [1.0,0.7]], [[0.8,0.0], [0.8,1.0]]],
  '5': [[[0.9,0.0], [0.2,0.0], [0.2,0.4], [0.8,0.5], [0.9,0.8], [0.5,1.0], [0.1,0.8]]],
  '6': [[[0.9,0.2], [0.5,0.0], [0.1,0.5], [0.1,0.8], [0.5,1.0], [0.9,0.8], [0.9,0.5], [0.5,0.5], [0.1,0.5]]],
  '7': [[[0.1,0.0], [0.9,0.0], [0.4,1.0]]],
  '8': [[[0.5,0.5], [0.1,0.2], [0.5,0.0], [0.9,0.2], [0.5,0.5], [0.1,0.8], [0.5,1.0], [0.9,0.8], [0.5,0.5]]],
  '9': [[[0.9,0.5], [0.5,0.5], [0.1,0.5], [0.1,0.2], [0.5,0.0], [0.9,0.2], [0.9,0.8], [0.5,1.0], [0.1,0.8]]]
};

// ─── Graph Builder ───────────────────────────────────────────────────────────

function distance(lat1, lon1, lat2, lon2) {
  // Simple euclidean for local routing (approximate)
  return Math.hypot(lat2 - lat1, lon2 - lon1);
}

function buildGraph(ways) {
  const graph = new Map(); // nodeKey -> [ { id: neighborKey, lat, lon }, ... ]
  const nodes = new Map(); // nodeKey -> { lat, lon }
  
  const getK = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

  ways.forEach(way => {
    if (!way || way.length === 0) return;
    for (let i = 0; i < way.length; i++) {
      if (!way[i] || way[i].length < 2) continue;
      const [lat, lon] = way[i];
      const k = getK(lat, lon);
      nodes.set(k, { id: k, lat, lon });
      if (!graph.has(k)) graph.set(k, []);
      
      if (i > 0 && way[i-1] && way[i-1].length >= 2) {
        const prevK = getK(way[i-1][0], way[i-1][1]);
        if (nodes.has(prevK)) {
          graph.get(k).push(nodes.get(prevK));
          graph.get(prevK).push(nodes.get(k));
        }
      }
    }
  });
  return { graph, nodes };
}

function findClosestNode(lat, lon, nodesMap) {
  let closest = null;
  let minDist = Infinity;
  nodesMap.forEach(node => {
    const d = distance(lat, lon, node.lat, node.lon);
    if (d < minDist) { minDist = d; closest = node; }
  });
  return closest;
}

// ─── Greedy Road Walker ──────────────────────────────────────────────────────

function pointToLineDist(px, py, x1, y1, x2, y2) {
  const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1, xx, yy;
  if (len_sq !== 0) param = dot / len_sq;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  return Math.hypot(px - xx, py - yy);
}

/**
 * Shape-Constrained A* Pathfinding
 * Finds a route on the road graph that strictly adheres to the ideal stroke line.
 */
function walkStroke(startLat, startLon, endLat, endLon, graph, nodes) {
  const startNode = findClosestNode(startLat, startLon, nodes);
  if (!startNode) return [];

  const targetDist = distance(startLat, startLon, endLat, endLon);
  
  // Priority Queue [ {node, g, f, path} ]
  let openSet = [{ node: startNode, g: 0, f: distance(startNode.lat, startNode.lon, endLat, endLon), path: [startNode] }];
  let closedSet = new Set();
  
  let bestPath = [startNode];
  let closestDistToTarget = Infinity;
  let iterations = 0;
  const MAX_ITERATIONS = 800; // Prevent infinite loops in complex cities

  while (openSet.length > 0 && iterations++ < MAX_ITERATIONS) {
    // Sort to get lowest f (A* mechanic)
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();
    
    const dTarget = distance(current.node.lat, current.node.lon, endLat, endLon);
    
    // Track the closest we ever got, in case we never reach the exact end
    if (dTarget < closestDistToTarget) {
      closestDistToTarget = dTarget;
      bestPath = current.path;
    }

    // Reached destination (within ~20 meters tolerance)
    if (dTarget < 0.0002) {
      bestPath = current.path;
      break;
    }
    
    // Don't wander too far beyond the stroke length
    if (current.g > targetDist * 1.8) continue; 
    
    closedSet.add(current.node.id);
    const neighbors = graph.get(current.node.id) || [];
    
    for (const n of neighbors) {
      if (closedSet.has(n.id)) continue;
      
      const g = current.g + distance(current.node.lat, current.node.lon, n.lat, n.lon);
      const h = distance(n.lat, n.lon, endLat, endLon);
      
      // SHAPE CONSTRAINT: Heavy penalty for drifting away from the ideal straight line of the stroke
      const deviation = pointToLineDist(n.lat, n.lon, startLat, startLon, endLat, endLon);
      const shapePenalty = deviation * 15; // 15x multiplier to force strict adherence to the letter shape
      
      const f = g + h + shapePenalty;
      
      // Check if already in openSet with better f
      const existing = openSet.find(item => item.node.id === n.id);
      if (existing) {
        if (f < existing.f) {
          existing.g = g;
          existing.f = f;
          existing.path = [...current.path, n];
        }
      } else {
        openSet.push({ node: n, g, f, path: [...current.path, n] });
      }
    }
  }
  
  return bestPath.map(n => [n.lat, n.lon]);
}

// ─── Text Layout & Tracing ───────────────────────────────────────────────────

/**
 * Calculates geographical bounds for a string of text, and traces it on the road graph.
 * @param {string} text 
 * @param {Array} mapCenter [lat, lon]
/**
 * Traces the given text onto the road network.
 * @param {string} text 
 * @param {Array} mapCenter [lat, lon]
 * @param {number} letterSizeMeters 
 * @param {Array} allWays 
 */
function traceText(text, mapCenter, letterSizeMeters, allWays) {
  const { graph, nodes } = buildGraph(allWays);
  const resultPaths = [];

  const chars = text.toUpperCase().split('');
  
  // Geographical degree conversions
  // 1 degree lat = ~111.32 km
  const dLatPerMeter = 1 / 111320;
  const dLonPerMeter = 1 / (111320 * Math.cos(mapCenter[0] * Math.PI / 180));

  const letterH = letterSizeMeters * dLatPerMeter;
  const letterW = letterSizeMeters * dLonPerMeter;
  const gapW = letterW * 0.3; // Space between letters

  const totalW = (chars.length * letterW) + ((chars.length - 1) * gapW);
  
  // Start from the left so the whole text is centered
  let currentLon = mapCenter[1] - (totalW / 2);
  const baseLat = mapCenter[0] - (letterH / 2); // Bottom edge

  for (const char of chars) {
    if (char === ' ') { currentLon += letterW + gapW; continue; }
    
    const template = TEMPLATES[char] || TEMPLATES['O']; // Fallback
    
    const charBBox = {
      minLat: baseLat,
      maxLat: baseLat + letterH,
      minLon: currentLon,
      maxLon: currentLon + letterW
    };

    const strokePaths = [];

    // Map template 0.0-1.0 coords to geographical coords and trace
    for (const stroke of template) {
      if (!stroke || stroke.length < 2) continue;
      let currentPath = [];
      
      for (let i = 0; i < stroke.length - 1; i++) {
        const p1 = stroke[i];
        const p2 = stroke[i+1];
        if (!p1 || !p2 || p1.length < 2 || p2.length < 2) continue;
        
        // Y in template is 0.0 (top) to 1.0 (bottom). Map lat is higher=top.
        const startLat = charBBox.maxLat - (p1[1] * letterH);
        const startLon = charBBox.minLon + (p1[0] * letterW);
        const endLat = charBBox.maxLat - (p2[1] * letterH);
        const endLon = charBBox.minLon + (p2[0] * letterW);

        // Walk the road network!
        const roadSegment = walkStroke(startLat, startLon, endLat, endLon, graph, nodes);
        
        if (roadSegment.length > 0) {
          if (currentPath.length > 0) {
            // Join with previous segment of the same stroke
            currentPath.push(...roadSegment.slice(1));
          } else {
            currentPath = roadSegment;
          }
        }
      }
      if (currentPath.length > 0) strokePaths.push(currentPath);
    }
    
    resultPaths.push({ char, paths: strokePaths, bbox: charBBox });
    
    currentLon += letterW + gapW; // Move right for next letter
  }

  return resultPaths;
}

global.RoadTracer = { traceText };

})(window);
