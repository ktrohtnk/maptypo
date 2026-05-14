/**
 * app.js – Road Letter Tracer UI & Animation
 */
'use strict';

let map = null;
let drawnLayers = [];

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

document.addEventListener('DOMContentLoaded', () => {
  const handleEnter = e => { if (e.key === 'Enter' && !e.isComposing) startTrace(); };
  document.getElementById('address-input').addEventListener('keydown', handleEnter);
  document.getElementById('target-chars-input').addEventListener('keydown', handleEnter);
});

function setStatus(text, pct) {
  document.getElementById('status-bar').classList.remove('hidden');
  document.getElementById('status-text').textContent = text;
  document.getElementById('progress-fill').style.width = pct + '%';
}

function setBtn(loading) {
  document.getElementById('search-btn').disabled = loading;
  document.getElementById('search-btn-text').classList.toggle('hidden', loading);
  document.getElementById('search-spinner').classList.toggle('hidden', !loading);
}

async function geocode(address) {
  const fetchGeocode = async (q) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=jp`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RoadTracer/1.0' } });
    return await res.json();
  };

  let data = await fetchGeocode(address);
  
  // フォールバック: 「〜区」が含まれている場合、区より後ろだけで再検索
  if ((!data || data.length === 0) && address.includes('区')) {
    const fallback = address.replace(/.*区/, '').trim();
    if (fallback) data = await fetchGeocode(fallback);
  }
  
  // フォールバック2: 「市」と地名の間にスペースを入れる
  if ((!data || data.length === 0) && address.includes('市') && !address.includes(' ')) {
    const fallback2 = address.replace('市', '市 ');
    data = await fetchGeocode(fallback2);
  }

  if (!data || !data.length) throw new Error('住所が見つかりません（市や区の間にスペースを入れると見つかりやすいです）');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}

async function fetchRoads(lat, lon, radiusM) {
  // 安全のため、最大半径をさらに2000m（4km四方）に制限して確実なレスポンスを担保
  const safeRadius = Math.min(radiusM, 2000);
  
  // 動的LOD
  let highwayTypes = "^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$";
  if (safeRadius > 1500) {
    highwayTypes = "^(motorway|trunk|primary|secondary|tertiary)$";
  }

  const dLat = safeRadius / 111320, dLon = safeRadius / (111320 * Math.cos(lat * Math.PI / 180));
  const query = `[out:json][timeout:25];way["highway"~"${highwayTypes}"](${lat-dLat},${lon-dLon},${lat+dLat},${lon+dLon});out geom;`;
  
  // 複数のサーバーを順番に試し、IP制限やサーバーダウンを回避する
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query) });
      if (!res.ok) {
        console.warn(`Server ${url} returned ${res.status}`);
        continue; // エラーの場合は次のサーバーへ
      }
      const json = await res.json();
      return (json.elements || []).map(el => (el.geometry || []).map(p => [p.lat, p.lon])).filter(w => w.length >= 2);
    } catch (e) {
      console.warn(`Server ${url} failed to parse JSON:`, e);
      // 次のサーバーへ
    }
  }

  throw new Error('現在、世界の地図サーバー全体が大変混雑しており、データが取得できませんでした。3〜5分ほどお待ちいただいてから再度お試しください。');
}

function initMap(lat, lon, zoom) {
  if (!map) {
    map = L.map('map', { zoomControl: false }).setView([lat, lon], zoom);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap & CARTO', maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
  } else {
    map.setView([lat, lon], zoom);
  }
}

function clearMap() {
  drawnLayers.forEach(l => l.remove());
  drawnLayers = [];
}

async function startTrace() {
  const address = document.getElementById('address-input').value.trim();
  // \n（改行）を許可するように正規表現を変更
  const text = document.getElementById('target-chars-input').value.toUpperCase().replace(/[^A-Z0-9 \n]/g, '');
  const letterSize = parseInt(document.getElementById('size-select').value);

  if (!address || !text) return alert('場所と文字を入力してください');
  
  setBtn(true);
  try {
    setStatus('📍 場所を検索中...', 10);
    const loc = await geocode(address);
    
    // Adjust zoom and fetch radius based on true text block dimensions
    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(l => l.length));
    const estimatedWidth = maxLineLen * letterSize * 1.5;
    const estimatedHeight = lines.length * letterSize * 1.5;
    const requiredSize = Math.max(estimatedWidth, estimatedHeight);
    
    let zoom = 14;
    if (requiredSize > 5000) zoom = 12;
    if (requiredSize > 10000) zoom = 11;
    initMap(loc.lat, loc.lon, zoom);

    setStatus('🛣️ キャンバス(道路網)を準備中...', 40);
    const fetchRadius = Math.max(3000, requiredSize);
    const ways = await fetchRoads(loc.lat, loc.lon, fetchRadius);

    if (ways.length === 0) throw new Error('道路データが取得できませんでした');

    setStatus('🧠 ジェネレーティブ・トレース実行中...', 70);
    
    // Run the Generative Tracer (RoadWalker)
    const traceResults = RoadTracer.traceText(text, [loc.lat, loc.lon], letterSize, ways);

    setStatus('✨ 描画アニメーション...', 90);
    
    // Animate the drawing
    await animateDrawing(traceResults);

    setStatus('✅ 描画完了！', 100);
    setTimeout(() => document.getElementById('status-bar').classList.add('hidden'), 3000);

  } catch (e) {
    console.error(e);
    // Display full stack trace to pinpoint the exact line of failure
    setStatus(`❌ エラー詳細: ${e.stack || e.message}`, 0);
  } finally {
    setBtn(false);
  }
}

async function animateDrawing(traceResults) {
  const colors = ['#ff2a6d', '#05d9e8', '#01ffc3']; // Cyberpunk neon colors
  let colorIdx = 0;

  // 1. 全ての描画座標を収集し、カメラを完璧にフィットさせる（自動ズーム＆センタリング）
  const allLatLngs = [];
  traceResults.forEach(result => {
    result.paths.forEach(path => {
      path.forEach(p => {
        if (Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null && !isNaN(p[0]) && !isNaN(p[1])) {
          allLatLngs.push([Number(p[0]), Number(p[1])]);
        }
      });
    });
  });

  if (allLatLngs.length > 0) {
    // 描画範囲に合わせてカメラを滑らかに移動・ズーム
    map.fitBounds(L.latLngBounds(allLatLngs), { padding: [80, 80], animate: true, duration: 1.5 });
    // カメラの移動完了を待つ
    await new Promise(r => setTimeout(r, 1500));
  }

  // 2. アニメーション描画ループ
  for (const result of traceResults) {
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    for (const path of result.paths) {
      // Strongly sanitize the path to ensure Leaflet gets clean numbers
      const validPath = path
        .filter(p => Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null && !isNaN(p[0]) && !isNaN(p[1]))
        .map(p => [Number(p[0]), Number(p[1])]);

      if (validPath.length < 2) continue;

      // Draw background shadow
      const shadow = L.polyline(validPath, { color: '#000', weight: 10, opacity: 0.3, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      drawnLayers.push(shadow);

      // Draw animated stroke
      const poly = L.polyline(validPath, { 
        color: color, 
        weight: 6, 
        opacity: 0.9, 
        lineCap: 'round', 
        lineJoin: 'round'
      }).addTo(map);
      
      // Dynamic animation using SVG dash offset
      const el = poly.getElement();
      if (el) {
        const length = el.getTotalLength();
        el.style.strokeDasharray = length;
        el.style.strokeDashoffset = length;
        el.getBoundingClientRect(); // trigger reflow
        el.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
        el.style.strokeDashoffset = '0';
      }
      
      drawnLayers.push(poly);

      // Wait a bit before starting next stroke for writing effect
      await new Promise(r => setTimeout(r, 600));
    }
    // Pause between letters
    await new Promise(r => setTimeout(r, 400));
  }
}

window.startTrace = startTrace;
