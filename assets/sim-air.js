/* ============================================================
   sim-air.js — 대기오염물질 확산 시뮬레이터
   산정근거:
     · Gaussian Plume Model
         C(x,y,0) = Q/(π·u·σy·σz) · exp(-y²/2σy²) · exp(-He²/2σz²)
     · Pasquill-Gifford 확산계수 (Briggs 도시/전원 공식)
     · Holland 연기상승식으로 유효굴뚝높이 He = h + Δh 산정
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO;

  let S3 = null, smoke = [], stackMesh = null, windArrow = null;

  /* ---------- Briggs 확산계수 (σy, σz) ----------
     x: 풍하거리(m), stab: 안정도 A~F, terrain: urban|rural  */
  function sigma(x, stab, terrain) {
    if (x <= 0) return { y: 0.1, z: 0.1 };
    let sy, sz;
    if (terrain === 'urban') {
      switch (stab) {
        case 'A': case 'B':
          sy = 0.32 * x / Math.sqrt(1 + 0.0004 * x);
          sz = 0.24 * x * Math.sqrt(1 + 0.001 * x); break;
        case 'C':
          sy = 0.22 * x / Math.sqrt(1 + 0.0004 * x);
          sz = 0.20 * x; break;
        case 'D':
          sy = 0.16 * x / Math.sqrt(1 + 0.0004 * x);
          sz = 0.14 * x / Math.sqrt(1 + 0.0003 * x); break;
        default: // E, F
          sy = 0.11 * x / Math.sqrt(1 + 0.0004 * x);
          sz = 0.08 * x / Math.sqrt(1 + 0.0015 * x); break;
      }
    } else {
      switch (stab) {
        case 'A':
          sy = 0.22 * x / Math.sqrt(1 + 0.0001 * x);
          sz = 0.20 * x; break;
        case 'B':
          sy = 0.16 * x / Math.sqrt(1 + 0.0001 * x);
          sz = 0.12 * x; break;
        case 'C':
          sy = 0.11 * x / Math.sqrt(1 + 0.0001 * x);
          sz = 0.08 * x / Math.sqrt(1 + 0.0002 * x); break;
        case 'D':
          sy = 0.08 * x / Math.sqrt(1 + 0.0001 * x);
          sz = 0.06 * x / Math.sqrt(1 + 0.0015 * x); break;
        case 'E':
          sy = 0.06 * x / Math.sqrt(1 + 0.0001 * x);
          sz = 0.03 * x / (1 + 0.0003 * x); break;
        default: // F
          sy = 0.04 * x / Math.sqrt(1 + 0.0001 * x);
          sz = 0.016 * x / (1 + 0.0003 * x); break;
      }
    }
    return { y: Math.max(0.1, sy), z: Math.max(0.1, sz) };
  }

  /* ---------- Holland 연기상승식 ---------- */
  function plumeRise(vs, d, u, Ts, Ta) {
    const TsK = Ts + 273.15, TaK = Ta + 273.15;
    // Δh = (vs·d/u) · (1.5 + 2.68 × 10⁻³ · P · ((Ts-Ta)/Ts) · d),  P=1000 mb
    const dh = (vs * d / Math.max(0.5, u)) *
               (1.5 + 2.68e-3 * 1000 * ((TsK - TaK) / TsK) * d);
    return Math.max(0, dh);
  }

  /* ---------- 지표 농도 (중심선, y=0, z=0) ----------
     반사항 포함: C = Q/(π u σy σz) · exp(-He²/(2σz²))   [㎍/㎥]  */
  function conc(x, y, Q, u, He, stab, terrain) {
    if (x <= 0) return 0;
    const s = sigma(x, stab, terrain);
    const A = (Q * 1e6) / (Math.PI * Math.max(0.5, u) * s.y * s.z); // g/s → ㎍/s
    const yTerm = Math.exp(-(y * y) / (2 * s.y * s.y));
    const zTerm = Math.exp(-(He * He) / (2 * s.z * s.z));
    return A * yTerm * zTerm;
  }

  function calculate() {
    const h    = K.val('in-h');
    const d    = K.val('in-d');
    const vs   = K.val('in-vs');
    const Ts   = K.val('in-ts');
    const Q    = K.val('in-q');
    const u    = K.val('in-u');
    const Ta   = K.val('in-ta');
    const stab = K.raw('in-stab');
    const terr = K.raw('in-terrain');
    const poll = K.raw('in-poll');

    const dh = plumeRise(vs, d, u, Ts, Ta);
    const He = h + dh;

    // 풍하거리별 중심선 농도 스캔
    const xs = [], cs = [];
    let cmax = 0, xmax = 0;
    for (let x = 50; x <= 12000; x += 50) {
      const c = conc(x, 0, Q, u, He, stab, terr);
      xs.push(x); cs.push(c);
      if (c > cmax) { cmax = c; xmax = x; }
    }

    const std = K.AQ_STD[poll];
    const ratio = cmax / std.std * 100;

    return {
      h: h, d: d, vs: vs, Ts: Ts, Ta: Ta, Q: Q, u: u,
      stab: stab, terrain: terr, poll: poll, pollName: std.name,
      dh: dh, He: He, cmax: cmax, xmax: xmax,
      std: std.std, ratio: ratio, pass: cmax <= std.std,
      xs: xs, cs: cs
    };
  }

  /* ---------- 3D 굴뚝 & 연기 ---------- */
  function build3D() {
    S3 = K.scene3D('air3d', {
      camera: [78, 52, 96], groundSize: 200, gridDiv: 40, targetY: 22,
      maxDist: 420, groundColor: 0x16283f
    });
    if (!S3) return;

    // 공장 본체
    const plant = new THREE.Mesh(
      new THREE.BoxGeometry(26, 12, 20),
      new THREE.MeshStandardMaterial({ color: 0x243b58, roughness: 0.85, metalness: 0.2 })
    );
    plant.position.set(-8, 6, 0);
    plant.castShadow = true; plant.receiveShadow = true;
    S3.scene.add(plant);

    // 굴뚝
    stackMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.2, 40, 20),
      new THREE.MeshStandardMaterial({ color: 0xc4d2e6, roughness: 0.6, metalness: 0.35 })
    );
    stackMesh.position.set(8, 20, 0);
    stackMesh.castShadow = true;
    S3.scene.add(stackMesh);

    // 굴뚝 적색 경고띠
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(2.35, 2.6, 4, 20),
      new THREE.MeshStandardMaterial({ color: 0xe1435c, roughness: 0.5 })
    );
    band.position.set(8, 35, 0);
    S3.scene.add(band);

    // 풍향 화살표
    windArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(-46, 34, 0), 22, 0x38bdf8, 7, 4
    );
    S3.scene.add(windArrow);
    const wlab = K.label3D('풍향', '#38bdf8', 0.7);
    wlab.position.set(-46, 42, 0);
    S3.scene.add(wlab);

    // 연기 입자 풀
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0xb8c6da, transparent: true, opacity: 0.4,
      roughness: 1, depthWrite: false
    });
    for (let i = 0; i < 300; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 8), smokeMat.clone());
      p.userData = { t: Math.random(), off: Math.random() * Math.PI * 2, r: Math.random() };
      S3.scene.add(p);
      smoke.push(p);
    }

    // 거리 눈금
    [40, 80, 120].forEach(function (dist, i) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(dist - 0.35, dist + 0.35, 72, 1, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: 0x2f4a6b, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      S3.scene.add(ring);
      const dl = K.label3D((i + 1) * 2 + ' km', '#5f7fa5', 0.55);
      dl.position.set(dist, 2.5, 0);
      S3.scene.add(dl);
    });

    S3.start();
  }

  /** 연기 거동을 계산 결과에 연동 */
  function update3D(r) {
    if (!S3 || !smoke.length) return;

    // 굴뚝 높이 반영 (씬 스케일: 1 unit ≈ 1.5 m)
    const sh = r.h / 1.5;
    stackMesh.scale.y = sh / 40;
    stackMesh.position.y = sh / 2;

    const HeU = r.He / 1.5;                 // 유효굴뚝높이 (씬 단위)
    const spread = { A: 2.4, B: 1.9, C: 1.5, D: 1.1, E: 0.75, F: 0.5 }[r.stab] || 1.1;
    const drift = Math.max(0.25, 3.2 / Math.max(1, r.u));   // 풍속 클수록 낮게 깔림
    const speed = 0.0022 + r.u * 0.0009;
    const dens  = Math.min(1, r.Q / 250);   // 배출률 → 불투명도

    smoke.forEach(function (p, i) {
      p.userData.speed = speed;
      p.userData.spread = spread;
      p.userData.HeU = HeU;
      p.userData.drift = drift;
      p.material.opacity = 0.12 + dens * 0.4;
      p.userData.stackTop = sh;
    });

    if (!S3._smokeTick) {
      S3._smokeTick = true;
      S3.onTick(function () {
        smoke.forEach(function (p) {
          const u = p.userData;
          u.t += (u.speed || 0.004);
          if (u.t > 1) { u.t = 0; u.off = Math.random() * Math.PI * 2; u.r = Math.random(); }

          const x = 8 + u.t * 150;                                  // 풍하 이동
          const sy = Math.pow(u.t, 0.75) * (u.spread || 1) * 16;    // 횡방향 확산
          const sz = Math.pow(u.t, 0.72) * (u.spread || 1) * 11;

          // 연기상승 후 풍속에 따라 하강(다운워시)
          const rise = (u.HeU || 30) - (u.stackTop || 26);
          const y = (u.stackTop || 26) + rise * Math.min(1, u.t * 3.2)
                    - u.t * u.t * (u.drift || 1) * 9
                    + Math.sin(u.off + u.t * 6) * sz * 0.55;

          p.position.set(x, Math.max(0.8, y), Math.cos(u.off + u.t * 4) * sy);
          const g = 1 + u.t * 3.4;
          p.scale.set(g, g, g);
          p.material.opacity = Math.max(0, (0.12 + (u.dens || 0.3)) * (1 - u.t) * 1.4);
        });
      });
    }

    // 풍향 화살표 길이를 풍속에 연동
    if (windArrow) windArrow.setLength(10 + r.u * 1.8, 7, 4);
  }

  /* ---------- 농도 곡선 차트 ---------- */
  function updateCharts(r) {
    // 12km까지 중 200개 샘플만 표시
    const step = Math.ceil(r.xs.length / 120);
    const labels = [], data = [];
    for (let i = 0; i < r.xs.length; i += step) {
      labels.push((r.xs[i] / 1000).toFixed(1));
      data.push(+r.cs[i].toFixed(2));
    }
    const stdLine = labels.map(function () { return r.std; });

    K.chart('airLine', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: r.pollName + ' 지표농도', data: data, borderColor: '#fb7185',
            backgroundColor: 'rgba(251,113,133,.15)', borderWidth: 2.5,
            tension: 0.3, pointRadius: 0, fill: true },
          { label: '대기환경기준 (' + r.std + ' ㎍/㎥)', data: stdLine, borderColor: '#22c98a',
            borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: '풍하거리 (km)', color: K.chartTheme().muted },
               ticks: { maxTicksLimit: 12 } },
          y: { title: { display: true, text: '농도 (㎍/㎥)', color: K.chartTheme().muted } }
        }
      }
    });
  }

  /* ---------- D3 등농도선 (평면 확산) ---------- */
  function drawContour(r) {
    const host = document.getElementById('airContour');
    if (!host || !window.d3) return;
    host.innerHTML = '';

    const W = host.clientWidth || 460, H = 270;
    const nx = 90, ny = 54;                 // 격자
    const xMax = 8000, yMax = 2400;         // 계산 영역 (m)

    const values = new Array(nx * ny);
    let vmax = 0;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = (i / nx) * xMax + 60;
        const y = ((j / ny) - 0.5) * 2 * yMax;
        const c = conc(x, y, r.Q, r.u, r.He, r.stab, r.terrain);
        values[j * nx + i] = c;
        if (c > vmax) vmax = c;
      }
    }
    if (vmax <= 0) vmax = 1;

    const svg = d3.select(host).append('svg')
      .attr('width', '100%').attr('height', H)
      .attr('viewBox', '0 0 ' + W + ' ' + H);

    try {
      const thresholds = d3.range(1, 9).map(function (k) { return vmax * Math.pow(k / 9, 2.1); });
      const contours = d3.contours().size([nx, ny]).thresholds(thresholds)(values);
      const color = d3.scaleSequential(d3.interpolateTurbo).domain([0, vmax]);
      const path = d3.geoPath(d3.geoIdentity().scale(Math.min(W / nx, H / ny)));

      svg.append('g').selectAll('path').data(contours).enter().append('path')
        .attr('d', path)
        .attr('fill', function (d) { return color(d.value); })
        .attr('fill-opacity', 0.72)
        .attr('stroke', 'rgba(255,255,255,.14)')
        .attr('stroke-width', 0.6)
        .append('title').text(function (d) { return K.fmt(d.value, 1) + ' ㎍/㎥'; });

      // 배출원 표시
      const sc = Math.min(W / nx, H / ny);
      svg.append('circle')
        .attr('cx', 1 * sc).attr('cy', (ny / 2) * sc).attr('r', 4)
        .attr('fill', '#fff').attr('stroke', '#fb7185').attr('stroke-width', 2);
      svg.append('text')
        .attr('x', 10).attr('y', (ny / 2) * sc - 9)
        .attr('fill', K.chartTheme().text).style('font-size', '11px').style('font-weight', '700')
        .text('배출원');
      svg.append('text')
        .attr('x', W - 6).attr('y', H - 7).attr('text-anchor', 'end')
        .attr('fill', K.chartTheme().muted).style('font-size', '10.5px')
        .text('풍하 8 km × 횡방향 ±2.4 km · 최대 ' + K.fmt(vmax, 1) + ' ㎍/㎥');
    } catch (e) {
      host.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:20px">등농도선 렌더링 실패</p>';
    }
  }

  /* ---------- 전체 갱신 ---------- */
  function run(silent) {
    const r = calculate();
    K.store.air = r;

    K.setNum('a-he',   r.He, 1);
    K.setNum('a-cmax', r.cmax, 1);
    K.setNum('a-xmax', r.xmax, 0);

    const j  = document.getElementById('a-judge');
    const js = document.getElementById('a-judgeSub');
    const jc = document.getElementById('a-judgeCard');
    if (j) {
      j.textContent = r.ratio.toFixed(0) + '%';
      j.style.color = r.pass ? 'var(--eco)' : 'var(--warn)';
    }
    if (js) js.textContent = r.pollName + ' 기준 ' + r.std + ' ㎍/㎥ 대비 ' + (r.pass ? '적합' : '초과');
    if (jc) { jc.classList.remove('pass', 'fail'); jc.classList.add(r.pass ? 'pass' : 'fail'); }

    update3D(r);
    updateCharts(r);
    drawContour(r);

    if (!silent) {
      K.toast(
        '최대농도 ' + K.fmt(r.cmax, 1) + ' ㎍/㎥ @ ' + K.fmt(r.xmax, 0) + 'm — ' +
        (r.pass ? '환경기준 적합' : '환경기준 초과'),
        r.pass ? 'ok' : 'err'
      );
    }
  }

  /* ---------- 초기화 ---------- */
  // 외부 공개 API (기상청/Open-Meteo 실시간 대기 및 풍속 연동)
  window.fetchRealtimeWeatherData = async function () {
    try {
      if (window.Toastify) Toastify({ text: '📡 서울 지역 실시간 기상/풍속 데이터 조회 중...', style: { background: '#38bdf8' } }).showToast();
      // 서울 좌표 (lat: 37.5665, lon: 126.9780) Open-Meteo 무료 API 연동
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m,wind_speed_10m,wind_direction_10m');
      const data = await res.json();
      if (data && data.current) {
        const ws = (data.current.wind_speed_10m / 3.6).toFixed(1); // km/h -> m/s
        const temp = Math.round(data.current.temperature_2m);
        
        const speedEl = document.getElementById('airWindSpeed');
        const tempEl = document.getElementById('airTemp');
        if (speedEl) { speedEl.value = Math.max(1, Math.min(25, ws)); speedEl.dispatchEvent(new Event('input')); }
        if (tempEl) { tempEl.value = Math.max(-10, Math.min(45, temp)); tempEl.dispatchEvent(new Event('input')); }

        if (window.Toastify) Toastify({ text: `✅ 실시간 기상 연동 완료: 풍속 ${ws} m/s, 기온 ${temp}°C`, style: { background: '#22c98a', color: '#000', fontWeight: 'bold' } }).showToast();
      }
    } catch (e) {
      if (window.Toastify) Toastify({ text: '실시간 기상 데이터 연동 실패 (기본값 사용)', style: { background: '#fb7185' } }).showToast();
    }
  };

  K.register('air', function () {
    build3D();

    const one = function (v) { return v.toFixed(1); };
    const zero = function (v) { return K.fmt(v, 0); };
    K.bind('in-h',  'lbl-h',  run.bind(null, true), zero);
    K.bind('in-d',  'lbl-d',  run.bind(null, true), one);
    K.bind('in-vs', 'lbl-vs', run.bind(null, true), zero);
    K.bind('in-ts', 'lbl-ts', run.bind(null, true), zero);
    K.bind('in-q',  'lbl-q',  run.bind(null, true), zero);
    K.bind('in-u',  'lbl-u',  run.bind(null, true), one);
    K.bind('in-ta', 'lbl-ta', run.bind(null, true), zero);

    ['in-stab', 'in-terrain', 'in-poll'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', function () { run(true); });
    });

    document.getElementById('airApply').onclick = function () { run(false); };
    run(true);
  });
})();
