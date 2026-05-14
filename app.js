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
  
  // ページ読み込み完了時に自動的にプレビュー描画を開始する
  setTimeout(() => startTrace(), 500);
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
  // Overpass APIの安定性とデータ精度のバランスを取るため、最大半径を3500m（7km四方）に設定
  const safeRadius = Math.min(radiusM, 3500);
  
  // 精度低下（方眼が粗くなる）を防ぐため、常に生活道路（residential）を含める
  const highwayTypes = "^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$";

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

function initMap(lat, lon, zoom, theme) {
  if (!map) {
    map = L.map('map', { zoomControl: false }).setView([lat, lon], zoom);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
  } else {
    map.setView([lat, lon], zoom);
  }

  // 古い地図レイヤーを削除
  map.eachLayer(layer => {
    if (layer instanceof L.TileLayer) {
      map.removeLayer(layer);
    }
  });

  // テーマに合わせて地図の背景色（タイル）を変更
  const mapStyle = theme === 'cyberpunk' ? 'dark_all' : 'light_all';
  L.tileLayer(`https://{s}.basemaps.cartocdn.com/${mapStyle}/{z}/{x}/{y}{r}.png`, {
    attribution: '© OpenStreetMap & CARTO', maxZoom: 19
  }).addTo(map);
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
  const theme = document.getElementById('theme-select').value;
  const drawStyle = document.getElementById('style-select').value;

  if (!address || !text) return alert('場所と文字を入力してください');
  
  setBtn(true);
  try {
    setStatus('Searching location...', 10);
    const loc = await geocode(address);
    
    // キャンバス（地図データ）の取得範囲の安全上限
    const MAX_RADIUS = 3500; 

    // Adjust zoom and fetch radius based on true text block dimensions
    const lines = text.split('\n');
    const maxLineLen = Math.max(...lines.map(l => l.length));
    
    // 文字が取得範囲をはみ出さないように、必要に応じて文字サイズを自動縮小する
    let actualLetterSize = letterSize;
    let estimatedWidth = maxLineLen * actualLetterSize * 1.5;
    let estimatedHeight = lines.length * actualLetterSize * 1.5;
    
    // 半径（横幅/2 または 縦幅/2）がMAX_RADIUSを超える場合は縮小
    if (estimatedWidth / 2 > MAX_RADIUS || estimatedHeight / 2 > MAX_RADIUS) {
      const scaleW = (MAX_RADIUS * 2) / estimatedWidth;
      const scaleH = (MAX_RADIUS * 2) / estimatedHeight;
      actualLetterSize = actualLetterSize * Math.min(scaleW, scaleH) * 0.9; // 10%のマージンを持たせる
      
      // 再計算
      estimatedWidth = maxLineLen * actualLetterSize * 1.5;
      estimatedHeight = lines.length * actualLetterSize * 1.5;
    }

    const requiredSize = Math.max(estimatedWidth, estimatedHeight);
    
    let zoom = 14;
    if (requiredSize > 3000) zoom = 13;
    if (requiredSize > 5000) zoom = 12;
    initMap(loc.lat, loc.lon, zoom, theme);

    setStatus('Fetching road network...', 40);
    const fetchRadius = Math.max(2000, requiredSize / 2 + 500); // 描画範囲より少し広めに取得
    const ways = await fetchRoads(loc.lat, loc.lon, fetchRadius);

    if (ways.length === 0) throw new Error('道路データが取得できませんでした');

    setStatus('Mapping typography...', 70);
    // Use the potentially scaled-down actualLetterSize to prevent overlapping
    const isConnected = drawStyle === 'connected';
    const traceResults = RoadTracer.traceText(text, [loc.lat, loc.lon], actualLetterSize, ways, isConnected);

    setStatus('Rendering trace...', 90);
    
    // Animate the drawing
    await animateDrawing(traceResults, theme);

    setStatus('Trace complete.', 100);
    setTimeout(() => document.getElementById('status-bar').classList.add('hidden'), 3000);

  } catch (e) {
    console.error(e);
    // Display full stack trace to pinpoint the exact line of failure
    setStatus(`❌ エラー詳細: ${e.stack || e.message}`, 0);
  } finally {
    setBtn(false);
  }
}

async function animateDrawing(traceResults, theme) {
  let colors = ['#E24F33', '#1D1D1F', '#386641']; // Minimalist functional colors
  if (theme === 'cyberpunk') {
    colors = ['#ff2a6d', '#05d9e8', '#01ffc3']; // Cyberpunk neon colors
  } else if (theme === 'monochrome') {
    colors = ['#1D1D1F']; // Pure monochrome
  }
  
  const shadowColor = theme === 'cyberpunk' ? '#ffffff' : '#000000';
  const shadowOpacity = theme === 'cyberpunk' ? 0.1 : 0.2;
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
      const shadow = L.polyline(validPath, { color: shadowColor, weight: 10, opacity: shadowOpacity, lineCap: 'round', lineJoin: 'round' }).addTo(map);
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
        el.style.transition = 'stroke-dashoffset 0.4s ease-out';
        el.style.strokeDashoffset = '0';
        
        // アニメーション完了後にダッシュ設定を完全に解除（ズーム時の途切れを修正）
        setTimeout(() => {
          if (el && el.style) {
            el.style.strokeDasharray = '';
            el.style.strokeDashoffset = '';
            el.style.transition = '';
          }
        }, 500);
      }
      
      drawnLayers.push(poly);

      // Wait a bit before starting next stroke for writing effect
      await new Promise(r => setTimeout(r, 100)); // drastically reduced from 600ms
    }
    // Pause between letters
    await new Promise(r => setTimeout(r, 150)); // drastically reduced from 400ms
  }
}

window.startTrace = startTrace;
