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
  'A': [[[0.1, 1.0], [0.26, 0.6], [0.5, 0.0], [0.74, 0.6], [0.9, 1.0]], [[0.26, 0.6], [0.74, 0.6]]],
  'B': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.7,0.0], [0.9,0.25], [0.9,0.4], [0.7,0.5], [0.2,0.5]], [[0.2,0.5], [0.8,0.5], [1.0,0.75], [1.0,0.9], [0.8,1.0], [0.2,1.0]]],
  'C': [[[0.9,0.2], [0.5,0.0], [0.1,0.2], [0.1,0.8], [0.5,1.0], [0.9,0.8]]],
  'D': [[[0.2,0.0], [0.2,1.0]], [[0.2,0.0], [0.7,0.0], [1.0,0.3], [1.0,0.7], [0.7,1.0], [0.2,1.0]]],
  'E': [[[0.9, 0.0], [0.2, 0.0], [0.2, 0.5], [0.2, 1.0], [0.9, 1.0]], [[0.2, 0.5], [0.8, 0.5]]],
  'F': [[[0.9, 0.0], [0.2, 0.0], [0.2, 0.5], [0.2, 1.0]], [[0.2, 0.5], [0.8, 0.5]]],
  'G': [[[0.9,0.2], [0.5,0.0], [0.1,0.2], [0.1,0.8], [0.5,1.0], [0.9,0.8], [0.9,0.5], [0.5,0.5]]],
  'H': [[[0.2, 0.0], [0.2, 0.5], [0.2, 1.0]], [[0.8, 0.0], [0.8, 0.5], [0.8, 1.0]], [[0.2, 0.5], [0.8, 0.5]]],
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
  'T': [[[0.1, 0.0], [0.5, 0.0], [0.9, 0.0]], [[0.5, 0.0], [0.5, 1.0]]],
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
  '!': [[[0.5, 0.0], [0.5, 0.7]], [[0.5, 0.85], [0.5, 1.0]]],
  '?': [[[0.2, 0.3], [0.5, 0.0], [0.8, 0.3], [0.5, 0.6], [0.5, 0.7]], [[0.5, 0.85], [0.5, 1.0]]],
  // ♡ heart — one continuous pen-stroke: up left bump, over the notch, up right bump, down to the point
  '♡': [[[0.5, 1.0], [0.1, 0.5], [0.0, 0.3], [0.1, 0.1], [0.3, 0.0], [0.5, 0.2], [0.7, 0.0], [0.9, 0.1], [1.0, 0.3], [0.9, 0.5], [0.5, 1.0]]],
  '♥': [[[0.5, 1.0], [0.1, 0.5], [0.0, 0.3], [0.1, 0.1], [0.3, 0.0], [0.5, 0.2], [0.7, 0.0], [0.9, 0.1], [1.0, 0.3], [0.9, 0.5], [0.5, 1.0]]],
  // ─── カタカナ Templates (Corrected) ────────────────────────────────────────────────────
  'ア': [[[0.2, 0.2], [0.8, 0.2], [0.4, 0.6]], [[0.5, 0.4], [0.5, 0.7], [0.4, 0.9]]],
  'イ': [[[0.6, 0.1], [0.2, 0.8]], [[0.4, 0.4], [0.4, 0.9]]],
  'ウ': [[[0.5, 0.1], [0.5, 0.25]], [[0.2, 0.3], [0.2, 0.5]], [[0.2, 0.3], [0.8, 0.3], [0.8, 0.6], [0.3, 0.9]]],
  'エ': [[[0.2, 0.2], [0.8, 0.2]], [[0.5, 0.2], [0.5, 0.8]], [[0.1, 0.8], [0.9, 0.8]]],
  'オ': [[[0.2, 0.3], [0.9, 0.3]], [[0.5, 0.1], [0.5, 0.7], [0.2, 0.9]], [[0.5, 0.5], [0.8, 0.9]]],
  'カ': [[[0.2, 0.3], [0.8, 0.3], [0.8, 0.6], [0.6, 0.9]], [[0.4, 0.1], [0.2, 0.8]]],
  'キ': [[[0.2, 0.3], [0.8, 0.3]], [[0.2, 0.5], [0.9, 0.5]], [[0.5, 0.1], [0.5, 0.7], [0.3, 0.9]]],
  'ク': [[[0.3, 0.2], [0.1, 0.5]], [[0.3, 0.2], [0.8, 0.2], [0.4, 0.9]]],
  'ケ': [[[0.4, 0.2], [0.2, 0.8]], [[0.4, 0.3], [0.8, 0.3]], [[0.6, 0.3], [0.6, 0.6], [0.4, 0.9]]],
  'コ': [[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8]], [[0.2, 0.8], [0.8, 0.8]]],
  'サ': [[[0.1, 0.3], [0.9, 0.3]], [[0.3, 0.1], [0.3, 0.6]], [[0.7, 0.1], [0.7, 0.6], [0.3, 0.9]]],
  'シ': [[[0.2, 0.2], [0.3, 0.3]], [[0.15, 0.5], [0.25, 0.6]], [[0.2, 0.9], [0.6, 0.7], [0.8, 0.2]]],
  'ス': [[[0.2, 0.2], [0.8, 0.2], [0.2, 0.8]], [[0.5, 0.5], [0.8, 0.9]]],
  'セ': [[[0.1, 0.3], [0.8, 0.3], [0.8, 0.5], [0.7, 0.5]], [[0.4, 0.1], [0.4, 0.8], [0.9, 0.8]]],
  'ソ': [[[0.2, 0.2], [0.4, 0.4]], [[0.8, 0.1], [0.5, 0.5], [0.2, 0.9]]],
  'タ': [[[0.4, 0.1], [0.2, 0.5]], [[0.4, 0.3], [0.8, 0.3], [0.5, 0.6], [0.3, 0.9]], [[0.5, 0.6], [0.8, 0.8]]],
  'チ': [[[0.7, 0.1], [0.3, 0.3]], [[0.2, 0.4], [0.8, 0.4]], [[0.5, 0.4], [0.5, 0.7], [0.3, 0.9]]],
  'ツ': [[[0.2, 0.2], [0.3, 0.4]], [[0.5, 0.2], [0.6, 0.4]], [[0.8, 0.2], [0.5, 0.6], [0.2, 0.9]]],
  'テ': [[[0.2, 0.2], [0.8, 0.2]], [[0.2, 0.5], [0.8, 0.5]], [[0.5, 0.5], [0.5, 0.7], [0.2, 0.9]]],
  'ト': [[[0.5, 0.1], [0.5, 0.9]], [[0.5, 0.4], [0.9, 0.7]]],
  'ナ': [[[0.2, 0.3], [0.8, 0.3]], [[0.5, 0.1], [0.5, 0.6], [0.3, 0.9]]],
  'ニ': [[[0.2, 0.3], [0.8, 0.3]], [[0.1, 0.7], [0.9, 0.7]]],
  'ヌ': [[[0.2, 0.2], [0.8, 0.2], [0.3, 0.9]], [[0.4, 0.5], [0.8, 0.8]]],
  'ネ': [[[0.5, 0.1], [0.5, 0.2]], [[0.2, 0.3], [0.8, 0.3], [0.3, 0.7]], [[0.5, 0.5], [0.5, 0.9]], [[0.5, 0.5], [0.8, 0.9]]],
  'ノ': [[[0.8, 0.1], [0.4, 0.5], [0.2, 0.9]]],
  'ハ': [[[0.4, 0.2], [0.2, 0.8]], [[0.6, 0.2], [0.8, 0.8]]],
  'ヒ': [[[0.2, 0.4], [0.8, 0.4]], [[0.2, 0.4], [0.2, 0.8], [0.8, 0.8]]],
  'フ': [[[0.2, 0.2], [0.8, 0.2], [0.5, 0.6], [0.3, 0.9]]],
  'ヘ': [[[0.2, 0.7], [0.5, 0.2], [0.8, 0.8]]],
  'ホ': [[[0.2, 0.2], [0.8, 0.2]], [[0.5, 0.1], [0.5, 0.9]], [[0.5, 0.6], [0.2, 0.9]], [[0.5, 0.6], [0.8, 0.9]]],
  'マ': [[[0.2, 0.2], [0.8, 0.2], [0.4, 0.6]], [[0.6, 0.6], [0.9, 0.9]]],
  'ミ': [[[0.2, 0.2], [0.8, 0.3]], [[0.2, 0.5], [0.8, 0.6]], [[0.2, 0.8], [0.8, 0.9]]],
  'ム': [[[0.4, 0.1], [0.2, 0.5], [0.8, 0.5]], [[0.6, 0.5], [0.8, 0.9]]],
  'メ': [[[0.8, 0.2], [0.2, 0.8]], [[0.3, 0.3], [0.8, 0.8]]],
  'モ': [[[0.2, 0.3], [0.8, 0.3]], [[0.2, 0.6], [0.8, 0.6]], [[0.5, 0.1], [0.5, 0.8], [0.8, 0.8]]],
  'ヤ': [[[0.2, 0.4], [0.8, 0.3], [0.8, 0.6], [0.6, 0.9]], [[0.4, 0.1], [0.4, 0.7]]],
  'ユ': [[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8]], [[0.1, 0.8], [0.9, 0.8]]],
  'ヨ': [[[0.2, 0.2], [0.8, 0.2], [0.8, 0.8]], [[0.2, 0.5], [0.8, 0.5]], [[0.2, 0.8], [0.8, 0.8]]],
  'ラ': [[[0.3, 0.1], [0.7, 0.1]], [[0.2, 0.4], [0.8, 0.4], [0.5, 0.7], [0.3, 0.9]]],
  'リ': [[[0.3, 0.2], [0.3, 0.6]], [[0.7, 0.2], [0.7, 0.7], [0.5, 0.9]]],
  'ル': [[[0.3, 0.2], [0.3, 0.8], [0.4, 0.9]], [[0.7, 0.2], [0.7, 0.7], [0.9, 0.9]]],
  'レ': [[[0.2, 0.2], [0.2, 0.7], [0.5, 0.9], [0.8, 0.7]]],
  'ロ': [[[0.2, 0.2], [0.2, 0.8]], [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8]], [[0.2, 0.8], [0.8, 0.8]]],
  'ワ': [[[0.2, 0.2], [0.2, 0.5]], [[0.2, 0.2], [0.8, 0.2], [0.7, 0.6], [0.5, 0.9]]],
  'ヲ': [[[0.2, 0.2], [0.8, 0.2]], [[0.2, 0.5], [0.8, 0.5]], [[0.6, 0.5], [0.5, 0.7], [0.3, 0.9]]],
  'ン': [[[0.2, 0.2], [0.3, 0.4]], [[0.2, 0.9], [0.6, 0.6], [0.8, 0.3]]],
  'ー': [[[0.1, 0.5], [0.9, 0.5]]]
};

