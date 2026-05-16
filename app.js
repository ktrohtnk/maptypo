/**
 * app.js – Road Letter Tracer UI & Animation
 */
'use strict';

let map = null;
let drawnLayers = [];
let lastTraceResults = null;
let lastTheme = 'minimal';
let currentAnimationId = 0;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

document.addEventListener('DOMContentLoaded', () => {
  const handleEnter = e => { 
    // Ctrl+Enter または Cmd+Enter のみ実行し、通常のEnterは改行させる
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      startTrace(); 
    }
  };
  document.getElementById('address-input').addEventListener('keydown', handleEnter);
  document.getElementById('target-chars-input').addEventListener('keydown', handleEnter);
  
  // オープニング文字列をフォーカス時に自動消去する
  const addressInput = document.getElementById('address-input');
  const textInput = document.getElementById('target-chars-input');
  
  textInput.addEventListener('focus', function() {
    if (this.value.replace(/\r/g, '') === 'ROAD\nTRACER') {
      this.value = '';
      clearTrace();
    }
  });
  
  addressInput.addEventListener('focus', function() {
    if (this.value.replace(/\r/g, '') === '福岡市 薬院') {
      this.value = '';
      clearTrace();
    }
  });
  
  // 初期表示のデモアニメーション
  // 事前生成された軽量データを読み込むため、API負荷なしで爆速で完了します
  setTimeout(() => startTrace(), 100);
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

async function geocode(address, regionCode) {
  const fetchGeocode = async (q) => {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    if (regionCode) {
      url += `&countrycodes=${regionCode}`;
    }
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

  // data-theme属性をbodyに当ててCSSレベルでテーマを制御
  document.body.setAttribute('data-theme', theme);

  // テーマに合わせてタイルを追加（ソリッドカラーテーマはCSS側で非表示にする）
  const solidThemes = ['solid-blue', 'solid-pink', 'minimal-blue', 'minimal-pink'];
  if (!solidThemes.includes(theme)) {
    const mapStyle = (theme === 'cyberpunk') ? 'dark_all' : 'light_all';
    L.tileLayer(`https://{s}.basemaps.cartocdn.com/${mapStyle}/{z}/{x}/{y}{r}.png`, {
      attribution: '© OpenStreetMap & CARTO', maxZoom: 19
    }).addTo(map);
  }
}

function clearMap() {
  drawnLayers.forEach(l => l.remove());
  drawnLayers = [];
}

async function startTrace() {
  const address = document.getElementById('address-input').value.trim();
  // カタカナ・英数字・改行・スペースを許可
  const rawText = document.getElementById('target-chars-input').value;
  const text = rawText
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/♥/g, '♡')
    .toUpperCase()
    .replace(/[^A-Z0-9\u30A0-\u30F6\u30FC\u30F3!?♡ \n]/g, '');
  const letterSize = parseInt(document.getElementById('size-select').value);
  const theme = document.getElementById('theme-select').value;
  const drawStyle = document.getElementById('style-select').value;

  const regionCode = document.getElementById('region-select') ? document.getElementById('region-select').value : 'jp';

  if (!address || !text) return alert('場所と文字を入力してください');

  // キャッシュキーの作成（住所・文字・サイズ・スタイル・地域が同じならキャッシュを使う）
  const cacheKey = `maptypo_cache_v2_${btoa(unescape(encodeURIComponent(address + text + letterSize + drawStyle + regionCode)))}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const { loc, zoom, traceResults } = JSON.parse(cached);
      initMap(loc.lat, loc.lon, zoom, theme);
      setStatus('Trace loaded from cache...', 90);
      
      currentAnimationId++;
      const myAnimationId = currentAnimationId;
      await animateDrawing(traceResults, theme, myAnimationId);
      
      if (currentAnimationId === myAnimationId) {
        setStatus('Trace complete.', 100);
        setTimeout(() => document.getElementById('status-bar').classList.add('hidden'), 3000);
      }
      return;
    } catch (e) {
      console.warn('Cache parsing failed, fetching fresh data...', e);
    }
  }
  
  setBtn(true);
  try {
    setStatus('Searching location...', 10);
    
    let loc, ways;
    // デフォルトの薬院の初期表示はAPIを使わず超軽量・高速に読み込む
    if (address === '福岡市 薬院' && text === 'ROAD\nTRACER' && regionCode === 'jp') {
      setStatus('Loading ultra-lightweight map data...', 20);
      try {
        const res = await fetch('fukuoka_yakuin_optimized.json');
        if (!res.ok) throw new Error('File not found');
        const data = await res.json();
        loc = data.loc;
        ways = data.ways;
      } catch (e) {
        console.warn('Local data not found, falling back to API', e);
        loc = await geocode(address, regionCode);
      }
    } else {
      loc = await geocode(address, regionCode);
    }
    
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

    if (!ways) {
      setStatus('Fetching road network...', 40);
      const fetchRadius = Math.max(2000, requiredSize / 2 + 500); // 描画範囲より少し広めに取得
      ways = await fetchRoads(loc.lat, loc.lon, fetchRadius);
    }

    if (ways.length === 0) throw new Error('道路データが取得できませんでした');

    setStatus('Mapping typography...', 70);
    // Use the potentially scaled-down actualLetterSize to prevent overlapping
    const isConnected = drawStyle === 'connected';
    const traceResults = RoadTracer.traceText(text, [loc.lat, loc.lon], actualLetterSize, ways, isConnected);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ loc, zoom, traceResults }));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }

    setStatus('Rendering trace...', 90);
    
    // Animate the drawing
    lastTraceResults = traceResults;
    lastTheme = theme;
    currentAnimationId++;
    const myAnimationId = currentAnimationId;
    await animateDrawing(traceResults, theme, myAnimationId);

    if (currentAnimationId === myAnimationId) {
      setStatus('Trace complete.', 100);
      setTimeout(() => document.getElementById('status-bar').classList.add('hidden'), 3000);
    }

  } catch (e) {
    console.error(e);
    // Display full stack trace to pinpoint the exact line of failure
    setStatus(`❌ エラー詳細: ${e.stack || e.message}`, 0);
  } finally {
    setBtn(false);
  }
}

async function animateDrawing(traceResults, theme, animationId) {
  let colors;
  if (theme === 'line-blue') {
    colors = ['#1E90FF', '#005FCC']; // ブルーのライン（通常地図背景）
  } else if (theme === 'line-pink') {
    colors = ['#FF3EB5', '#CC0066']; // ピンクのライン（通常地図背景）
  } else if (theme === 'solid-blue' || theme === 'minimal-blue') {
    colors = ['#FFFFFF', '#E0E0E0']; // 青背景に白ライン
  } else if (theme === 'solid-pink' || theme === 'minimal-pink') {
    colors = ['#1D1D1F', '#333333']; // ピンク背景に黒ライン
  } else if (theme === 'map-blue') {
    colors = ['#FFFFFF', '#E8E8E8']; // 青地図に白ライン
  } else if (theme === 'cyberpunk') {
    colors = ['#ff2a6d', '#05d9e8', '#01ffc3'];
  } else if (theme === 'monochrome') {
    colors = ['#1D1D1F'];
  } else {
    colors = ['#1D1D1F', '#E24F33', '#386641']; // Minimal black
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
    if (animationId !== currentAnimationId) return; // Abort if cancelled
    
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    for (const path of result.paths) {
      if (animationId !== currentAnimationId) return; // Abort if cancelled

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
        el.style.transition = 'stroke-dashoffset 0.15s linear'; // スピードアップ
        el.style.strokeDashoffset = '0';
        
        // アニメーション完了後にダッシュ設定を完全に解除（ズーム時の途切れを修正）
        setTimeout(() => {
          if (el && el.style) {
            el.style.strokeDasharray = '';
            el.style.strokeDashoffset = '';
            el.style.transition = '';
          }
        }, 200);
      }
      
      drawnLayers.push(poly);

      // Wait a bit before starting next stroke for writing effect
      await new Promise(r => setTimeout(r, 40)); // 大幅に短縮 (100 -> 40)
    }
    // Pause between letters
    await new Promise(r => setTimeout(r, 60)); // 大幅に短縮 (150 -> 60)
  }

  // 3. 描画完了後の座標マトリックスエフェクト (Large Screen Overlay)
  const matrixOverlay = document.getElementById('matrix-overlay');
  const matrixLat = document.getElementById('matrix-lat');
  const matrixLon = document.getElementById('matrix-lon');
  
  if (matrixOverlay && allLatLngs.length > 0) {
    matrixOverlay.classList.remove('hidden');
    matrixLat.classList.remove('resolved');
    matrixLon.classList.remove('resolved');
    
    // Calculate center of the drawing
    const centerBounds = L.latLngBounds(allLatLngs).getCenter();
    const finalLat = centerBounds.lat.toFixed(4);
    const finalLon = centerBounds.lng.toFixed(4);
    
    let ticks = 0;
    const maxTicks = 20; // 1 second of shuffling
    const interval = setInterval(() => {
      if (animationId !== currentAnimationId) {
        clearInterval(interval);
        matrixOverlay.classList.add('hidden');
        return;
      }
      if (ticks >= maxTicks) {
        matrixLat.textContent = `LAT: ${finalLat}`;
        matrixLon.textContent = `LON: ${finalLon}`;
        matrixLat.classList.add('resolved');
        matrixLon.classList.add('resolved');
        clearInterval(interval);
      } else {
        // Shuffle numbers rapidly
        const rLat = (centerBounds.lat + (Math.random() - 0.5) * 10).toFixed(4);
        const rLon = (centerBounds.lng + (Math.random() - 0.5) * 10).toFixed(4);
        matrixLat.textContent = `LAT: ${rLat}`;
        matrixLon.textContent = `LON: ${rLon}`;
        ticks++;
      }
    }, 50);
  }
}

function clearTrace() {
  currentAnimationId++; // アニメーションを中断する
  clearMap();
  lastTraceResults = null;
  const matrixOverlay = document.getElementById('matrix-overlay');
  if (matrixOverlay) matrixOverlay.classList.add('hidden');

  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('maptypo_cache_')) {
      localStorage.removeItem(key);
    }
  });
  document.getElementById('status-bar').classList.add('hidden');
}

function downloadSVG() {
  if (!lastTraceResults || lastTraceResults.length === 0) {
    return alert('先にGenerateで文字を描画してください');
  }

  // 全座標からバウンディングボックスを計算
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const result of lastTraceResults) {
    for (const path of result.paths) {
      for (const p of path) {
        if (!Array.isArray(p) || p.length < 2 || isNaN(p[0]) || isNaN(p[1])) continue;
        minLat = Math.min(minLat, p[0]);
        maxLat = Math.max(maxLat, p[0]);
        minLon = Math.min(minLon, p[1]);
        maxLon = Math.max(maxLon, p[1]);
      }
    }
  }

  // 緯度経度をSVGのピクセル座標に変換するスケール
  const padding = 60;
  const svgWidth = 1200;
  const latRange = maxLat - minLat || 0.001;
  const lonRange = maxLon - minLon || 0.001;
  const scale = (svgWidth - padding * 2) / lonRange;
  const svgHeight = latRange * scale + padding * 2;

  const toX = lon => (lon - minLon) * scale + padding;
  const toY = lat => (maxLat - lat) * scale + padding; // lat is inverted

  // テーマに合わせた色
  let colors = ['#E24F33', '#1D1D1F', '#386641'];
  if (lastTheme === 'cyberpunk') colors = ['#ff2a6d', '#05d9e8', '#01ffc3'];
  else if (lastTheme === 'monochrome') colors = ['#1D1D1F'];
  const bgColor = lastTheme === 'cyberpunk' ? '#0d0d0d' : '#F5F5F0';

  let pathsSvg = '';
  let colorIdx = 0;
  for (const result of lastTraceResults) {
    const color = colors[colorIdx % colors.length];
    colorIdx++;
    for (const path of result.paths) {
      const points = path
        .filter(p => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))
        .map(p => `${toX(p[1]).toFixed(1)},${toY(p[0]).toFixed(1)}`)
        .join(' ');
      if (!points) continue;
      pathsSvg += `  <polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${Math.round(svgHeight)}" viewBox="0 0 ${svgWidth} ${Math.round(svgHeight)}">
  <rect width="100%" height="100%" fill="${bgColor}" />
${pathsSvg}</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'road-tracer.svg';
  a.click();
  URL.revokeObjectURL(url);
}

window.startTrace = startTrace;
window.clearTrace = clearTrace;
window.downloadSVG = downloadSVG;
