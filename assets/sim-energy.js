/* ============================================================
   sim-energy.js — 신재생에너지 발전량 시뮬레이터
   산정근거:
     · 태양광 (PVWatts 방식)
         E[kWh/년] = P[kWp] × H[일사시간 h/일] × 365 × PR
     · 풍력 (Betz 출력식)
         P[W] = ½ · ρ · A · v³ · Cp        (ρ=1.225 kg/m³)
         연간발전량 = 정격출력 × 8,760 × 이용률
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO, EF = K.EF;

  let S3 = null, panels = [], turbines = [];
  const RHO = 1.225;  // 공기밀도 kg/m3

  /* 월별 일사량 보정계수 (국내 평균 패턴) */
  const MONTH_SOLAR = [0.72, 0.85, 1.02, 1.14, 1.18, 1.02, 0.86, 0.94, 1.02, 1.05, 0.78, 0.68];
  /* 월별 풍속 보정계수 (겨울 강, 여름 약) */
  const MONTH_WIND  = [1.22, 1.18, 1.12, 1.02, 0.90, 0.80, 0.82, 0.86, 0.92, 1.00, 1.10, 1.20];
  const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

  /** 경사각 보정: 국내 최적 30° 기준 코사인 손실 */
  function tiltFactor(tilt) {
    return 1 - Math.pow(Math.abs(tilt - 30) / 62, 1.7) * 0.28;
  }

  /** 풍력 이용률 — NREL 경험식  CF = 0.087·V − P[kW]/D²[m²]
      (V: 연평균풍속 m/s, P: 정격출력 kW, D: 로터직경 m) */
  function capacityFactor(v, ratedKW, D) {
    const cf = 0.087 * v - ratedKW / (D * D);
    return Math.max(0.02, Math.min(0.55, cf));
  }

  function calculate() {
    // ----- 태양광 -----
    const H     = parseFloat(K.raw('in-region'));  // 일평균 일사시간
    const cap   = K.val('in-pv');                  // kWp
    const meff  = K.val('in-peff') / 100;
    const PR    = K.val('in-pr');
    const tilt  = K.val('in-tilt');
    const tf    = tiltFactor(tilt);

    // 모듈효율은 동일 면적 대비 성능지표로 반영 (기준 20%)
    const effAdj = meff / 0.20;
    const pvYear = cap * H * 365 * PR * tf * effAdj;          // kWh/년
    const pvCF   = (pvYear / (cap * 8760)) * 100;             // 이용률 %
    const pvArea = cap / (meff * 1.0) * 1.0;                  // 소요 모듈면적 m² (1kW/m² 기준)

    // ----- 풍력 -----
    const n     = K.val('in-nwt');
    const rot   = K.val('in-rot');
    const v     = K.val('in-wind');
    const Cp    = K.val('in-cp');
    const A     = Math.PI * Math.pow(rot / 2, 2);             // 수풍면적 m²
    const ratedW = 0.5 * RHO * A * Math.pow(12, 3) * Cp;      // 정격풍속 12 m/s 기준 정격출력 W
    const ratedKW = ratedW / 1000;
    const cf    = capacityFactor(v, ratedKW, rot);
    const wtYear = ratedKW * 8760 * cf * n;                   // kWh/년

    // ----- 종합 -----
    const totalKWh = pvYear + wtYear;
    const ghg      = totalKWh * EF.elec / 1000;               // tCO2eq/년
    const smp      = K.val('in-smp');
    const revenue  = totalKWh * smp;                          // 원/년

    // 투자비: 태양광 약 130만원/kW, 풍력 약 250만원/kW
    const capexPV = cap * 1300000;
    const capexWT = ratedKW * n * 2500000;
    const capex   = capexPV + capexWT;
    // 운영비 연 2% 가정
    const opex    = capex * 0.02;
    const netRev  = revenue - opex;
    const payback = netRev > 0 ? capex / netRev : 999;

    // 월별 발전량
    const monthly = MONTHS.map(function (m, i) {
      return {
        month: m,
        pv: pvYear / 12 * MONTH_SOLAR[i],
        wt: wtYear / 12 * MONTH_WIND[i]
      };
    });

    return {
      H: H, cap: cap, meff: meff * 100, PR: PR, tilt: tilt,
      pvYear: pvYear, pvCF: pvCF, pvArea: pvArea,
      n: n, rot: rot, v: v, Cp: Cp, area: A,
      ratedKW: ratedKW, cf: cf * 100, wtYear: wtYear,
      totalKWh: totalKWh, ghg: ghg, smp: smp, revenue: revenue,
      capex: capex, opex: opex, payback: Math.min(payback, 999),
      monthly: monthly,
      households: totalKWh / 3600   // 가구당 연 3,600 kWh 가정
    };
  }

  /* ---------- 3D 발전단지 ---------- */
  function build3D() {
    S3 = K.scene3D('energy3d', {
      camera: [0, 46, 92], groundSize: 190, gridDiv: 38, targetY: 14,
      maxDist: 380, groundColor: 0x152a22
    });
    if (!S3) return;

    // ----- 태양광 어레이 (6 × 5) -----
    const panelGeo = new THREE.BoxGeometry(9, 0.35, 5.4);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x1d3a63, roughness: 0.18, metalness: 0.72,
      emissive: 0x0a1c3a, emissiveIntensity: 0.4
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x7f8ea3, roughness: 0.6, metalness: 0.5 });

    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 6; c++) {
        const g = new THREE.Group();
        const p = new THREE.Mesh(panelGeo, panelMat);
        p.castShadow = true; p.receiveShadow = true;
        g.add(p);

        // 지지대
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5, 6), frameMat);
        leg.position.y = -2.6;
        g.add(leg);

        g.position.set(-46 + c * 11, 4.4, -30 + r * 12);
        S3.scene.add(g);
        panels.push(g);
      }
    }
    const plab = K.label3D('☀️ 태양광 발전단지', '#fbbf24', 1);
    plab.position.set(-18, 20, -42);
    S3.scene.add(plab);

    // ----- 풍력 터빈 -----
    for (let i = 0; i < 20; i++) {
      const g = new THREE.Group();
      const towerH = 30;

      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 1.7, towerH, 12),
        new THREE.MeshStandardMaterial({ color: 0xe8eef7, roughness: 0.55, metalness: 0.3 })
      );
      tower.position.y = towerH / 2;
      tower.castShadow = true;
      g.add(tower);

      const nacelle = new THREE.Mesh(
        new THREE.BoxGeometry(5, 2.4, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xdfe7f2, roughness: 0.5, metalness: 0.4 })
      );
      nacelle.position.set(0, towerH, 0);
      nacelle.castShadow = true;
      g.add(nacelle);

      // 로터 (3枚 블레이드)
      const rotor = new THREE.Group();
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf5f9ff, roughness: 0.45, metalness: 0.2 });
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 17, 1.5), bladeMat);
        blade.position.y = 8.5;
        blade.castShadow = true;
        const holder = new THREE.Group();
        holder.add(blade);
        holder.rotation.z = (b / 3) * Math.PI * 2;
        rotor.add(holder);
      }
      const hub = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xcfd9e8, roughness: 0.4 })
      );
      rotor.add(hub);
      rotor.position.set(0, towerH, 2.4);
      g.add(rotor);
      g.userData = { rotor: rotor };

      const col = i % 5, row = Math.floor(i / 5);
      g.position.set(18 + col * 15, 0, -26 + row * 18);
      g.visible = false;
      S3.scene.add(g);
      turbines.push(g);
    }
    const wlab = K.label3D('🌬️ 풍력 발전단지', '#38bdf8', 1);
    wlab.position.set(48, 46, -42);
    S3.scene.add(wlab);

    S3.onTick(function () {
      turbines.forEach(function (t) {
        if (t.visible && t.userData.rotor) t.userData.rotor.rotation.z += t.userData.spin || 0.03;
      });
    });
    S3.start();
  }

  function update3D(r) {
    if (!S3) return;

    // 패널 경사각 반영
    panels.forEach(function (g, i) {
      const target = -(r.tilt * Math.PI / 180);
      if (window.gsap) gsap.to(g.rotation, { x: target, duration: 0.8, ease: 'power2.out', delay: i * 0.008 });
      else g.rotation.x = target;
    });

    // 설비용량에 따라 표시 패널 수 조절
    const showPanels = Math.max(1, Math.min(30, Math.round(r.cap / 5000 * 30) || 1));
    panels.forEach(function (g, i) { g.visible = i < Math.max(6, showPanels); });

    // 터빈 기수 + 회전속도 (풍속 연동)
    const spin = 0.008 + r.v * 0.007;
    turbines.forEach(function (t, i) {
      t.visible = i < r.n;
      t.userData.spin = spin;
      const s = r.rot / 90;
      t.scale.set(s, s, s);
    });
  }

  /* ---------- 차트 ---------- */
  function updateCharts(r) {
    K.chart('energyBar', {
      type: 'bar',
      data: {
        labels: MONTHS,
        datasets: [
          { label: '태양광 (MWh)', data: r.monthly.map(function (m) { return +(m.pv / 1000).toFixed(1); }),
            backgroundColor: '#fbbf24', borderRadius: 5, stack: 's' },
          { label: '풍력 (MWh)', data: r.monthly.map(function (m) { return +(m.wt / 1000).toFixed(1); }),
            backgroundColor: '#38bdf8', borderRadius: 5, stack: 's' }
        ]
      },
      options: {
        scales: {
          x: { stacked: true },
          y: { stacked: true, title: { display: true, text: 'MWh/월', color: K.chartTheme().muted } }
        }
      }
    });

    // 풍속-출력 곡선 (컷인 3, 정격 12, 컷아웃 25 m/s)
    const vs = [], pw = [];
    for (let v = 0; v <= 26; v += 0.5) {
      vs.push(v.toFixed(1));
      let p = 0;
      if (v >= 3 && v < 12) p = 0.5 * RHO * r.area * Math.pow(v, 3) * r.Cp / 1000;
      else if (v >= 12 && v <= 25) p = r.ratedKW;
      pw.push(+Math.min(p, r.ratedKW).toFixed(1));
    }
    const marker = vs.map(function (x) {
      return Math.abs(parseFloat(x) - r.v) < 0.26 ? r.ratedKW * 1.05 : null;
    });

    K.chart('energyCurve', {
      type: 'line',
      data: {
        labels: vs,
        datasets: [
          { label: '터빈 출력 (kW)', data: pw, borderColor: '#22c98a',
            backgroundColor: 'rgba(34,201,138,.15)', borderWidth: 2.5, tension: 0.25,
            pointRadius: 0, fill: true },
          { label: '현재 연평균 풍속 ' + r.v.toFixed(1) + ' m/s', data: marker,
            borderColor: '#fb7185', backgroundColor: '#fb7185',
            pointRadius: 6, showLine: false }
        ]
      },
      options: {
        scales: {
          x: { title: { display: true, text: '풍속 (m/s)', color: K.chartTheme().muted },
               ticks: { maxTicksLimit: 14 } },
          y: { title: { display: true, text: '출력 (kW)', color: K.chartTheme().muted } }
        }
      }
    });
  }

  /* ---------- 전체 갱신 ---------- */
  function run(silent) {
    const r = calculate();
    K.store.energy = r;

    K.setNum('e-pv',  r.pvYear / 1000, 1);
    K.setNum('e-wt',  r.wtYear / 1000, 1);
    K.setNum('e-ghg', r.ghg, 0);
    K.setNum('e-pay', r.payback >= 999 ? 999 : r.payback, 1);

    update3D(r);
    updateCharts(r);

    if (!silent) {
      K.toast(
        '총 ' + K.fmt(r.totalKWh / 1000, 1) + ' MWh/년 · ' +
        K.fmt(r.households, 0) + '가구 사용량 · 회수 ' + r.payback.toFixed(1) + '년',
        'ok'
      );
    }
  }

  /* ---------- 초기화 ---------- */
  K.register('energy', function () {
    build3D();

    const zero = function (v) { return K.fmt(v, 0); };
    const one  = function (v) { return v.toFixed(1); };
    const two  = function (v) { return v.toFixed(2); };

    K.bind('in-pv',   'lbl-pv',   run.bind(null, true), zero);
    K.bind('in-peff', 'lbl-peff', run.bind(null, true), one);
    K.bind('in-pr',   'lbl-pr',   run.bind(null, true), two);
    K.bind('in-tilt', 'lbl-tilt', run.bind(null, true), zero);
    K.bind('in-nwt',  'lbl-nwt',  run.bind(null, true), zero);
    K.bind('in-rot',  'lbl-rot',  run.bind(null, true), zero);
    K.bind('in-wind', 'lbl-wind', run.bind(null, true), one);
    K.bind('in-cp',   'lbl-cp',   run.bind(null, true), two);
    K.bind('in-smp',  'lbl-smp',  run.bind(null, true), zero);

    const reg = document.getElementById('in-region');
    if (reg) reg.addEventListener('change', function () { run(true); });

    document.getElementById('energyApply').onclick = function () { run(false); };
    run(true);
  });
})();
