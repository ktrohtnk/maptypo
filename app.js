/**
 * app.js – Road Letter Tracer UI & Animation
 */
'use strict';

let map = null;
let drawnLayers = [];
let lastTraceResults = null;
let lastTextColorHex = null;
let lastIsRandomColor = false;
let lastLoc = null;
let lastAddressEn = "";
let currentAnimationId = 0;


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
  // Google Maps APIが非同期で読み込まれるのを確実に待つ
  const waitForGoogle = setInterval(() => {
    if (window.google && window.google.maps && window.google.maps.Map) {
      clearInterval(waitForGoogle);
      startTrace();
    }
  }, 100);
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
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RoadTracer/1.0' } });
    return await res.json();
  };

  let data = await fetchGeocode(address);
  
  if ((!data || data.length === 0) && address.includes('区')) {
    const fallback = address.replace(/.*区/, '').trim();
    if (fallback) data = await fetchGeocode(fallback);
  }
  
  if ((!data || data.length === 0) && address.includes('市') && !address.includes(' ')) {
    const fallback2 = address.replace('市', '市 ');
    data = await fetchGeocode(fallback2);
  }

  if (!data || !data.length) throw new Error('住所が見つかりません');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
}


async function fetchRoads(lat, lon, radiusM) {
  // Overpass APIの安定性とデータ精度のバランスを取るため、最大半径を3500m（7km四方）に設定
  const safeRadius = Math.min(radiusM, 3500);
  
  // ユーザーの強い要望により、「どんなに広範囲（長文）であっても絶対に文字の精度を落とさない」ため、
  // 路地裏（service, living_street, track）や歩道を常に全取得します。（処理時間はかかりますが精度は最高になります）
  const highwayTypes = "^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|pedestrian|footway|path|service|living_street|track)$";

  const dLat = safeRadius / 111320, dLon = safeRadius / (111320 * Math.cos(lat * Math.PI / 180));
  const query = `[out:json][timeout:60];way["highway"~"${highwayTypes}"](${lat-dLat},${lon-dLon},${lat+dLat},${lon+dLon});out geom;`;
  
  // FOSS4G JapanサーバーのSSL証明書が期限切れでブラウザ通信が強制遮断されるため、
  // 一時的にグローバルサーバーのみを使用し、重いクエリに耐えられるようタイムアウトを60秒に延長
  const endpoints = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  
  const controller = new AbortController();
  try {
    const promises = endpoints.map(async (url) => {
      const res = await fetch(url, { 
        method: 'POST', 
        body: 'data=' + encodeURIComponent(query),
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const json = await res.json();
      // データが空の場合はエラーとして投げ、Promise.anyに他のサーバーを待たせる
      if (!json.elements || json.elements.length === 0) throw new Error('Empty Data');
      
      const ways = json.elements.map(el => (el.geometry || []).map(p => [p.lat, p.lon])).filter(w => w.length >= 2);
      if (ways.length === 0) throw new Error('No valid ways');
      return ways;
    });

    // 最初に成功した通信結果を受け取る
    const result = await Promise.any(promises);
    controller.abort(); // 負けた他のサーバーへの通信は即座にキャンセルして負荷を下げる
    return result;
  } catch (e) {
    throw new Error('現在、世界の地図サーバー全体が大変混雑しており、データが取得できませんでした。少し時間をおいて再度お試しください。');
  }
}

const MAP_STYLE_LIGHT = [
  // 1. 全体を完全モノクロ化（彩度ゼロ）
  { featureType: "all", stylers: [{ saturation: -100 }] },
  
  // 2. あらゆるアイコン（号線標識、ピンなど）を「すべて完全に非表示」にする
  { featureType: "all", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  
  // 3. お店などのPOIテキストを非表示
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  
  // 4. ベースカラー (起伏を完全に消し去ったフラットなソリッドカラー)
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#E0E0E0" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#D0D0D0" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#D4D4D4" }] },
  
  // 5. 道を「純白」にしつつ、すべての道に「極薄グレーの縁取り」をつける
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#D8D8D8" }, { weight: 1 }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#CCCCCC" }, { weight: 1 }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#C0C0C0" }, { weight: 1.5 }] },
  
  // 6. 文字（指定の美しいブルーグレー）
  { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#b4bcbf" }] },
  { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#FFFFFF" }, { weight: 3 }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  
  // 7. 線路非表示
  { featureType: "transit.line", elementType: "geometry", stylers: [{ visibility: "off" }] }
];

const MAP_STYLE_DARK = [
  { featureType: "all", stylers: [{ saturation: -100 }] },
  { featureType: "all", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#222222" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#888888" }] },
  { featureType: "all", elementType: "labels.text.stroke", stylers: [{ color: "#222222" }, { weight: 3 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#111111" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1A1A1A" }] },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#111111" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#1A1A1A" }, { weight: 1 }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#282828" }, { weight: 1 }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ visibility: "on" }, { color: "#333333" }, { weight: 1.5 }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] }
];

function initMap(lat, lon, zoom) {
  const currentStyle = MAP_STYLE_LIGHT;

  if (!map) {
    map = new google.maps.Map(document.getElementById('map'), {
      center: { lat: lat, lng: lon },
      zoom: zoom,
      styles: currentStyle, // プログラムで強制的にスタイルを上書き！
      disableDefaultUI: true,
      fullscreenControl: false,
      zoomControl: true,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_BOTTOM
      }
    });
  } else {
    map.setCenter({ lat: lat, lng: lon });
    map.setZoom(zoom);
    map.setOptions({ styles: currentStyle }); // テーマ変更時に地図の色も変える
  }
}

function clearMap() {
  drawnLayers.forEach(l => l.setMap(null));
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
  const letterSize = parseInt(document.getElementById('size-select')?.value || '500');
  const textColorHex = document.getElementById('color-picker')?.value || '#00FF00';
  const checkbox = document.getElementById('random-color-checkbox');
  const isRandomColor = checkbox ? checkbox.checked : true;

  if (!address || !text) return alert('場所と文字を入力してください');

  // キャッシュキーの作成（住所・文字・サイズ・色が同じならキャッシュを使う）
  const cacheKey = `maptypo_cache_v21_${btoa(unescape(encodeURIComponent(address + text + letterSize + textColorHex + isRandomColor)))}`;
  const cached = localStorage.getItem(cacheKey);

  if (cached) {
    try {
      const { loc, zoom, traceResults } = JSON.parse(cached);
      
      let cameraLat = loc.lat;
      if (address === '福岡市 薬院' && text === 'ROAD\nTRACER') {
        cameraLat = loc.lat - 0.0025;
      }
      initMap(cameraLat, loc.lon, zoom);
      setStatus('Trace loaded from cache...', 90);
      
      // ダウンロード用に保存
      lastTraceResults = traceResults;
      lastTextColorHex = textColorHex;
      lastIsRandomColor = isRandomColor;
      lastLoc = loc;
      
      lastAddressEn = address;
      if (address === '福岡市 薬院' && text === 'ROAD\nTRACER') {
        lastAddressEn = "Yakuin, Fukuoka, Japan";
      } else {
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lon}&format=json&accept-language=en`)
          .then(r => r.json())
          .then(d => {
            if (d && d.address) {
              const parts = [];
              if (d.address.suburb) parts.push(d.address.suburb);
              if (d.address.city || d.address.city_district || d.address.town || d.address.village) {
                parts.push(d.address.city || d.address.city_district || d.address.town || d.address.village);
              }
              if (d.address.country) parts.push(d.address.country);
              if (parts.length > 0) lastAddressEn = parts.join(', ');
            }
          }).catch(e => console.log('Reverse geocoding failed', e));
      }
      
      currentAnimationId++;
      const myAnimationId = currentAnimationId;
      await animateDrawing(traceResults, textColorHex, isRandomColor, myAnimationId);
      
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
    // オープニングは毎回APIを叩かず、超軽量に最適化されたローカルキャッシュから一瞬で読み込む
    if (address === '福岡市 薬院' && text === 'ROAD\nTRACER') {
      setStatus('Loading ultra-lightweight map data...', 20);
      try {
        const res = await fetch('fukuoka_yakuin_optimized.json');
        if (!res.ok) throw new Error('File not found');
        const data = await res.json();
        loc = { lat: 33.5835, lon: 130.3985655 }; // 薬院南公園を避けてさらに北へずらす
        ways = data.ways;
      } catch (e) {
        console.warn('Local data not found, falling back to API', e);
        loc = await geocode(address);
      }
    } else {
      loc = await geocode(address);
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
    let cameraLat = loc.lat;
    if (address === '福岡市 薬院' && text === 'ROAD\nTRACER') {
      // カメラを南にずらして、文字（ROAD）が画面の「もっと上」に見えるようにする
      cameraLat = loc.lat - 0.0025; 
    }
    initMap(cameraLat, loc.lon, zoom);

    if (!ways) {
      setStatus('Fetching road network...', 40);
      const fetchRadius = Math.max(800, requiredSize / 2 + 300); // 最小範囲を小さくして超高速化
      ways = await fetchRoads(loc.lat, loc.lon, fetchRadius);
    }

    if (ways.length === 0) throw new Error('道路データが取得できませんでした');

    setStatus('Mapping typography...', 70);
    // Use the potentially scaled-down actualLetterSize to prevent overlapping
    const isConnected = false; // "Normal" mode only
    const traceResults = RoadTracer.traceText(text, [loc.lat, loc.lon], actualLetterSize, ways, isConnected);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ loc, zoom, traceResults }));
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }

    setStatus('Rendering trace...', 90);
    
    // Animate the drawing
    lastTraceResults = traceResults;
    lastTextColorHex = textColorHex;
    lastIsRandomColor = isRandomColor;
    lastLoc = loc;
    
    // SVGのクレジット用に英語住所をバックグラウンド取得
    lastAddressEn = address; // fallback
    if (address === '福岡市 薬院' && text === 'ROAD\nTRACER') {
      lastAddressEn = "Yakuin, Fukuoka, Japan";
    } else {
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${loc.lat}&lon=${loc.lon}&format=json&accept-language=en`)
        .then(r => r.json())
        .then(d => {
          if (d && d.address) {
            const parts = [];
            if (d.address.suburb) parts.push(d.address.suburb);
            if (d.address.city || d.address.city_district || d.address.town || d.address.village) {
              parts.push(d.address.city || d.address.city_district || d.address.town || d.address.village);
            }
            if (d.address.country) parts.push(d.address.country);
            if (parts.length > 0) lastAddressEn = parts.join(', ');
          }
        }).catch(e => console.log('Reverse geocoding failed', e));
    }
    
    currentAnimationId++;
    const myAnimationId = currentAnimationId;
    await animateDrawing(traceResults, textColorHex, isRandomColor, myAnimationId);

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

function hexToHSL(H) {
  let r = 0, g = 0, b = 0;
  if (H.length == 7) {
    r = parseInt(H.substring(1,3), 16);
    g = parseInt(H.substring(3,5), 16);
    b = parseInt(H.substring(5,7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  let cmin = Math.min(r,g,b), cmax = Math.max(r,g,b), delta = cmax - cmin, h = 0, s = 0, l = 0;
  if (delta == 0) h = 0;
  else if (cmax == r) h = ((g - b) / delta) % 6;
  else if (cmax == g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  l = (cmax + cmin) / 2;
  s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);
  return { h, s, l };
}

async function animateDrawing(traceResults, textColorHex, isRandomColor, animationId) {
  let shadowColor = '#000000'; 
  let shadowOpacity = 0.15;
  
  const baseHsl = hexToHSL(textColorHex);
  // Ensure we have enough saturation and a reasonable lightness for random colors to be visible
  let randS = baseHsl.s < 30 ? 70 : baseHsl.s;
  let randL = baseHsl.l;
  if (baseHsl.s < 30) {
    if (randL < 20) randL = 40; // If they picked black, make random colors visible
    if (randL > 80) randL = 60; // If they picked white
  }

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
    const bounds = new google.maps.LatLngBounds();
    allLatLngs.forEach(ll => bounds.extend({lat: ll[0], lng: ll[1]}));
    const padding = window.innerWidth < 600 ? 20 : 80;
    map.fitBounds(bounds, padding);
    // カメラの移動完了を待つ
    await new Promise(r => setTimeout(r, 1500));
  }

  // 3. 座標マトリックスエフェクト (文字描画と同時に表示・シャッフル開始)
  const matrixOverlay = document.getElementById('matrix-overlay');
  const matrixLat = document.getElementById('matrix-lat');
  const matrixLon = document.getElementById('matrix-lon');
  
  let matrixInterval = null;
  if (matrixOverlay && allLatLngs.length > 0) {
    matrixOverlay.classList.remove('hidden');
    matrixLat.classList.remove('resolved');
    matrixLon.classList.remove('resolved');
    
    const bounds = new google.maps.LatLngBounds();
    allLatLngs.forEach(ll => bounds.extend({lat: ll[0], lng: ll[1]}));
    const centerBounds = bounds.getCenter();
    
    matrixInterval = setInterval(() => {
      if (animationId !== currentAnimationId) {
        clearInterval(matrixInterval);
        matrixOverlay.classList.add('hidden');
        return;
      }
      const rLat = (centerBounds.lat() + (Math.random() - 0.5) * 10).toFixed(4);
      const rLon = (centerBounds.lng() + (Math.random() - 0.5) * 10).toFixed(4);
      matrixLat.textContent = `LAT: ${rLat}`;
      matrixLon.textContent = `LON: ${rLon}`;
    }, 50);
  }

  // 2. アニメーション描画ループ
  for (const result of traceResults) {
    if (animationId !== currentAnimationId) return; // Abort if cancelled
    
    let color = textColorHex;
    if (isRandomColor) {
      const randH = Math.floor(Math.random() * 360);
      color = `hsl(${randH}, ${randS}%, ${randL}%)`;
    }
    colorIdx++;

    for (const path of result.paths) {
      if (animationId !== currentAnimationId) return; // Abort if cancelled

      // Strongly sanitize the path to ensure we have clean numbers
      const validPath = path
        .filter(p => Array.isArray(p) && p.length >= 2 && p[0] != null && p[1] != null && !isNaN(p[0]) && !isNaN(p[1]))
        .map(p => ({lat: Number(p[0]), lng: Number(p[1])}));

      if (validPath.length < 2) continue;

      // Draw background shadow (slightly thicker as requested)
      const shadow = new google.maps.Polyline({
        path: validPath.map(pt => new google.maps.LatLng(pt.lat, pt.lng)),
        strokeColor: shadowColor,
        strokeWeight: 12, // 14から少し細くして12に
        strokeOpacity: shadowOpacity,
        geodesic: false,
        zIndex: 1,
        map: map
      });
      drawnLayers.push(shadow);

      // Draw animated stroke
      const poly = new google.maps.Polyline({
        path: [new google.maps.LatLng(validPath[0].lat, validPath[0].lng)], // Start with the first point
        strokeColor: color,
        strokeWeight: 6,
        strokeOpacity: 1.0,
        geodesic: false,
        zIndex: 2,
        map: map
      });
      drawnLayers.push(poly);

      // Animate the line drawing by adding points progressively
      await new Promise(resolve => {
        let ptIdx = 1;
        const totalPts = validPath.length;
        // Simulate a faster draw time (approx 6 frames)
        const ptsPerFrame = Math.max(1, Math.ceil(totalPts / 6));
        
        const drawInterval = setInterval(() => {
          if (animationId !== currentAnimationId) {
            clearInterval(drawInterval);
            return resolve();
          }
          const currentPath = poly.getPath();
          for (let k = 0; k < ptsPerFrame; k++) {
            if (ptIdx < totalPts) {
              const pt = validPath[ptIdx];
              currentPath.push(new google.maps.LatLng(pt.lat, pt.lng));
              ptIdx++;
            }
          }
          if (ptIdx >= totalPts) {
            clearInterval(drawInterval);
            resolve();
          }
        }, 12);
      });

      // Wait a bit before starting next stroke for writing effect
      await new Promise(r => setTimeout(r, 20)); 
    }
    // Pause between letters
    await new Promise(r => setTimeout(r, 30)); 
  }

  
  // 描画完了後に座標を確定
  if (matrixOverlay && allLatLngs.length > 0) {
    clearInterval(matrixInterval);
    const bounds = new google.maps.LatLngBounds();
    allLatLngs.forEach(ll => bounds.extend({lat: ll[0], lng: ll[1]}));
    const centerBounds = bounds.getCenter();
    matrixLat.textContent = `LAT: ${centerBounds.lat().toFixed(4)}`;
    matrixLon.textContent = `LON: ${centerBounds.lng().toFixed(4)}`;
    matrixLat.classList.add('resolved');
    matrixLon.classList.add('resolved');
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

function generateSVGString() {
  if (!lastTraceResults || lastTraceResults.length === 0) {
    return null;
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

  const padding = 0.002;
  minLat -= padding; maxLat += padding;
  minLon -= padding; maxLon += padding;

  const widthDeg = maxLon - minLon;
  const heightDeg = maxLat - minLat;
  const svgWidth = 800;
  const svgHeight = svgWidth * (heightDeg / widthDeg);

  const toX = (lon) => ((lon - minLon) / widthDeg) * svgWidth;
  const toY = (lat) => ((maxLat - lat) / heightDeg) * svgHeight;

  let bgColor = '#F5F5F0';
  
  const baseHsl = hexToHSL(lastTextColorHex || '#2a3b4c');
  let randS = baseHsl.s < 30 ? 70 : baseHsl.s;
  let randL = baseHsl.l;
  if (baseHsl.s < 30) {
    if (randL < 20) randL = 40;
    if (randL > 80) randL = 60;
  }

  let pathsSvg = '';
  for (const result of lastTraceResults) {
    let color = lastTextColorHex || '#2a3b4c';
    if (lastIsRandomColor) {
      const randH = Math.floor(Math.random() * 360);
      
      // Illustrator等との互換性のため、SVGのstrokeにはhsl()ではなくHexを使う
      const s = randS / 100;
      const l = randL / 100;
      const k = n => (n + randH / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
      const toHex = x => {
        const hex = Math.round(x * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      color = `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
    }
    
    for (const path of result.paths) {
      const points = path
        .filter(p => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]))
        .map(p => `${toX(p[1]).toFixed(1)},${toY(p[0]).toFixed(1)}`)
        .join(' ');
      if (!points) continue;
      pathsSvg += `  <polyline points="${points}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />\n`;
    }
  }

  // SVGにクレジット（住所・座標）を追加
  const latStr = lastLoc ? Math.abs(lastLoc.lat).toFixed(4) + '° ' + (lastLoc.lat >= 0 ? 'N' : 'S') : '';
  const lonStr = lastLoc ? Math.abs(lastLoc.lon).toFixed(4) + '° ' + (lastLoc.lon >= 0 ? 'E' : 'W') : '';
  const coordStr = latStr && lonStr ? `${latStr}, ${lonStr}` : '';
  const creditColor = '#888888';
  
  const creditSvg = `
  <g font-family="'Quicksand', sans-serif" font-weight="300" fill="${creditColor}" opacity="0.8">
    <text x="${svgWidth - 20}" y="${Math.round(svgHeight) - 20}" font-size="10" text-anchor="end" letter-spacing="0.5">${lastAddressEn} / ${coordStr}</text>
  </g>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${Math.round(svgHeight)}" viewBox="0 0 ${svgWidth} ${Math.round(svgHeight)}">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@300&amp;display=swap');
    </style>
  </defs>
  <rect width="100%" height="100%" fill="${bgColor}" />
${pathsSvg}${creditSvg}
</svg>`;

  return { svg, svgWidth, svgHeight: Math.round(svgHeight) };
}

function downloadSVG() {
  const data = generateSVGString();
  if (!data) return alert('先にGenerateで文字を描画してください');

  const blob = new Blob([data.svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'road-tracer.svg';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJPG() {
  const data = generateSVGString();
  if (!data) return alert('先にGenerateで文字を描画してください');

  const canvas = document.createElement('canvas');
  // 高解像度（Retina）対応のため2倍サイズで描画
  const scale = 2;
  canvas.width = data.svgWidth * scale;
  canvas.height = data.svgHeight * scale;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  const svgBlob = new Blob([data.svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  img.onload = () => {
    ctx.fillStyle = '#F5F5F0'; // fallback bgColor
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const jpgUrl = canvas.toDataURL('image/jpeg', 0.95);
    const a = document.createElement('a');
    a.href = jpgUrl;
    a.download = 'road-tracer.jpg';
    a.click();
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

window.startTrace = startTrace;
window.clearTrace = clearTrace;
window.downloadSVG = downloadSVG;
window.downloadJPG = downloadJPG;

// ----------------------------------------------------
// Location Autocomplete Logic (IP Priority)
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const locInput = document.getElementById('address-input');
  const suggestionsList = document.getElementById('location-suggestions');
  let debounceTimer;
  let userViewbox = '';

  if (!locInput || !suggestionsList) return;

  // 1. IPアドレスからユーザーの現在地（緯度経度）を取得し、検索の「優先エリア（ソフトバイアス）」として使う
  async function detectUserLocation() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (!res.ok) return;
      const data = await res.json();
      if (data.latitude && data.longitude) {
        const lat = data.latitude;
        const lon = data.longitude;
        // ユーザーの現在地周辺（約100km〜数百km四方）を優先エリアに設定
        userViewbox = `${lon - 2},${lat + 2},${lon + 2},${lat - 2}`;
        console.log('Set search priority viewbox based on IP:', userViewbox);
      }
    } catch (e) {
      console.warn('IP location detection blocked. Falling back to pure global search.');
    }
  }
  detectUserLocation();

  locInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    const val = e.target.value.trim();
    
    if (val.length < 2) {
      suggestionsList.classList.add('hidden');
      return;
    }
    
    debounceTimer = setTimeout(async () => {
      try {
        let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&limit=5&featuretype=settlement`;
        if (userViewbox) url += `&viewbox=${userViewbox}`;
        
        const res = await fetch(url, { headers: { 'User-Agent': 'RoadTracer/1.0' } });
        const data = await res.json();
        
        suggestionsList.innerHTML = '';
        if (data.length > 0) {
          data.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.display_name;
            li.addEventListener('click', () => {
              locInput.value = item.display_name;
              suggestionsList.classList.add('hidden');
            });
            suggestionsList.appendChild(li);
          });
          suggestionsList.classList.remove('hidden');
        } else {
          suggestionsList.classList.add('hidden');
        }
      } catch (e) {
        console.warn('Nominatim autocomplete error:', e);
      }
    }, 300);
  });

  // Hide suggestions when clicking outside
  document.addEventListener('click', (e) => {
    if (!locInput.contains(e.target) && !suggestionsList.contains(e.target)) {
      suggestionsList.classList.add('hidden');
    }
  });
});
