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
  '9': [[[0.9,0.5], [0.5,0.5], [0.1,0.5], [0.1,0.2], [0.5,0.0], [0.9,0.2], [0.9,0.8], [0.5,1.0], [0.1,0.8]]],

  // ─── カタカナ Templates ────────────────────────────────────────────────────
  'ア': [[[0.3,0.15], [0.8,0.15]], [[0.6,0.0], [0.55,0.3], [0.4,0.55], [0.15,0.95]]],
  'イ': [[[0.7,0.1], [0.45,0.45]], [[0.3,0.25], [0.5,0.5], [0.5,0.95]]],
  'ウ': [[[0.5,0.1], [0.5,0.2]], [[0.15,0.3], [0.85,0.3]], [[0.2,0.3], [0.2,0.7], [0.5,0.95], [0.8,0.7], [0.8,0.3]]],
  'エ': [[[0.2,0.15], [0.8,0.15]], [[0.5,0.15], [0.5,0.85]], [[0.15,0.85], [0.85,0.85]]],
  'オ': [[[0.5,0.1], [0.5,0.9]], [[0.2,0.3], [0.8,0.3]], [[0.6,0.15], [0.55,0.45], [0.35,0.7], [0.15,0.9]]],
  'カ': [[[0.4,0.05], [0.4,0.95]], [[0.15,0.3], [0.85,0.3]], [[0.75,0.3], [0.75,0.65], [0.85,0.9]]],
  'キ': [[[0.2,0.25], [0.8,0.25]], [[0.2,0.5], [0.8,0.5]], [[0.5,0.1], [0.5,0.95]]],
  'ク': [[[0.3,0.1], [0.7,0.1]], [[0.6,0.1], [0.5,0.4], [0.3,0.7], [0.1,0.95]]],
  'ケ': [[[0.3,0.05], [0.3,0.6]], [[0.15,0.3], [0.85,0.3]], [[0.7,0.3], [0.6,0.6], [0.4,0.85], [0.2,0.95]]],
  'コ': [[[0.2,0.2], [0.8,0.2]], [[0.8,0.2], [0.8,0.8]], [[0.2,0.8], [0.8,0.8]]],
  'サ': [[[0.3,0.1], [0.3,0.6]], [[0.65,0.1], [0.65,0.6]], [[0.1,0.35], [0.9,0.35]], [[0.5,0.5], [0.5,0.7], [0.45,0.95]]],
  'シ': [[[0.2,0.25], [0.25,0.35]], [[0.15,0.55], [0.2,0.6]], [[0.3,0.7], [0.5,0.6], [0.7,0.4], [0.85,0.15]]],
  'ス': [[[0.2,0.15], [0.8,0.15]], [[0.7,0.15], [0.4,0.5], [0.7,0.85], [0.85,0.95]]],
  'セ': [[[0.35,0.05], [0.35,0.9]], [[0.15,0.4], [0.85,0.4]], [[0.65,0.4], [0.65,0.7], [0.75,0.9]]],
  'ソ': [[[0.2,0.15], [0.25,0.3]], [[0.8,0.1], [0.7,0.4], [0.5,0.7], [0.3,0.95]]],
  'タ': [[[0.2,0.25], [0.8,0.25]], [[0.55,0.05], [0.5,0.45], [0.35,0.7], [0.15,0.95]], [[0.6,0.5], [0.65,0.55]]],
  'チ': [[[0.2,0.2], [0.8,0.2]], [[0.15,0.45], [0.85,0.45]], [[0.5,0.45], [0.5,0.95]]],
  'ツ': [[[0.15,0.2], [0.2,0.35]], [[0.45,0.15], [0.5,0.3]], [[0.8,0.1], [0.7,0.4], [0.5,0.7], [0.3,0.95]]],
  'テ': [[[0.2,0.15], [0.8,0.15]], [[0.15,0.4], [0.85,0.4]], [[0.5,0.4], [0.5,0.7], [0.45,0.95]]],
  'ト': [[[0.4,0.05], [0.4,0.95]], [[0.4,0.4], [0.8,0.6]]],
  'ナ': [[[0.5,0.05], [0.5,0.5]], [[0.15,0.35], [0.85,0.35]], [[0.6,0.35], [0.5,0.6], [0.35,0.8], [0.2,0.95]]],
  'ニ': [[[0.2,0.3], [0.8,0.3]], [[0.15,0.7], [0.85,0.7]]],
  'ヌ': [[[0.2,0.15], [0.8,0.15]], [[0.8,0.15], [0.5,0.5], [0.2,0.85], [0.5,1.0], [0.85,0.8]]],
  'ネ': [[[0.5,0.05], [0.5,0.2]], [[0.15,0.25], [0.85,0.25]], [[0.5,0.25], [0.5,0.95]], [[0.2,0.5], [0.5,0.7], [0.8,0.5]], [[0.5,0.7], [0.3,0.95]]],
  'ノ': [[[0.8,0.05], [0.6,0.35], [0.35,0.65], [0.15,0.95]]],
  'ハ': [[[0.45,0.15], [0.3,0.5], [0.1,0.9]], [[0.55,0.15], [0.7,0.5], [0.9,0.9]]],
  'ヒ': [[[0.3,0.1], [0.3,0.85]], [[0.3,0.45], [0.7,0.3], [0.8,0.5], [0.7,0.7], [0.3,0.85]]],
  'フ': [[[0.2,0.2], [0.8,0.2]], [[0.75,0.2], [0.65,0.5], [0.45,0.75], [0.2,0.95]]],
  'ヘ': [[[0.1,0.55], [0.5,0.2], [0.9,0.65]]],
  'ホ': [[[0.5,0.05], [0.5,0.95]], [[0.15,0.3], [0.85,0.3]], [[0.5,0.5], [0.2,0.9]], [[0.5,0.5], [0.8,0.9]]],
  'マ': [[[0.15,0.2], [0.85,0.2]], [[0.8,0.2], [0.5,0.55], [0.3,0.75], [0.15,0.95]]],
  'ミ': [[[0.3,0.15], [0.7,0.25]], [[0.25,0.4], [0.75,0.5]], [[0.2,0.7], [0.7,0.8]]],
  'ム': [[[0.2,0.8], [0.5,0.1], [0.6,0.5], [0.85,0.85]], [[0.35,0.65], [0.45,0.7]]],
  'メ': [[[0.8,0.1], [0.5,0.5], [0.2,0.9]], [[0.3,0.4], [0.5,0.5], [0.8,0.9]]],
  'モ': [[[0.2,0.2], [0.8,0.2]], [[0.2,0.5], [0.8,0.5]], [[0.5,0.2], [0.5,0.95]]],
  'ヤ': [[[0.3,0.1], [0.3,0.6]], [[0.15,0.35], [0.85,0.35]], [[0.7,0.35], [0.6,0.65], [0.5,0.95]]],
  'ユ': [[[0.25,0.2], [0.25,0.65]], [[0.25,0.65], [0.75,0.65]], [[0.75,0.2], [0.75,0.8]]],
  'ヨ': [[[0.3,0.15], [0.7,0.15]], [[0.3,0.5], [0.7,0.5]], [[0.3,0.85], [0.7,0.85]], [[0.7,0.15], [0.7,0.85]]],
  'ラ': [[[0.2,0.2], [0.8,0.2]], [[0.55,0.05], [0.5,0.4], [0.35,0.65], [0.15,0.95]]],
  'リ': [[[0.3,0.1], [0.3,0.55]], [[0.7,0.1], [0.7,0.65], [0.6,0.85], [0.45,0.95]]],
  'ル': [[[0.25,0.1], [0.25,0.8], [0.35,0.9]], [[0.6,0.1], [0.6,0.8], [0.8,0.95]]],
  'レ': [[[0.3,0.1], [0.3,0.7], [0.5,0.85], [0.8,0.9]]],
  'ロ': [[[0.2,0.15], [0.8,0.15]], [[0.2,0.15], [0.2,0.85]], [[0.8,0.15], [0.8,0.85]], [[0.2,0.85], [0.8,0.85]]],
  'ワ': [[[0.2,0.2], [0.8,0.2]], [[0.2,0.2], [0.2,0.6], [0.4,0.9]], [[0.75,0.2], [0.7,0.5], [0.6,0.75], [0.5,0.9]]],
  'ヲ': [[[0.2,0.2], [0.8,0.2]], [[0.2,0.45], [0.8,0.45]], [[0.7,0.45], [0.6,0.7], [0.4,0.9], [0.2,0.95]]],
  'ン': [[[0.2,0.3], [0.25,0.4]], [[0.3,0.7], [0.5,0.8], [0.75,0.55], [0.85,0.15]]],
  'ー': [[[0.1,0.5], [0.9,0.5]]]
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
  const MAX_ITERATIONS = 2500; // Increased to allow long connecting paths between letters

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
 * @param {boolean} connectLetters
 */
