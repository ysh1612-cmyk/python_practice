/* ============================================================
   sim-ev.js — 무공해차 충전인프라 시뮬레이터
   산정근거:
     · 충전 전력수요 = 대수 × 연주행거리 ÷ 전비 ÷ 충전효율(0.90)
     · 온실가스 감축 = 내연차 배출 − 전기차 충전전력 배출
     · 입지 최적화 = 수요가중 K-Means 군집(Lloyd 알고리즘)
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO, EF = K.EF;

  let map = null, demandLayer = null, siteLayer = null, cells = [];
  const CENTER = [36.3504, 127.3845];   // 대전광역시청 기준
  const CHARGE_EFF = 0.90;              // 충전 효율

  /* 시간대별 충전부하 프로파일 (완속 야간 / 급속 주간) */
  const SLOW_PROFILE = [8,9,9,8,7,5,3,2,2,2,2,3,3,3,3,4,5,6,7,8,9,10,10,9];
  const FAST_PROFILE = [1,1,1,1,1,2,4,6,7,8,8,7,7,8,8,8,7,7,6,5,4,3,2,1];

  function calculate() {
    const n      = K.val('in-evn');
    const km     = K.val('in-km');
    const eff    = K.val('in-eff2');       // km/kWh
    const fastR  = K.val('in-fast')  / 100;
    const ratio  = K.val('in-ratio');
    const green  = K.val('in-green') / 100;

    // 연간 충전 전력수요 (kWh/년)
    const kwh = n * km / eff / CHARGE_EFF;

    // 충전기 소요량
    const chargers = Math.ceil(n / ratio);
    const fast = Math.round(chargers * fastR);
    const slow = chargers - fast;

    // 첨두 계약전력 (MW): 완속 7kW, 급속 100kW, 동시율 완속 0.35 / 급속 0.45
    const peakMW = (slow * 7 * 0.35 + fast * 100 * 0.45) / 1000;

    // 온실가스: 내연차(휘발유 12km/L 가정) vs 전기차
    const iceCO2 = n * km / 12 * EF.gasoline / 1000;                    // tCO2/년
    const evCO2  = kwh * (1 - green) * EF.elec / 1000;                  // tCO2/년
    const cut    = iceCO2 - evCO2;
    const cutRate = iceCO2 > 0 ? cut / iceCO2 * 100 : 0;

    // 시간대별 부하 (MW)
    const slowSum = SLOW_PROFILE.reduce(function (a, b) { return a + b; }, 0);
    const fastSum = FAST_PROFILE.reduce(function (a, b) { return a + b; }, 0);
    const dailyKwh = kwh / 365;
    const load = [];
    for (let h = 0; h < 24; h++) {
      const s = dailyKwh * (1 - fastR) * (SLOW_PROFILE[h] / slowSum);
      const f = dailyKwh * fastR * (FAST_PROFILE[h] / fastSum);
      load.push({ hour: h, slow: s / 1000, fast: f / 1000 });          // MWh/h ≈ MW
    }

    return {
      n: n, km: km, eff: eff, ratio: ratio, green: green * 100,
      kwh: kwh, gwh: kwh / 1e6, chargers: chargers, fast: fast, slow: slow,
      peakMW: peakMW, iceCO2: iceCO2, evCO2: evCO2, cut: cut, cutRate: cutRate,
      load: load,
      // 참고 지표
      perCar: kwh / n,
      cost: kwh * 320   // 충전요금 약 320원/kWh
    };
  }

  /* ---------- 수요 격자 생성 (재현 가능한 의사난수) ---------- */
  function seedRandom(seed) {
    let s = seed;
    return function () {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  function buildCells() {
    const rnd = seedRandom(20260730);
    cells = [];
    // 도심 3개 핵(hot spot) 주변에 수요를 집중 배치
    const cores = [
      { lat: 36.3504, lng: 127.3845, w: 1.0 },   // 시청권
      { lat: 36.3720, lng: 127.3400, w: 0.75 },  // 서북권
      { lat: 36.3230, lng: 127.4200, w: 0.6 }    // 동남권
    ];
    for (let i = 0; i < 120; i++) {
      const core = cores[i % cores.length];
      const r = Math.pow(rnd(), 1.6) * 0.055;
      const th = rnd() * Math.PI * 2;
      const lat = core.lat + Math.cos(th) * r;
      const lng = core.lng + Math.sin(th) * r * 1.24;
      // 핵에 가까울수록 수요 큼
      const dist = Math.sqrt(Math.pow(lat - core.lat, 2) + Math.pow(lng - core.lng, 2));
      const w = core.w * (1 - dist / 0.07) * (0.45 + rnd() * 0.55);
      cells.push({ lat: lat, lng: lng, w: Math.max(0.06, w) });
    }
  }

  /* ---------- 수요가중 K-Means (Lloyd) ---------- */
  function kmeans(points, k, iters) {
    if (!points.length) return [];
    k = Math.min(k, points.length);
    // 초기 중심: 수요 상위 지점을 고르게 선택
    const sorted = points.slice().sort(function (a, b) { return b.w - a.w; });
    let centers = [];
    for (let i = 0; i < k; i++) {
      const p = sorted[Math.floor(i * sorted.length / k)];
      centers.push({ lat: p.lat, lng: p.lng });
    }

    for (let it = 0; it < (iters || 30); it++) {
      const groups = centers.map(function () { return []; });
      points.forEach(function (p) {
        let best = 0, bd = Infinity;
        centers.forEach(function (c, i) {
          const d = Math.pow(p.lat - c.lat, 2) + Math.pow(p.lng - c.lng, 2);
          if (d < bd) { bd = d; best = i; }
        });
        groups[best].push(p);
      });
      let moved = 0;
      centers = centers.map(function (c, i) {
        const g = groups[i];
        if (!g.length) return c;
        let sw = 0, sl = 0, sg = 0;
        g.forEach(function (p) { sw += p.w; sl += p.lat * p.w; sg += p.lng * p.w; });
        const nc = { lat: sl / sw, lng: sg / sw, load: sw, count: g.length };
        moved += Math.abs(nc.lat - c.lat) + Math.abs(nc.lng - c.lng);
        return nc;
      });
      if (moved < 1e-7) break;
    }
    return centers;
  }

  /* ---------- 지도 ---------- */
  function buildMap() {
    const host = document.getElementById('evMap');
    if (!host || !window.L) return;
    if (map) { map.remove(); map = null; }

    map = L.map(host, { zoomControl: true, attributionControl: true }).setView(CENTER, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO', subdomains: 'abcd', maxZoom: 19
    }).addTo(map);

    demandLayer = L.layerGroup().addTo(map);
    siteLayer   = L.layerGroup().addTo(map);

    buildCells();
    setTimeout(function () { map.invalidateSize(); }, 250);
  }

  /** 수요 격자를 지도에 표시 */
  function drawDemand(r) {
    if (!demandLayer) return;
    demandLayer.clearLayers();
    const totalW = cells.reduce(function (a, c) { return a + c.w; }, 0);

    cells.forEach(function (c) {
      const share = c.w / totalW;
      const carsHere = r.n * share;
      const color = window.chroma
        ? chroma.scale(['#0ea5e9', '#22c98a', '#fbbf24', '#fb7185'])(Math.min(1, c.w / 0.9)).hex()
        : '#22c98a';
      L.circleMarker([c.lat, c.lng], {
        radius: 3 + c.w * 11,
        color: color, weight: 1, fillColor: color, fillOpacity: 0.42
      }).bindPopup(
        '<b>수요 격자</b><br>추정 전기차 ' + K.fmt(carsHere, 0) + ' 대<br>' +
        '연 충전량 ' + K.fmt(r.kwh * share / 1000, 0) + ' MWh'
      ).addTo(demandLayer);
    });
  }

  /** K-Means 최적 입지 표시 */
  function drawSites(r) {
    if (!siteLayer) return;
    siteLayer.clearLayers();
    const k = K.val('in-k');
    const centers = kmeans(cells, k, 40);
    const totalW = cells.reduce(function (a, c) { return a + c.w; }, 0);

    centers.forEach(function (c, i) {
      const share = (c.load || 0) / totalW;
      const chg = Math.max(1, Math.round(r.chargers * share));
      const fast = Math.round(chg * (K.val('in-fast') / 100));

      const icon = L.divIcon({
        className: '', html: '<div class="ev-pin">⚡</div>',
        iconSize: [30, 30], iconAnchor: [15, 15]
      });
      L.marker([c.lat, c.lng], { icon: icon }).bindPopup(
        '<b>충전소 후보 ' + (i + 1) + '호</b><br>' +
        '담당 격자 ' + (c.count || 0) + '개<br>' +
        '권장 충전기 <b>' + chg + '기</b> (급속 ' + fast + ' / 완속 ' + (chg - fast) + ')<br>' +
        '수요 점유율 ' + (share * 100).toFixed(1) + '%'
      ).addTo(siteLayer);

      // 서비스 반경
      L.circle([c.lat, c.lng], {
        radius: 900 + share * 5200,
        color: '#22c98a', weight: 1.2, fillColor: '#22c98a', fillOpacity: 0.07, dashArray: '5,5'
      }).addTo(siteLayer);
    });
    return centers;
  }

  /* ---------- 차트 ---------- */
  function updateCharts(r) {
    K.chart('evLoad', {
      type: 'bar',
      data: {
        labels: r.load.map(function (l) { return l.hour + '시'; }),
        datasets: [
          { label: '완속 충전 (MW)', data: r.load.map(function (l) { return +l.slow.toFixed(2); }),
            backgroundColor: '#38bdf8', borderRadius: 4, stack: 'l' },
          { label: '급속 충전 (MW)', data: r.load.map(function (l) { return +l.fast.toFixed(2); }),
            backgroundColor: '#fbbf24', borderRadius: 4, stack: 'l' }
        ]
      },
      options: {
        scales: {
          x: { stacked: true, ticks: { maxTicksLimit: 12 } },
          y: { stacked: true, title: { display: true, text: '평균 부하 (MW)', color: K.chartTheme().muted } }
        }
      }
    });

    K.chart('evCompare', {
      type: 'bar',
      data: {
        labels: ['내연기관차 (동일 주행)', '전기차 (현 전원믹스)', '전기차 (재생 100%)'],
        datasets: [{
          label: 'tCO₂eq/년',
          data: [
            +r.iceCO2.toFixed(0),
            +r.evCO2.toFixed(0),
            0
          ],
          backgroundColor: ['#fb7185', '#38bdf8', '#22c98a'],
          borderRadius: 7
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: { x: { title: { display: true, text: 'tCO₂eq/년', color: K.chartTheme().muted } } }
      }
    });
  }

  /* ---------- 전체 갱신 ---------- */
  function run(silent) {
    const r = calculate();
    K.store.ev = r;

    K.setNum('v-chg',  r.chargers, 0);
    K.setNum('v-pow',  r.gwh, 2);
    K.setNum('v-ghg',  r.cut, 0);
    K.setNum('v-peak', r.peakMW, 1);

    drawDemand(r);
    updateCharts(r);

    if (!silent) {
      K.toast(
        '충전기 ' + K.fmt(r.chargers, 0) + '기 · 전력 ' + r.gwh.toFixed(2) +
        ' GWh/년 · 감축 ' + K.fmt(r.cut, 0) + ' tCO₂eq',
        'ok'
      );
    }
  }

  /* ---------- 초기화 ---------- */
  K.register('ev', function () {
    buildMap();

    const zero = function (v) { return K.fmt(v, 0); };
    const one  = function (v) { return v.toFixed(1); };

    K.bind('in-evn',   'lbl-evn',   run.bind(null, true), zero);
    K.bind('in-km',    'lbl-km',    run.bind(null, true), zero);
    K.bind('in-eff2',  'lbl-eff2',  run.bind(null, true), one);
    K.bind('in-fast',  'lbl-fast',  run.bind(null, true), zero);
    K.bind('in-ratio', 'lbl-ratio', run.bind(null, true), one);
    K.bind('in-green', 'lbl-green', run.bind(null, true), zero);
    K.bind('in-k',     'lbl-k',     null, zero);

    document.getElementById('evApply').onclick = function () { run(false); };

    document.getElementById('evOptimize').onclick = function () {
      if (window.NProgress) NProgress.start();
      setTimeout(function () {
        const r = K.store.ev || calculate();
        const centers = drawSites(r);
        if (window.NProgress) NProgress.done();
        K.toast('K-Means 수렴 완료 — 최적 충전소 ' + (centers ? centers.length : 0) + '개소를 도출했습니다.', 'ok');
        if (window.confetti) {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.72 }, colors: ['#22c98a', '#38bdf8'] });
        }
      }, 320);
    };

    run(true);
    // 최초 진입 시 입지도 함께 표시
    setTimeout(function () { drawSites(K.store.ev || calculate()); }, 500);
  });
})();