// Dynamically add Dakuten (濁音), Handakuten (半濁音), and small characters
(function() {
  const DAKUTEN_MAP = {
    'ガ':'カ', 'ギ':'キ', 'グ':'ク', 'ゲ':'ケ', 'ゴ':'コ',
    'ザ':'サ', 'ジ':'シ', 'ズ':'ス', 'ゼ':'セ', 'ゾ':'ソ',
    'ダ':'タ', 'ヂ':'チ', 'ヅ':'ツ', 'デ':'テ', 'ド':'ト',
    'バ':'ハ', 'ビ':'ヒ', 'ブ':'フ', 'ベ':'ヘ', 'ボ':'ホ',
    'ヴ':'ウ'
  };
  const HANDAKUTEN_MAP = {
    'パ':'ハ', 'ピ':'ヒ', 'プ':'フ', 'ペ':'ヘ', 'ポ':'ホ'
  };
  const SMALL_MAP = {
    'ァ':'ア', 'ィ':'イ', 'ゥ':'ウ', 'ェ':'エ', 'ォ':'オ',
    'ッ':'ツ', 'ャ':'ヤ', 'ュ':'ユ', 'ョ':'ヨ'
  };

  for (const dakuten in DAKUTEN_MAP) {
    const base = DAKUTEN_MAP[dakuten];
    if (TEMPLATES[base]) {
      // Scale base character to 85% and shift down to make room for dots
      const scaledBase = TEMPLATES[base].map(stroke => stroke.map(p => [p[0] * 0.9, p[1] * 0.9 + 0.1]));
      // Add two short diagonal strokes (゛) at top right
      const dots = [[[0.8, 0.1], [0.95, 0.15]], [[0.85, 0.2], [1.0, 0.25]]];
      TEMPLATES[dakuten] = scaledBase.concat(dots);
    }
  }

  for (const handaku in HANDAKUTEN_MAP) {
    const base = HANDAKUTEN_MAP[handaku];
    if (TEMPLATES[base]) {
      // Scale base character to 85% and shift down
      const scaledBase = TEMPLATES[base].map(stroke => stroke.map(p => [p[0] * 0.9, p[1] * 0.9 + 0.1]));
      // Add a small circle/square (゜) at top right
      const circle = [[[0.8, 0.1], [0.95, 0.1], [0.95, 0.25], [0.8, 0.25], [0.8, 0.1]]];
      TEMPLATES[handaku] = scaledBase.concat(circle);
    }
  }

  for (const small in SMALL_MAP) {
    const base = SMALL_MAP[small];
    if (TEMPLATES[base]) {
      // Scale to 60% and move to the bottom right quadrant
      TEMPLATES[small] = TEMPLATES[base].map(stroke => stroke.map(p => [p[0] * 0.6 + 0.4, p[1] * 0.6 + 0.4]));
    }
  }
})();

