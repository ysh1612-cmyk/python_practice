/* ============================================================
   sim-water.js — 하수처리 공정(A²O) 진단 시뮬레이터
   산정근거:
     · 단위공정별 제거율 적용 (침사지 → 1차침전 → 생물반응조 → 2차침전 → 고도처리)
     · 온도보정: Arrhenius θ=1.047,  θ^(T-20)
     · 슬러지 발생량 = 관측수율 Yobs × BOD 제거량 (Yobs = Y/(1+kd·SRT))
     · 방류수 수질기준: 공공하수처리시설 방류수 수질기준 (Ⅰ지역)
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO, STD = K.EFF_STD;

  let S3 = null, tanks = [], waterMeshes = [], flowDots = [];

  /* 공정 단계 정의 — 각 단계의 기본 제거율 */
  const STAGES = [
    { name: '침사지',     bod: 0.05, ss: 0.10, tn: 0.02, tp: 0.02, color: 0x64748b },
    { name: '1차침전지',  bod: 0.30, ss: 0.55, tn: 0.08, tp: 0.10, color: 0x475569 },
    { name: '혐기조',     bod: 0.12, ss: 0.05, tn: 0.05, tp: 0.35, color: 0xa78bfa },
    { name: '무산소조',   bod: 0.15, ss: 0.05, tn: 0.42, tp: 0.05, color: 0x38bdf8 },
    { name: '호기조',     bod: 0.88, ss: 0.35, tn: 0.30, tp: 0.20, color: 0x22c98a },
    { name: '2차침전지',  bod: 0.55, ss: 0.80, tn: 0.10, tp: 0.25, color: 0x0ea5e9 },
    { name: '소독/방류',  bod: 0.10, ss: 0.30, tn: 0.03, tp: 0.05, color: 0x67e8f9 }
  ];

  /* 고도처리 추가 제거율 */
  const ADV = {
    none:        { bod: 0,    ss: 0,    tn: 0,    tp: 0,    power: 0.22, label: '표준활성슬러지법' },
    'a2o':       { bod: 0.15, ss: 0.20, tn: 0.25, tp: 0.55, power: 0.28, label: 'A²O 공정' },
    'a2o-mbr':   { bod: 0.45, ss: 0.85, tn: 0.35, tp: 0.75, power: 0.42, label: 'A²O + MBR' },
    'a2o-mbr-o3':{ bod: 0.60, ss: 0.90, tn: 0.45, tp: 0.88, power: 0.55, label: 'A²O + MBR + 응집·오존산화' }
  };

  function calculate() {
    const Q    = K.val('in-qin');       // m3/일
    const bod0 = K.val('in-bod');
    const ss0  = K.val('in-ss');
    const tn0  = K.val('in-tn');
    const tp0  = K.val('in-tp');
    const mlss = K.val('in-mlss');
    const srt  = K.val('in-srt');
    const hrt  = K.val('in-hrt');
    const T    = K.val('in-temp');
    const advKey = K.raw('in-adv');
    const adv  = ADV[advKey] || ADV['a2o'];

    // 온도 보정계수 (생물반응 효율)
    const tCorr = Math.pow(1.047, T - 20);
    // SRT 보정: SRT가 길수록 질산화 안정 (10일 기준 포화)
    const srtCorr = Math.min(1.15, 0.55 + srt / 16);
    // MLSS 보정: 3,000 mg/L 기준
    const mlssCorr = Math.min(1.12, 0.7 + mlss / 9000);
    // HRT 보정: 8시간 기준
    const hrtCorr = Math.min(1.1, 0.72 + hrt / 32);

    const bioBoost = tCorr * srtCorr * mlssCorr * hrtCorr;

    // 단계별 수질 추적
    let bod = bod0, ss = ss0, tn = tn0, tp = tp0;
    const track = [{ name: '유입수', bod: bod, ss: ss, tn: tn, tp: tp }];

    STAGES.forEach(function (st) {
      // 생물반응조(혐기·무산소·호기)에만 운전조건 보정 적용
      const bio = (st.name === '혐기조' || st.name === '무산소조' || st.name === '호기조');
      const f = bio ? Math.min(0.96, bioBoost) : 1;
      bod *= (1 - Math.min(0.95, st.bod * f));
      ss  *= (1 - Math.min(0.95, st.ss  * f));
      tn  *= (1 - Math.min(0.92, st.tn  * f));
      tp  *= (1 - Math.min(0.92, st.tp  * f));
      track.push({ name: st.name, bod: bod, ss: ss, tn: tn, tp: tp });
    });

    // 고도처리 추가 제거
    bod *= (1 - adv.bod); ss *= (1 - adv.ss); tn *= (1 - adv.tn); tp *= (1 - adv.tp);
    track.push({ name: '최종 방류수', bod: bod, ss: ss, tn: tn, tp: tp });

    const eff = { bod: bod, ss: ss, tn: tn, tp: tp, cod: bod * 1.35 };

    // 제거율
    const removal = {
      bod: (1 - bod / bod0) * 100,
      ss:  (1 - ss  / ss0)  * 100,
      tn:  (1 - tn  / tn0)  * 100,
      tp:  (1 - tp  / tp0)  * 100
    };

    // 기준 적합 판정
    const judge = {
      bod: bod <= STD.bod, ss: ss <= STD.ss,
      tn: tn <= STD.tn, tp: tp <= STD.tp, cod: eff.cod <= STD.cod
    };
    const passAll = judge.bod && judge.ss && judge.tn && judge.tp && judge.cod;

    // 슬러지 발생량 — Yobs = Y/(1+kd·SRT),  Y=0.6, kd=0.06/일
    const Yobs = 0.6 / (1 + 0.06 * srt);
    const bodRemovedKg = (bod0 - bod) * Q / 1000;          // kg/일
    const dsKg = Yobs * bodRemovedKg;                      // 건조고형물 kg/일
    const sludgeWet = dsKg / (1 - 0.80) / 1000;            // 함수율 80% 케이크 t/일

    // 전력 사용량 — 원단위 kWh/m3
    const powerUnit = adv.power;
    const powerYear = Q * powerUnit * 365 / 1000;          // MWh/년
    const powerGhg  = powerYear * 1000 * K.EF.elec / 1000; // tCO2eq/년

    return {
      Q: Q, inflow: { bod: bod0, ss: ss0, tn: tn0, tp: tp0 },
      eff: eff, removal: removal, judge: judge, passAll: passAll,
      track: track, adv: adv, advKey: advKey,
      mlss: mlss, srt: srt, hrt: hrt, T: T,
      Yobs: Yobs, sludge: sludgeWet, dsKg: dsKg,
      powerUnit: powerUnit, powerYear: powerYear, powerGhg: powerGhg,
      // 처리인구 환산 (1인 1일 오수 발생 300 L)
      population: Q / 0.3
    };
  }

  /* ---------- 3D 처리 공정 계통도 ---------- */
  function build3D() {
    S3 = K.scene3D('water3d', {
      camera: [0, 40, 84], groundSize: 170, gridDiv: 34, targetY: 5,
      maxDist: 340, groundColor: 0x122236
    });
    if (!S3) return;

    const SPAN = 17;
    const startX = -((STAGES.length - 1) * SPAN) / 2;

    STAGES.forEach(function (st, i) {
      const x = startX + i * SPAN;
      const isRound = (i === 1 || i === 5);   // 침전지는 원형

      // 반응조 외벽
      const wallGeo = isRound
        ? new THREE.CylinderGeometry(6.6, 6.6, 7, 28, 1, true)
        : new THREE.BoxGeometry(12, 7, 12);
      const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
        color: 0xcbd5e1, roughness: 0.82, metalness: 0.15, side: THREE.DoubleSide
      }));
      wall.position.set(x, 3.5, 0);
      wall.castShadow = true; wall.receiveShadow = true;
      S3.scene.add(wall);

      // 바닥
      const base = new THREE.Mesh(
        isRound ? new THREE.CylinderGeometry(6.6, 6.6, 0.5, 28) : new THREE.BoxGeometry(12, 0.5, 12),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 })
      );
      base.position.set(x, 0.25, 0);
      base.receiveShadow = true;
      S3.scene.add(base);

      // 수면
      const waterGeo = isRound
        ? new THREE.CylinderGeometry(6.3, 6.3, 0.35, 28)
        : new THREE.BoxGeometry(11.4, 0.35, 11.4);
      const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
        color: st.color, transparent: true, opacity: 0.82,
        roughness: 0.14, metalness: 0.6, emissive: st.color, emissiveIntensity: 0.22
      }));
      water.position.set(x, 5.6, 0);
      S3.scene.add(water);
      waterMeshes.push(water);

      // 라벨
      const lab = K.label3D(st.name, '#e6eefc', 0.78);
      lab.position.set(x, 12.5, 0);
      S3.scene.add(lab);

      // 연결 배관
      if (i < STAGES.length - 1) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(0.9, 0.9, SPAN - 12.6, 12),
          new THREE.MeshStandardMaterial({ color: 0x8fa3c4, roughness: 0.5, metalness: 0.55 })
        );
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(x + SPAN / 2, 5, 0);
        S3.scene.add(pipe);
      }

      // 호기조 산기장치 기포
      if (st.name === '호기조') {
        for (let b = 0; b < 40; b++) {
          const bub = new THREE.Mesh(
            new THREE.SphereGeometry(0.34, 6, 6),
            new THREE.MeshStandardMaterial({
              color: 0xffffff, transparent: true, opacity: 0.55,
              emissive: 0x88ffcc, emissiveIntensity: 0.3
            })
          );
          bub.userData = {
            bx: x + (Math.random() - 0.5) * 10,
            bz: (Math.random() - 0.5) * 10,
            t: Math.random(), sp: 0.008 + Math.random() * 0.01
          };
          S3.scene.add(bub);
          tanks.push(bub);
        }
      }
    });

    // 유입/방류 흐름 입자
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x38bdf8, emissiveIntensity: 0.8 })
      );
      d.userData = { t: i / 40, sp: 0.0016 + Math.random() * 0.0009 };
      S3.scene.add(d);
      flowDots.push(d);
    }

    const totalW = (STAGES.length - 1) * SPAN;
    S3.onTick(function () {
      // 기포 상승
      tanks.forEach(function (b) {
        b.userData.t += b.userData.sp;
        if (b.userData.t > 1) b.userData.t = 0;
        b.position.set(b.userData.bx, 1 + b.userData.t * 4.6, b.userData.bz);
        b.material.opacity = 0.6 * (1 - b.userData.t);
      });
      // 공정 흐름
      flowDots.forEach(function (d) {
        d.userData.t += d.userData.sp;
        if (d.userData.t > 1) d.userData.t = 0;
        d.position.set(startX - 6 + d.userData.t * (totalW + 12), 5.4, 0);
        // 진행할수록 맑아짐 (색상 보간)
        const c = new THREE.Color().setHSL(0.52 - d.userData.t * 0.06, 0.75, 0.35 + d.userData.t * 0.35);
        d.material.color = c;
        d.material.emissive = c;
      });
      // 수면 미세 진동
      waterMeshes.forEach(function (w, i) {
        w.position.y = 5.6 + Math.sin(Date.now() * 0.0016 + i) * 0.08;
      });
    });
    S3.start();
  }

  function update3D(r) {
    if (!waterMeshes.length) return;
    // 각 단계 수질(BOD)에 따라 수면 탁도(불투명도·발광) 조절
    r.track.slice(1, STAGES.length + 1).forEach(function (t, i) {
      const w = waterMeshes[i];
      if (!w) return;
      const turb = Math.min(1, t.bod / Math.max(1, r.inflow.bod));
      w.material.opacity = 0.5 + turb * 0.42;
      w.material.emissiveIntensity = 0.1 + (1 - turb) * 0.45;
    });
  }

  /* ---------- 차트 ---------- */
  function updateCharts(r) {
    const labels = r.track.map(function (t) { return t.name; });

    K.chart('waterLine', {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'BOD (mg/L)', data: r.track.map(function (t) { return +t.bod.toFixed(1); }),
            borderColor: '#22c98a', backgroundColor: 'rgba(34,201,138,.12)',
            borderWidth: 2.5, tension: 0.32, fill: true, pointRadius: 3 },
          { label: 'SS (mg/L)', data: r.track.map(function (t) { return +t.ss.toFixed(1); }),
            borderColor: '#38bdf8', borderWidth: 2, tension: 0.32, pointRadius: 3 },
          { label: 'T-N (mg/L)', data: r.track.map(function (t) { return +t.tn.toFixed(1); }),
            borderColor: '#fbbf24', borderWidth: 2, tension: 0.32, pointRadius: 3 },
          { label: 'T-P (mg/L)', data: r.track.map(function (t) { return +t.tp.toFixed(2); }),
            borderColor: '#fb7185', borderWidth: 2, tension: 0.32, pointRadius: 3 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxRotation: 45, minRotation: 30, font: { size: 10 } } },
          y: { type: 'logarithmic', title: { display: true, text: '농도 (mg/L, 로그축)', color: K.chartTheme().muted } }
        }
      }
    });

    // 기준 대비 달성도 (100% = 기준 딱 충족, 낮을수록 여유)
    const pct = function (v, s) { return Math.min(200, v / s * 100); };
    K.chart('waterRadar', {
      type: 'radar',
      data: {
        labels: ['BOD', 'COD', 'SS', 'T-N', 'T-P'],
        datasets: [
          { label: '방류수질 (기준 대비 %)',
            data: [
              +pct(r.eff.bod, STD.bod).toFixed(1),
              +pct(r.eff.cod, STD.cod).toFixed(1),
              +pct(r.eff.ss,  STD.ss).toFixed(1),
              +pct(r.eff.tn,  STD.tn).toFixed(1),
              +pct(r.eff.tp,  STD.tp).toFixed(1)
            ],
            borderColor: r.passAll ? '#22c98a' : '#fb7185',
            backgroundColor: r.passAll ? 'rgba(34,201,138,.22)' : 'rgba(251,113,133,.22)',
            borderWidth: 2.5, pointRadius: 4 },
          { label: '방류수 수질기준 (100%)',
            data: [100, 100, 100, 100, 100],
            borderColor: '#8fa3c4', borderDash: [5, 4], borderWidth: 2,
            backgroundColor: 'transparent', pointRadius: 0 }
        ]
      },
      options: { scales: { r: { suggestedMin: 0, suggestedMax: 130 } } }
    });
  }

  /* ---------- 진단 결과 ---------- */
  function updateVerdict(r) {
    const box = document.getElementById('waterVerdict');
    if (!box) return;

    const rows = [
      ['BOD', r.eff.bod, STD.bod, 'mg/L', r.judge.bod, 1],
      ['COD', r.eff.cod, STD.cod, 'mg/L', r.judge.cod, 1],
      ['SS',  r.eff.ss,  STD.ss,  'mg/L', r.judge.ss,  1],
      ['T-N', r.eff.tn,  STD.tn,  'mg/L', r.judge.tn,  1],
      ['T-P', r.eff.tp,  STD.tp,  'mg/L', r.judge.tp,  2]
    ];

    let html = rows.map(function (x) {
      return '<div class="eq-item"><span class="eq-ico">' + (x[4] ? '✅' : '❌') + '</span>' +
             '<span class="eq-txt"><b>' + x[0] + ' ' + K.fmt(x[1], x[5]) + ' ' + x[3] + '</b>' +
             '<span>기준 ' + x[2] + ' ' + x[3] + ' 이하 · ' + (x[4] ? '적합' : '초과') + '</span></span></div>';
    }).join('');

    html += '<div class="eq-item"><span class="eq-ico">👥</span><span class="eq-txt">' +
            '<b>' + K.fmt(r.population, 0) + ' 명</b><span>처리 대상 인구 환산</span></span></div>';

    html += '<div class="verdict ' + (r.passAll ? 'ok' : 'ng') + '">' +
      (r.passAll
        ? '✅ 적합 — 현 운전조건(' + r.adv.label + ')에서 모든 항목이 공공하수처리시설 방류수 수질기준을 만족합니다. ' +
          'BOD 제거율 ' + r.removal.bod.toFixed(1) + '%, T-N 제거율 ' + r.removal.tn.toFixed(1) + '%.'
        : '⚠️ 부적합 — ' +
          rows.filter(function (x) { return !x[4]; }).map(function (x) { return x[0]; }).join(', ') +
          ' 항목이 기준을 초과합니다. 고도처리 공정 상향, SRT 연장 또는 MLSS 증대를 검토하십시오.') +
      '</div>';

    box.innerHTML = html;

    if (r.passAll && window.confetti) {
      confetti({ particleCount: 80, spread: 68, origin: { y: 0.76 }, colors: ['#38bdf8', '#22c98a'] });
    }
  }

  /* ---------- 전체 갱신 ---------- */
  function run(silent) {
    const r = calculate();
    K.store.water = r;

    K.setNum('q-bod',    r.eff.bod, 1);
    K.setNum('q-tn',     r.eff.tn, 1);
    K.setNum('q-sludge', r.sludge, 1);
    K.setNum('q-power',  r.powerYear, 0);

    // 결과 카드 색상 = 적합 여부
    const bodCard = document.getElementById('q-bod').closest('.rcard');
    const tnCard  = document.getElementById('q-tn').closest('.rcard');
    if (bodCard) { bodCard.classList.remove('eco', 'warn'); bodCard.classList.add(r.judge.bod ? 'eco' : 'warn'); }
    if (tnCard)  { tnCard.classList.remove('aqua', 'warn'); tnCard.classList.add(r.judge.tn ? 'aqua' : 'warn'); }

    update3D(r);
    updateCharts(r);
    updateVerdict(r);

    if (!silent) {
      K.toast(
        '방류 BOD ' + r.eff.bod.toFixed(1) + ' mg/L · ' + (r.passAll ? '전 항목 적합' : '일부 항목 초과'),
        r.passAll ? 'ok' : 'err'
      );
    }
  }

  /* ---------- 초기화 ---------- */
  K.register('water', function () {
    build3D();

    const zero = function (v) { return K.fmt(v, 0); };
    const one  = function (v) { return v.toFixed(1); };

    K.bind('in-qin',  'lbl-qin',  run.bind(null, true), zero);
    K.bind('in-bod',  'lbl-bod',  run.bind(null, true), zero);
    K.bind('in-ss',   'lbl-ss',   run.bind(null, true), zero);
    K.bind('in-tn',   'lbl-tn',   run.bind(null, true), zero);
    K.bind('in-tp',   'lbl-tp',   run.bind(null, true), one);
    K.bind('in-mlss', 'lbl-mlss', run.bind(null, true), zero);
    K.bind('in-srt',  'lbl-srt',  run.bind(null, true), zero);
    K.bind('in-hrt',  'lbl-hrt',  run.bind(null, true), zero);
    K.bind('in-temp', 'lbl-temp', run.bind(null, true), zero);

    const adv = document.getElementById('in-adv');
    if (adv) adv.addEventListener('change', function () { run(true); });

    document.getElementById('waterApply').onclick = function () { run(false); };
    run(true);
  });
})();