function traceText(text, mapCenter, letterSizeMeters, allWays, connectLetters = false) {
  const { graph, nodes } = buildGraph(allWays);
  const resultPaths = [];

  const lines = text.toUpperCase().split('\n');
  
  // Geographical degree conversions
  // 1 degree lat = ~111.32 km
  const dLatPerMeter = 1 / 111320;
  const dLonPerMeter = 1 / (111320 * Math.cos(mapCenter[0] * Math.PI / 180));

  const letterH = letterSizeMeters * dLatPerMeter;
  const letterW = letterSizeMeters * dLonPerMeter;
  const gapW = letterW * 0.3; // Space between letters
  const gapH = letterH * 0.5; // Space between lines

  // Calculate total height to center vertically
  const totalH = (lines.length * letterH) + ((lines.length - 1) * gapH);
  let currentLat = mapCenter[0] + (totalH / 2); // Start from the top edge

  let prevCharEnd = null;
  let prevCharBBox = null;

  for (const line of lines) {
    // 改行時には繋がりをリセットする（筆記体のルール）
    prevCharEnd = null;
    prevCharBBox = null;

    // If it's a completely empty line, just move the cursor down
    if (!line.trim()) {
      currentLat -= (letterH + gapH);
      continue;
    }
    
    const chars = line.split('');
    const totalW = (chars.length * letterW) + ((chars.length - 1) * gapW);
    
    // Start from the left so this line is centered horizontally
    let currentLon = mapCenter[1] - (totalW / 2);
    const baseLat = currentLat - letterH; // Bottom edge of the current line

    for (const char of chars) {
      if (char === ' ') { 
        currentLon += letterW + gapW; 
        // スペース（単語の区切り）では繋がりをリセットする
        prevCharEnd = null;
        prevCharBBox = null;
        continue; 
      }
      
      const template = TEMPLATES[char] || TEMPLATES['O']; // Fallback
      
      // ユーザーの要望に基づく「上下のマス目ずらし」
      const verticalStagger = (Math.random() - 0.5) * letterH * 0.5; // 上下に最大25%ずらす
      
      const charBBox = {
        minLat: baseLat + verticalStagger,
        maxLat: baseLat + letterH + verticalStagger,
        minLon: currentLon,
        maxLon: currentLon + letterW
      };

      const strokePaths = [];
      let firstPointLat = null, firstPointLon = null;
      let lastPointLat = null, lastPointLon = null;

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

          if (firstPointLat === null) {
            firstPointLat = startLat;
            firstPointLon = startLon;
          }

          // Walk the road network!
          const roadSegment = walkStroke(startLat, startLon, endLat, endLon, graph, nodes);
          
          if (roadSegment.length > 0) {
            if (currentPath.length > 0) {
              // Join with previous segment of the same stroke
              currentPath.push(...roadSegment.slice(1));
            } else {
              currentPath = roadSegment;
            }
            lastPointLat = roadSegment[roadSegment.length - 1][0];
            lastPointLon = roadSegment[roadSegment.length - 1][1];
          }
        }
        if (currentPath.length > 0) strokePaths.push(currentPath);
      }
      
      // If connected mode is ON, draw a stylized 'bridge' path
      // from the bottom-right of the previous letter to the bottom-left of the current letter
      if (connectLetters && prevCharEnd && firstPointLat !== null && prevCharBBox) {
        // 1. 描き終わりから右下(Exit)へ
        const exitLat = prevCharBBox.maxLat - (letterH * 0.8);
        const exitLon = prevCharBBox.maxLon;
        
        // 2. 次の文字の左下(Entry)へ
        const entryLat = charBBox.maxLat - (letterH * 0.8);
        const entryLon = charBBox.minLon;
        
        const bridge1 = walkStroke(prevCharEnd[0], prevCharEnd[1], exitLat, exitLon, graph, nodes);
        const bridge2 = walkStroke(exitLat, exitLon, entryLat, entryLon, graph, nodes);
        const bridge3 = walkStroke(entryLat, entryLon, firstPointLat, firstPointLon, graph, nodes);
        
        // 無理なところ（道が途切れている等）は繋げないようにする
        // A*探索が目的地（約50m以内）に到達できたかチェック
        const b1End = bridge1[bridge1.length - 1];
        const b2End = bridge2[bridge2.length - 1];
        const b3End = bridge3[bridge3.length - 1];
        
        const d1 = b1End ? distance(b1End[0], b1End[1], exitLat, exitLon) : Infinity;
        const d2 = b2End ? distance(b2End[0], b2End[1], entryLat, entryLon) : Infinity;
        const d3 = b3End ? distance(b3End[0], b3End[1], firstPointLat, firstPointLon) : Infinity;

        // 3つの橋渡し全てが目標地点に到達できた場合のみ、繋がりを描画する
        if (d1 < 0.0005 && d2 < 0.0005 && d3 < 0.0005) {
          // Prepend in reverse order so they draw BEFORE the letter itself
          if (bridge3.length > 0) strokePaths.unshift(bridge3);
          if (bridge2.length > 0) strokePaths.unshift(bridge2);
          if (bridge1.length > 0) strokePaths.unshift(bridge1);
        }
      }

      if (lastPointLat !== null) {
        prevCharEnd = [lastPointLat, lastPointLon];
        prevCharBBox = charBBox; // Save bbox for the next bridge
      }
      
      resultPaths.push({ char, paths: strokePaths, bbox: charBBox });
      
      currentLon += letterW + gapW; // Move right for next letter
    }
    
    // Move down for the next line
    currentLat -= (letterH + gapH);
  }

  return resultPaths;
}

global.RoadTracer = { traceText };

})(window);