// ─── Graph Builder & Spatial Index ───────────────────────────────────────────

function distance(lat1, lon1, lat2, lon2) {
  return Math.hypot(lat2 - lat1, lon2 - lon1);
}

function buildGraph(ways) {
  const graph = new Map();
  const nodes = new Map();
  const getK = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;

  for (let w = 0; w < ways.length; w++) {
    const way = ways[w];
    if (!way || way.length === 0) continue;
    let prevNode = null;
    let prevAdj = null;
    for (let i = 0; i < way.length; i++) {
      const pt = way[i];
      if (!pt || pt.length < 2) {
        prevNode = null;
        prevAdj = null;
        continue;
      }
      const lat = pt[0];
      const lon = pt[1];
      const k = getK(lat, lon);

      let node = nodes.get(k);
      if (!node) {
        node = { id: k, lat, lon };
        nodes.set(k, node);
      }
      let adj = graph.get(k);
      if (!adj) {
        adj = [];
        graph.set(k, adj);
      }

      if (prevNode && prevNode !== node) {
        adj.push(prevNode);
        prevAdj.push(node);
      }
      prevNode = node;
      prevAdj = adj;
    }
  }
  return { graph, nodes };
}

/**
 * Spatial hash grid over graph nodes for O(1) nearest-node lookup and rectangular density queries.
 */
function createSpatialIndex(nodesMap, cellLat, cellLon) {
  const grid = new Map();
  const minCell = Math.min(cellLat, cellLon);
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;

  nodesMap.forEach(n => {
    if (n.lat < minLat) minLat = n.lat;
    if (n.lat > maxLat) maxLat = n.lat;
    if (n.lon < minLon) minLon = n.lon;
    if (n.lon > maxLon) maxLon = n.lon;
    const key = `${Math.floor(n.lat / cellLat)},${Math.floor(n.lon / cellLon)}`;
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(n);
  });

  return {
    minLat, maxLat, minLon, maxLon,
    findClosest(lat, lon, maxRadiusCells = 12) {
      const cy = Math.floor(lat / cellLat);
      const cx = Math.floor(lon / cellLon);
      let best = null;
      let minDist = Infinity;
      let stopRing = maxRadiusCells;

      for (let r = 0; r <= stopRing; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (r > 0 && Math.abs(dy) !== r && Math.abs(dx) !== r) continue;
            const bucket = grid.get(`${cy + dy},${cx + dx}`);
            if (!bucket) continue;
            for (let i = 0; i < bucket.length; i++) {
              const n = bucket[i];
              const d = distance(lat, lon, n.lat, n.lon);
              if (d < minDist) {
                minDist = d;
                best = n;
                stopRing = Math.min(maxRadiusCells, Math.ceil(minDist / minCell) + 1);
              }
            }
          }
        }
      }

      if (!best) {
        nodesMap.forEach(n => {
          const d = distance(lat, lon, n.lat, n.lon);
          if (d < minDist) {
            minDist = d;
            best = n;
          }
        });
      }
      return best;
    },
    countInBox(lat0, lat1, lon0, lon1) {
      const y0 = Math.floor(lat0 / cellLat);
      const y1 = Math.floor(lat1 / cellLat);
      const x0 = Math.floor(lon0 / cellLon);
      const x1 = Math.floor(lon1 / cellLon);
      let cnt = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const bucket = grid.get(`${y},${x}`);
          if (!bucket) continue;
          if (y > y0 && y < y1 && x > x0 && x < x1) {
            cnt += bucket.length;
          } else {
            for (let i = 0; i < bucket.length; i++) {
              const n = bucket[i];
              if (n.lat >= lat0 && n.lat <= lat1 && n.lon >= lon0 && n.lon <= lon1) cnt++;
            }
          }
        }
      }
      return cnt;
    }
  };
}

// ─── Shape-Constrained A* Pathfinding ────────────────────────────────────────

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
 * Shape-Constrained A* Pathfinding using a binary min-heap and parent pointers.
 * Optional allowedBBox keeps strokes from detouring across parks/rivers into neighboring letters.
 */
function walkStroke(startLat, startLon, endLat, endLon, graph, spatialIdx, allowedBBox = null) {
  const startNode = spatialIdx.findClosest(startLat, startLon);
  if (!startNode) return [];

  const targetDist = distance(startLat, startLon, endLat, endLon);
  const heap = [{ node: startNode, g: 0, f: distance(startNode.lat, startNode.lon, endLat, endLon) }];
  const gScore = new Map([[startNode.id, 0]]);
  const cameFrom = new Map();
  const closedSet = new Set();

  const pushHeap = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= item.f) break;
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  };

  const popHeap = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      let i = 0;
      const len = heap.length;
      while ((i << 1) + 1 < len) {
        const left = (i << 1) + 1;
        const right = left + 1;
        const sm = (right < len && heap[right].f < heap[left].f) ? right : left;
        if (last.f <= heap[sm].f) break;
        heap[i] = heap[sm];
        i = sm;
      }
      heap[i] = last;
    }
    return top;
  };

  let bestNode = startNode;
  let closestDistToTarget = Infinity;
  let iterations = 0;
  const MAX_ITERATIONS = 4000;

  while (heap.length > 0 && iterations++ < MAX_ITERATIONS) {
    const current = popHeap();
    const cNode = current.node;
    if (closedSet.has(cNode.id)) continue;

    const dTarget = distance(cNode.lat, cNode.lon, endLat, endLon);
    if (dTarget < closestDistToTarget) {
      closestDistToTarget = dTarget;
      bestNode = cNode;
    }

    if (dTarget < 0.0002) {
      bestNode = cNode;
      break;
    }

    if (current.g > targetDist * 1.8) continue;

    closedSet.add(cNode.id);
    const neighbors = graph.get(cNode.id);
    if (!neighbors) continue;

    for (let i = 0; i < neighbors.length; i++) {
      const n = neighbors[i];
      if (closedSet.has(n.id)) continue;

      if (allowedBBox) {
        const outN = n.lat < allowedBBox.minLat || n.lat > allowedBBox.maxLat ||
                     n.lon < allowedBBox.minLon || n.lon > allowedBBox.maxLon;
        if (outN) {
          const outC = cNode.lat < allowedBBox.minLat || cNode.lat > allowedBBox.maxLat ||
                       cNode.lon < allowedBBox.minLon || cNode.lon > allowedBBox.maxLon;
          if (!outC || distance(n.lat, n.lon, endLat, endLon) >= dTarget) continue;
        }
      }

      const g = current.g + distance(cNode.lat, cNode.lon, n.lat, n.lon);
      const prevG = gScore.get(n.id);
      if (prevG !== undefined && g >= prevG) continue;

      const h = distance(n.lat, n.lon, endLat, endLon);
      const deviation = pointToLineDist(n.lat, n.lon, startLat, startLon, endLat, endLon);
      const f = g + h + deviation * 8;

      gScore.set(n.id, g);
      cameFrom.set(n.id, cNode);
      pushHeap({ node: n, g, f });
    }
  }

  const path = [];
  let cur = bestNode;
  while (cur) {
    path.push([cur.lat, cur.lon]);
    cur = cameFrom.get(cur.id);
  }
  path.reverse();
  return path;
}

// ─── Text Layout & Tracing ───────────────────────────────────────────────────

/**
 * Finds the best center and letter size within the fetched road network so every letter
 * sits over dense roads (avoiding large parks, rivers, or dataset edges).
 */
function findOptimalBlockLayout(lines, mapCenter, letterSizeMeters, spatialIdx) {
  const dLatPerMeter = 1 / 111320;
  const dLonPerMeter = 1 / (111320 * Math.cos(mapCenter[0] * Math.PI / 180));

  const availH = Math.max(0.002, spatialIdx.maxLat - spatialIdx.minLat);
  const availW = Math.max(0.002, spatialIdx.maxLon - spatialIdx.minLon);

  const maxChars = Math.max(...lines.map(l => l.length));
  const rawBlockW = (maxChars + (maxChars - 1) * 0.3) * letterSizeMeters * dLonPerMeter;
  const rawBlockH = (lines.length + (lines.length - 1) * 0.5) * letterSizeMeters * dLatPerMeter;

  // Shrink automatically if the requested block is wider/taller than 85% of available road data
  const fitScale = Math.min(1.0, (availW * 0.85) / rawBlockW, (availH * 0.85) / rawBlockH);
  const baseSize = letterSizeMeters * Math.max(0.35, fitScale);

  const scales = [1.0, 0.85, 0.72, 0.58];
  let bestCenter = mapCenter.slice();
  let bestSize = baseSize;
  let bestScore = -Infinity;

  for (let sIdx = 0; sIdx < scales.length; sIdx++) {
    const sc = scales[sIdx];
    const sz = baseSize * sc;
    const lH = sz * dLatPerMeter;
    const lW = sz * dLonPerMeter;
    const gW = lW * 0.3;
    const gH = lH * 0.5;
    const totH = lines.length * lH + (lines.length - 1) * gH;
    const totW = maxChars * lW + (maxChars - 1) * gW;

    const minCenterLat = spatialIdx.minLat + totH / 2;
    const maxCenterLat = spatialIdx.maxLat - totH / 2;
    const minCenterLon = spatialIdx.minLon + totW / 2;
    const maxCenterLon = spatialIdx.maxLon - totW / 2;

    const searchLat = Math.min(availH * 0.42, Math.max(lH * 2.0, (availH - totH) * 0.48));
    const searchLon = Math.min(availW * 0.42, Math.max(lW * 2.0, (availW - totW) * 0.48));

    const loLat = minCenterLat <= maxCenterLat
      ? Math.max(minCenterLat, Math.min(maxCenterLat, mapCenter[0] - searchLat))
      : (spatialIdx.minLat + spatialIdx.maxLat) / 2;
    const hiLat = minCenterLat <= maxCenterLat
      ? Math.min(maxCenterLat, Math.max(minCenterLat, mapCenter[0] + searchLat))
      : loLat;

    const loLon = minCenterLon <= maxCenterLon
      ? Math.max(minCenterLon, Math.min(maxCenterLon, mapCenter[1] - searchLon))
      : (spatialIdx.minLon + spatialIdx.maxLon) / 2;
    const hiLon = minCenterLon <= maxCenterLon
      ? Math.min(maxCenterLon, Math.max(minCenterLon, mapCenter[1] + searchLon))
      : loLon;

    const stepsY = loLat === hiLat ? 1 : 7;
    const stepsX = loLon === hiLon ? 1 : 11;
    let scaleHadCleanFit = false;

    for (let iy = 0; iy < stepsY; iy++) {
      const cLat = stepsY === 1 ? loLat : loLat + (iy / (stepsY - 1)) * (hiLat - loLat);

      for (let ix = 0; ix < stepsX; ix++) {
        const cLon = stepsX === 1 ? loLon : loLon + (ix / (stepsX - 1)) * (hiLon - loLon);

        let minCellCnt = Infinity;
        let minLetterCnt = Infinity;
        let minGapCnt = Infinity;
        let sumLog = 0;
        let letterCount = 0;
        let curLat = cLat + totH / 2;

        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          if (!line.trim()) {
            curLat -= (lH + gH);
            continue;
          }
          const chars = line.split('');
          const lineW = chars.length * lW + (chars.length - 1) * gW;
          let curLon = cLon - lineW / 2;
          const bLat = curLat - lH;
          const midLat = bLat + lH * 0.5;

          for (let ci = 0; ci < chars.length; ci++) {
            if (chars[ci] !== ' ') {
              const x0 = curLon;
              const x1 = curLon + lW / 3;
              const x2 = curLon + (2 * lW) / 3;
              const x3 = curLon + lW;

              const c1 = spatialIdx.countInBox(midLat, bLat + lH, x0, x1);
              const c2 = spatialIdx.countInBox(midLat, bLat + lH, x1, x2);
              const c3 = spatialIdx.countInBox(midLat, bLat + lH, x2, x3);
              const c4 = spatialIdx.countInBox(bLat, midLat, x0, x1);
              const c5 = spatialIdx.countInBox(bLat, midLat, x1, x2);
              const c6 = spatialIdx.countInBox(bLat, midLat, x2, x3);

              const lCnt = c1 + c2 + c3 + c4 + c5 + c6;
              const cMin = Math.min(c1, c2, c3, c4, c5, c6);
              if (cMin < minCellCnt) minCellCnt = cMin;
              if (lCnt < minLetterCnt) minLetterCnt = lCnt;
              sumLog += Math.log(1 + lCnt);
              letterCount++;

              if (ci < chars.length - 1 && chars[ci + 1] !== ' ') {
                const gapCnt = spatialIdx.countInBox(bLat, bLat + lH, curLon + lW * 0.85, curLon + lW + gW + lW * 0.15);
                if (gapCnt < minGapCnt) minGapCnt = gapCnt;
              }
            }
            curLon += lW + gW;
          }
          curLat -= (lH + gH);
        }

        if (letterCount === 0) continue;
        if (minGapCnt === Infinity) minGapCnt = minLetterCnt;

        const avgLog = sumLog / letterCount;
        const shiftNorm = Math.hypot((cLat - mapCenter[0]) / availH, (cLon - mapCenter[1]) / availW);
        const distPenalty = 0.6 * shiftNorm;
        const scaleBonus = sc * 1.2;
        const voidPenalty = (minLetterCnt < 8 ? -15 : 0) + (minCellCnt === 0 ? -8 : 0) + (minGapCnt === 0 ? -6 : 0);
        const score = avgLog + 2.0 * Math.log(1 + minLetterCnt) + 1.8 * Math.log(1 + minCellCnt) + 1.0 * Math.log(1 + minGapCnt) + scaleBonus + voidPenalty - distPenalty;

        if (minLetterCnt >= 10 && minCellCnt >= 1 && minGapCnt >= 1) scaleHadCleanFit = true;
        if (score > bestScore) {
          bestScore = score;
          bestCenter = [cLat, cLon];
          bestSize = sz;
        }
      }
    }
    if (scaleHadCleanFit) break;
  }

  return { center: bestCenter, letterSizeMeters: bestSize };
}

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

  const rawText = text;
  const lines = rawText
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/♥/g, '♡')
    .toUpperCase()
    .replace(/[^A-Z0-9\u30A0-\u30F6\u30FC\u30F3!?♡ \n]/g, '').split('\n');

  const dLatPerMeter = 1 / 111320;
  const dLonPerMeter = 1 / (111320 * Math.cos(mapCenter[0] * Math.PI / 180));
  const cellMeters = Math.max(80, Math.min(160, letterSizeMeters / 6));
  const spatialIdx = createSpatialIndex(nodes, cellMeters * dLatPerMeter, cellMeters * dLonPerMeter);

  const isOpening = (text === 'ROAD\nTRACER');
  if (!isOpening && nodes.size > 0) {
    const opt = findOptimalBlockLayout(lines, mapCenter, letterSizeMeters, spatialIdx);
    mapCenter = opt.center;
    letterSizeMeters = opt.letterSizeMeters;
  }

  const letterH = letterSizeMeters * dLatPerMeter;
  const letterW = letterSizeMeters * dLonPerMeter;
  const gapW = letterW * 0.3; // Space between letters
  const gapH = letterH * 0.5; // Space between lines

  // ─── 川・公園・道なしで失敗した文字の「ずらして再挑戦」用の補助 ───
  const RETRY_QUALITY = 0.14;
  const RETRY_SHIFT_X = [-0.65, -0.45, -0.3, -0.15, 0, 0.15, 0.3, 0.45, 0.65];
  const RETRY_EDGE_SHIFT = 0.65;
  const RETRY_INNER_SHIFT = 0.22;
  const RETRY_SHIFT_Y = [-0.35, -0.18, 0, 0.18, 0.35];

  const nearestGap = (lat, lon) => {
    const n = spatialIdx.findClosest(lat, lon, 4);
    if (!n) return 0.6;
    return Math.min(0.6, Math.hypot((n.lat - lat) / letterH, (n.lon - lon) / letterW));
  };

  const roadGapScore = (tpl, bbox) => {
    let sum = 0, maxG = 0, cnt = 0;
    for (const stroke of tpl) {
      if (!stroke) continue;
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i];
        if (!p || p.length < 2) continue;
        const g1 = nearestGap(bbox.maxLat - p[1] * letterH, bbox.minLon + p[0] * letterW);
        sum += g1;
        if (g1 > maxG) maxG = g1;
        cnt++;
        const q = stroke[i + 1];
        if (q && q.length >= 2) {
          const g2 = nearestGap(
            bbox.maxLat - ((p[1] + q[1]) / 2) * letterH,
            bbox.minLon + ((p[0] + q[0]) / 2) * letterW
          );
          sum += g2;
          if (g2 > maxG) maxG = g2;
          cnt++;
        }
      }
    }
    return cnt > 0 ? (sum / cnt + maxG * 0.5) : 0;
  };

  // Calculate total height to center vertically
  const totalH = (lines.length * letterH) + ((lines.length - 1) * gapH);
  let currentLat = mapCenter[0] + (totalH / 2);

  let prevCharEnd = null;
  let prevCharBBox = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    prevCharEnd = null;
    prevCharBBox = null;

    if (!line.trim()) {
      currentLat -= (letterH + gapH);
      continue;
    }

    const chars = line.split('');
    const totalW = (chars.length * letterW) + ((chars.length - 1) * gapW);
    let currentLon = mapCenter[1] - (totalW / 2);
    let baseLat = currentLat - letterH;

    if (isOpening) {
      if (lineIndex === 0) {
        baseLat = mapCenter[0] - (letterH / 2);
      } else {
        baseLat = (mapCenter[0] - (letterH / 2)) - (lineIndex * (letterH + gapH));
      }
    }

    for (let charIdx = 0; charIdx < chars.length; charIdx++) {
      const char = chars[charIdx];
      if (char === ' ') {
        currentLon += letterW + gapW;
        prevCharEnd = null;
        prevCharBBox = null;
        continue;
      }

      let template = TEMPLATES[char] || TEMPLATES['O'];
      if (isOpening && lineIndex === 1 && char === 'T') {
        template = [
          [
            [0.0, 0.0],
            [0.75, 0.0],
            [1.0, 0.3],
            [0.4, 0.0],
            [0.4, 0.85],
            [0.6, 1.0]
          ]
        ];
      }

      if (isOpening && lineIndex === 0 && char === 'R') {
        template = [
          [
            [0.25, 0.9],
            [0.25, 0.2],
            [0.4, 0.2],
            [0.4, 0.0],
            [0.85, 0.0],
            [0.85, 0.45],
            [0.15, 0.5],
            [0.6, 0.5],
            [0.65, 0.9],
            [0.85, 0.9]
          ]
        ];
      }

      let tplMinX = 1, tplMaxX = 0, tplMinY = 1, tplMaxY = 0;
      for (const s of template) {
        for (const p of s) {
          if (p[0] < tplMinX) tplMinX = p[0];
          if (p[0] > tplMaxX) tplMaxX = p[0];
          if (p[1] < tplMinY) tplMinY = p[1];
          if (p[1] > tplMaxY) tplMaxY = p[1];
        }
      }
      const tplSpanX = tplMaxX - tplMinX;
      const tplSpanY = tplMaxY - tplMinY;

      const baseBBox = {
        minLat: baseLat,
        maxLat: baseLat + letterH,
        minLon: currentLon,
        maxLon: currentLon + letterW
      };

      const traceLetterAt = (bbox) => {
        const paths = [];
        let fLat = null, fLon = null;
        let lLat = null, lLon = null;
        let errSum = 0, errCnt = 0, errMax = 0;
        let drawnMinLa = Infinity, drawnMaxLa = -Infinity;
        let drawnMinLo = Infinity, drawnMaxLo = -Infinity;
        let ptCount = 0;

        const allowedBBox = isOpening ? null : {
          minLat: bbox.minLat - letterH * 0.16,
          maxLat: bbox.maxLat + letterH * 0.16,
          minLon: bbox.minLon - letterW * 0.16,
          maxLon: bbox.maxLon + letterW * 0.16
        };

        for (const stroke of template) {
          if (!stroke || stroke.length < 2) continue;
          let currentPath = [];

          for (let i = 0; i < stroke.length - 1; i++) {
            const p1 = stroke[i];
            const p2 = stroke[i + 1];
            if (!p1 || !p2 || p1.length < 2 || p2.length < 2) continue;

            const startLat = bbox.maxLat - (p1[1] * letterH);
            const startLon = bbox.minLon + (p1[0] * letterW);
            const endLat = bbox.maxLat - (p2[1] * letterH);
            const endLon = bbox.minLon + (p2[0] * letterW);

            if (fLat === null) {
              fLat = startLat;
              fLon = startLon;
            }

            const roadSegment = walkStroke(startLat, startLon, endLat, endLon, graph, spatialIdx, allowedBBox);

            if (roadSegment.length > 0) {
              const rs0 = roadSegment[0];
              const rs1 = roadSegment[roadSegment.length - 1];
              let maxDev = 0;
              for (let k = 0; k < roadSegment.length; k++) {
                const rp = roadSegment[k];
                if (rp[0] < drawnMinLa) drawnMinLa = rp[0];
                if (rp[0] > drawnMaxLa) drawnMaxLa = rp[0];
                if (rp[1] < drawnMinLo) drawnMinLo = rp[1];
                if (rp[1] > drawnMaxLo) drawnMaxLo = rp[1];
                ptCount++;
                const dev = pointToLineDist(rp[0], rp[1], startLat, startLon, endLat, endLon) / letterH;
                if (dev > maxDev) maxDev = dev;
              }
              const endErr = Math.max(
                Math.hypot((rs0[0] - startLat) / letterH, (rs0[1] - startLon) / letterW),
                Math.hypot((rs1[0] - endLat) / letterH, (rs1[1] - endLon) / letterW)
              );
              const segErr = endErr + Math.max(0, maxDev - 0.12) * 0.6;
              errSum += segErr;
              if (segErr > errMax) errMax = segErr;
              errCnt++;

              if (currentPath.length > 0) {
                const prevEnd = currentPath[currentPath.length - 1];
                const nextStart = roadSegment[0];
                if (prevEnd[0] === nextStart[0] && prevEnd[1] === nextStart[1]) {
                  currentPath.push(...roadSegment.slice(1));
                } else {
                  const connector = walkStroke(prevEnd[0], prevEnd[1], nextStart[0], nextStart[1], graph, spatialIdx, allowedBBox);
                  if (isOpening || (connector.length > 0 && connector.length < 18)) {
                    if (connector.length > 0) currentPath.push(...connector.slice(1));
                    currentPath.push(...roadSegment.slice(1));
                  } else {
                    paths.push(currentPath);
                    currentPath = roadSegment;
                  }
                }
              } else {
                currentPath = roadSegment;
              }
              lLat = roadSegment[roadSegment.length - 1][0];
              lLon = roadSegment[roadSegment.length - 1][1];
            } else {
              errSum += 1;
              errMax = 1;
              errCnt++;
            }
          }
          if (currentPath.length > 0) paths.push(currentPath);
        }

        let spanPenalty = 0;
        if (ptCount >= 2) {
          const drawnW = (drawnMaxLo - drawnMinLo) / letterW;
          const drawnH = (drawnMaxLa - drawnMinLa) / letterH;
          if (tplSpanX > 0.35 && drawnW < tplSpanX * 0.65) spanPenalty += (tplSpanX * 0.65 - drawnW);
          if (tplSpanY > 0.35 && drawnH < tplSpanY * 0.65) spanPenalty += (tplSpanY * 0.65 - drawnH);
        } else {
          spanPenalty = 1.0;
        }

        return {
          strokePaths: paths,
          firstPointLat: fLat,
          firstPointLon: fLon,
          lastPointLat: lLat,
          lastPointLon: lLon,
          quality: (errCnt > 0 ? (errSum / errCnt + errMax) / 2 : 1) + spanPenalty
        };
      };

      let charBBox = baseBBox;
      let traced = traceLetterAt(charBBox);
      if (!isOpening && traced.quality > RETRY_QUALITY) {
        const cands = [];
        const isLineStart = charIdx === 0 || chars[charIdx - 1] === ' ';
        const isLineEnd = charIdx === chars.length - 1 || chars[charIdx + 1] === ' ';
        const maxLeft = isLineStart ? RETRY_EDGE_SHIFT : RETRY_INNER_SHIFT;
        const maxRight = isLineEnd ? RETRY_EDGE_SHIFT : RETRY_INNER_SHIFT;

        for (const sy of RETRY_SHIFT_Y) {
          for (const sx of RETRY_SHIFT_X) {
            if (sx === 0 && sy === 0) continue;
            if (sx < -maxLeft - 1e-9 || sx > maxRight + 1e-9) continue;
            const bb = {
              minLat: baseBBox.minLat - sy * letterH,
              maxLat: baseBBox.maxLat - sy * letterH,
              minLon: baseBBox.minLon + sx * letterW,
              maxLon: baseBBox.maxLon + sx * letterW
            };
            cands.push({ bb, gap: roadGapScore(template, bb) + 0.025 * (Math.abs(sx) + Math.abs(sy)) });
          }
        }
        cands.sort((x, y) => x.gap - y.gap);
        for (const c of cands.slice(0, 6)) {
          const t = traceLetterAt(c.bb);
          if (t.quality < traced.quality) {
            traced = t;
            charBBox = c.bb;
          }
          if (traced.quality <= RETRY_QUALITY * 0.85) break;
        }
      }
      const { strokePaths, firstPointLat, firstPointLon, lastPointLat, lastPointLon } = traced;

      if (connectLetters && prevCharEnd && firstPointLat !== null && prevCharBBox) {
        const exitLat = prevCharBBox.maxLat - (letterH * 0.8);
        const exitLon = prevCharBBox.maxLon;
        const entryLat = charBBox.maxLat - (letterH * 0.8);
        const entryLon = charBBox.minLon;

        const bridge1 = walkStroke(prevCharEnd[0], prevCharEnd[1], exitLat, exitLon, graph, spatialIdx);
        const bridge2 = walkStroke(exitLat, exitLon, entryLat, entryLon, graph, spatialIdx);
        const bridge3 = walkStroke(entryLat, entryLon, firstPointLat, firstPointLon, graph, spatialIdx);

        const b1End = bridge1[bridge1.length - 1];
        const b2End = bridge2[bridge2.length - 1];
        const b3End = bridge3[bridge3.length - 1];

        const d1 = b1End ? distance(b1End[0], b1End[1], exitLat, exitLon) : Infinity;
        const d2 = b2End ? distance(b2End[0], b2End[1], entryLat, entryLon) : Infinity;
        const d3 = b3End ? distance(b3End[0], b3End[1], firstPointLat, firstPointLon) : Infinity;

        if (d1 < 0.0005 && d2 < 0.0005 && d3 < 0.0005) {
          if (bridge3.length > 0) strokePaths.unshift(bridge3);
          if (bridge2.length > 0) strokePaths.unshift(bridge2);
          if (bridge1.length > 0) strokePaths.unshift(bridge1);
        }
      }

      if (lastPointLat !== null) {
        prevCharEnd = [lastPointLat, lastPointLon];
        prevCharBBox = charBBox;
      }

      resultPaths.push({ char, paths: strokePaths, bbox: charBBox });
      currentLon += letterW + gapW;
    }

    currentLat -= (letterH + gapH);
  }

  return resultPaths;
}

global.RoadTracer = { traceText };

})(window);
