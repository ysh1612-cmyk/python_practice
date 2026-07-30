/* ============================================================
   sim-carbon.js — 탄소중립 인벤토리 시뮬레이터
   산정근거: 2006 IPCC 국가인벤토리 가이드라인 Tier 1
             배출량 = 활동자료(Activity Data) × 배출계수(Emission Factor)
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO, EF = K.EF;

  let S3 = null;              // three.js 씬
  let barGroup = null;        // 배출량 막대 그룹
  const SECTORS = [
    { key: 'elec',     name: '전력',       color: 0x38bdf8, hex: '#38bdf8' },
    { key: 'gas',      name: '도시가스',   color: 0xfbbf24, hex: '#fbbf24' },
    { key: 'gasoline', name: '휘발유',     color: 0xa78bfa, hex: '#a78bfa' },
    { key: 'diesel',   name: '경유',       color: 0xfb7185, hex: '#fb7185' },
    { key: 'water',    name: '상수도',     color: 0x22d3ee, hex: '#22d3ee' },
    { key: 'waste',    name: '폐기물',     color: 0x22c98a, hex: '#22c98a' }
  ];

  /* ---------- 배출량 산정 (단위: tCO2eq/년) ---------- */
  function calculate() {
    const a = {
      elec:     K.val('in-elec'),
      gas:      K.val('in-gas'),
      gasoline: K.val('in-gasoline'),
      diesel:   K.val('in-diesel'),
      water:    K.val('in-water'),
      waste:    K.val('in-waste')
    };

    // kg → t 변환 (폐기물은 이미 tCO2/t 계수)
    const e = {
      elec:     a.elec     * EF.elec     / 1000,
      gas:      a.gas      * EF.gas      / 1000,
      gasoline: a.gasoline * EF.gasoline / 1000,
      diesel:   a.diesel   * EF.diesel   / 1000,
      water:    a.water    * EF.water    / 1000,
      waste:    a.waste    * EF.wasteInc
    };

    // Scope 구분: Scope1 = 직접연소(가스·수송연료·폐기물), Scope2 = 간접(전력·상수도)
    const scope1 = e.gas + e.gasoline + e.diesel + e.waste;
    const scope2 = e.elec + e.water;
    const total  = scope1 + scope2;

    // ----- 감축 시나리오 -----
    const eff   = K.val('in-eff')   / 100;  // 에너지효율 개선 → 전 부문 사용량 감소
    const re    = K.val('in-re')    / 100;  // 재생에너지 전환 → 전력 배출 상쇄
    const evPct = K.val('in-eveff') / 100;  // 차량 전동화 → 연료 배출을 전력으로 대체

    // 1) 효율개선: 모든 부문 활동량 감소
    const afterEff = {};
    Object.keys(e).forEach(function (k) { afterEff[k] = e[k] * (1 - eff); });

    // 2) 차량 전동화: 전동화 비율만큼 연료 배출 제거, 대신 전력 배출 추가
    //    내연차 1L ≈ 10km 주행 / 전기차 5.2km당 1kWh 가정 → 1L 대체 시 약 1.92 kWh 소요
    const fuelShift = (afterEff.gasoline + afterEff.diesel) * evPct;
    const evElecAdd = ((K.val('in-gasoline') + K.val('in-diesel')) * evPct * 1.92) * EF.elec / 1000;
    afterEff.gasoline *= (1 - evPct);
    afterEff.diesel   *= (1 - evPct);
    afterEff.elec     += evElecAdd;

    // 3) 재생에너지 전환: 전력 부문 배출 상쇄
    afterEff.elec *= (1 - re);

    const after = Object.keys(afterEff).reduce(function (s, k) { return s + afterEff[k]; }, 0);
    const cut   = Math.max(0, total - after);
    const rate  = total > 0 ? (cut / total) * 100 : 0;

    return {
      activity: a, emission: e, after: afterEff,
      scope1: scope1, scope2: scope2,
      total: total, afterTotal: after, cut: cut, cutRate: rate,
      trees: (cut * 1000) / EF.treeAbs,
      fuelShift: fuelShift
    };
  }

  /* ---------- 3D 도시 모형 ---------- */
  function build3D() {
    S3 = K.scene3D('carbon3d', {
      camera: [52, 38, 62], groundSize: 130, gridDiv: 26, targetY: 10, autoRotate: true
    });
    if (!S3) return;

    barGroup = new THREE.Group();
    S3.scene.add(barGroup);

    // 배경 도시 실루엣 (장식용 저층 건물 링)
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x1c3350, roughness: 0.92 });
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      const rad = 52 + (i % 3) * 5;
      const bh = 4 + ((i * 7) % 11);
      const b = new THREE.Mesh(new THREE.BoxGeometry(4.5, bh, 4.5), cityMat);
      b.position.set(Math.cos(ang) * rad, bh / 2, Math.sin(ang) * rad);
      b.rotation.y = ang;
      b.receiveShadow = true;
      S3.scene.add(b);
    }

    S3.onTick(function (t) {
      // 막대 상단 발광 큐브가 위아래로 부유
      barGroup.children.forEach(function (m, i) {
        if (m.userData.glow) m.position.y = m.userData.baseY + Math.sin(t * 1.6 + i) * 0.55;
      });
    });
    S3.start();
  }

  /* ---------- 3D 막대 갱신 ---------- */
  function update3D(r) {
    if (!S3 || !barGroup) return;
    S3.clearGroup(barGroup);

    const max = Math.max.apply(null, SECTORS.map(function (s) { return r.emission[s.key]; })) || 1;
    const SPAN = 12;
    const startX = -((SECTORS.length - 1) * SPAN) / 2;

    SECTORS.forEach(function (sec, i) {
      const cur = r.emission[sec.key];
      const aft = r.after[sec.key];
      const hCur = Math.max(0.6, (cur / max) * 34);
      const hAft = Math.max(0.4, (aft / max) * 34);
      const x = startX + i * SPAN;

      // 현재 배출량 (반투명 외곽)
      const shell = new THREE.Mesh(
        new THREE.BoxGeometry(6.4, hCur, 6.4),
        new THREE.MeshStandardMaterial({
          color: sec.color, transparent: true, opacity: 0.22,
          roughness: 0.4, emissive: sec.color, emissiveIntensity: 0.12
        })
      );
      shell.position.set(x, hCur / 2, 0);
      barGroup.add(shell);

      // 감축 후 배출량 (실체 막대)
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 0.1, 5.2),
        new THREE.MeshStandardMaterial({
          color: sec.color, roughness: 0.32, metalness: 0.42,
          emissive: sec.color, emissiveIntensity: 0.28
        })
      );
      bar.position.set(x, 0.05, 0);
      bar.castShadow = true; bar.receiveShadow = true;
      barGroup.add(bar);

      // GSAP으로 막대가 자라나는 연출
      if (window.gsap) {
        gsap.to(bar.scale, { y: hAft / 0.1, duration: 1.05, ease: 'power3.out', delay: i * 0.06 });
        gsap.to(bar.position, { y: hAft / 2, duration: 1.05, ease: 'power3.out', delay: i * 0.06 });
      } else {
        bar.scale.y = hAft / 0.1; bar.position.y = hAft / 2;
      }

      // 부유 발광 큐브
      const glow = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.5),
        new THREE.MeshStandardMaterial({
          color: sec.color, emissive: sec.color, emissiveIntensity: 1.1,
          transparent: true, opacity: 0.85
        })
      );
      glow.position.set(x, hCur + 5, 0);
      glow.userData = { glow: true, baseY: hCur + 5 };
      barGroup.add(glow);

      // 라벨
      const lab = K.label3D(sec.name, sec.hex, 0.82);
      lab.position.set(x, hCur + 10, 0);
      barGroup.add(lab);

      const num = K.label3D(K.fmt(cur, 0) + ' t', '#ffffff', 0.62);
      num.position.set(x, -0.5, 7.6);
      barGroup.add(num);
    });
  }

  /* ---------- 차트 ---------- */
  function updateCharts(r) {
    // 부문별 도넛
    K.chart('carbonDonut', {
      type: 'doughnut',
      data: {
        labels: SECTORS.map(function (s) { return s.name; }),
        datasets: [{
          data: SECTORS.map(function (s) { return +r.emission[s.key].toFixed(1); }),
          backgroundColor: SECTORS.map(function (s) { return s.hex; }),
          borderColor: 'rgba(0,0,0,.25)', borderWidth: 2, hoverOffset: 10
        }]
      },
      options: {
        cutout: '58%',
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: function (c) {
                const pct = r.total > 0 ? (c.parsed / r.total * 100).toFixed(1) : 0;
                return ' ' + c.label + ': ' + K.fmt(c.parsed, 1) + ' tCO₂eq (' + pct + '%)';
              }
            }
          }
        }
      }
    });

    // 2050 감축경로 — 기준연도부터 순배출 0까지 선형 보간 + 시나리오 반영
    const years = [];
    const bau = [];
    const path = [];
    const target = [];
    const baseYear = 2024, endYear = 2050;
    for (let y = baseYear; y <= endYear; y += 2) {
      years.push(y + '년');
      const p = (y - baseYear) / (endYear - baseYear);
      bau.push(+(r.total * (1 + p * 0.12)).toFixed(1));                 // BAU: 연평균 소폭 증가
      path.push(+(r.total - (r.total - r.afterTotal) * Math.min(1, p * 2.2)).toFixed(1)); // 시나리오 이행
      target.push(+(r.total * (1 - p) * (1 - p * 0.15)).toFixed(1));    // 2050 넷제로 목표경로
    }

    K.chart('carbonPath', {
      type: 'line',
      data: {
        labels: years,
        datasets: [
          { label: 'BAU (감축 미이행)', data: bau, borderColor: '#fb7185',
            backgroundColor: 'rgba(251,113,133,.08)', borderWidth: 2, tension: 0.35, pointRadius: 0, fill: true },
          { label: '본 시나리오 이행', data: path, borderColor: '#22c98a',
            backgroundColor: 'rgba(34,201,138,.14)', borderWidth: 3, tension: 0.35, pointRadius: 0, fill: true },
          { label: '2050 넷제로 목표', data: target, borderColor: '#38bdf8',
            borderWidth: 2, borderDash: [6, 4], tension: 0.3, pointRadius: 0, fill: false }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { y: { title: { display: true, text: 'tCO₂eq/년', color: K.chartTheme().muted, font: { size: 11 } } } }
      }
    });
  }

  /* ---------- 환산 지표 ---------- */
  function updateEquiv(r) {
    const box = document.getElementById('carbonEquiv');
    if (!box) return;
    const cars   = r.cut * 1000 / 2400;          // 승용차 1대 연간 약 2.4 tCO2
    const homes  = r.cut * 1000 / 3200;          // 가구당 연간 약 3.2 tCO2
    const forest = r.trees / 1000;               // 1ha당 약 1,000그루
    const money  = r.cut * 12000;                // 배출권 톤당 약 12,000원 가정

    box.innerHTML =
      item('🌳', K.fmt(r.trees, 0) + ' 그루', '30년생 소나무 식재 효과') +
      item('🌲', K.fmt(forest, 1) + ' ha', '조성 필요 산림 면적') +
      item('🚗', K.fmt(cars, 0) + ' 대', '승용차 연간 운행 중단 효과') +
      item('🏠', K.fmt(homes, 0) + ' 가구', '가구 연간 배출량 상쇄') +
      item('💰', K.fmt(money, 0) + ' 원', '배출권 거래 환산가치 (12,000원/t)') +
      '<div class="verdict ' + (r.cutRate >= 40 ? 'ok' : 'ng') + '">' +
        (r.cutRate >= 40
          ? '✅ 감축률 ' + r.cutRate.toFixed(1) + '% — 2030 NDC 목표(40% 감축) 수준을 달성하는 시나리오입니다.'
          : '⚠️ 감축률 ' + r.cutRate.toFixed(1) + '% — 2030 NDC 목표(40%)에 ' +
            (40 - r.cutRate).toFixed(1) + '%p 부족합니다. 재생에너지 전환율을 높여 보세요.') +
      '</div>';

    if (r.cutRate >= 40 && window.confetti) {
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.75 },
        colors: ['#22c98a', '#38bdf8', '#fbbf24'] });
    }
  }

  function item(ico, big, sub) {
    return '<div class="eq-item"><span class="eq-ico">' + ico + '</span>' +
           '<span class="eq-txt"><b>' + big + '</b><span>' + sub + '</span></span></div>';
  }

  /* ---------- 전체 갱신 ---------- */
  function run(silent) {
    const r = calculate();
    K.store.carbon = r;

    K.setNum('out-total', r.total, 1);
    K.setNum('out-after', r.afterTotal, 1);
    K.setNum('out-cut',   r.cut, 1);
    K.setNum('out-tree',  r.trees, 0);

    update3D(r);
    updateCharts(r);
    updateEquiv(r);
    if (!silent) K.toast('배출량 ' + K.fmt(r.total, 1) + ' tCO₂eq · 감축률 ' + r.cutRate.toFixed(1) + '%', 'ok');
  }

  /* ---------- 초기화 ---------- */
  K.register('carbon', function () {
    build3D();

    const f0 = function (v) { return K.fmt(v, 0); };
    K.bind('in-elec',     'lbl-elec',     run.bind(null, true), f0);
    K.bind('in-gas',      'lbl-gas',      run.bind(null, true), f0);
    K.bind('in-gasoline', 'lbl-gasoline', run.bind(null, true), f0);
    K.bind('in-diesel',   'lbl-diesel',   run.bind(null, true), f0);
    K.bind('in-water',    'lbl-water',    run.bind(null, true), f0);
    K.bind('in-waste',    'lbl-waste',    run.bind(null, true), f0);
    K.bind('in-eff',      'lbl-eff',      run.bind(null, true), f0);
    K.bind('in-re',       'lbl-re',       run.bind(null, true), f0);
    K.bind('in-eveff',    'lbl-eveff',    run.bind(null, true), f0);

    document.getElementById('carbonApply').onclick = function () { run(false); };

    document.getElementById('carbonPreset').onclick = function () {
      const preset = {
        'in-elec': 1200000, 'in-gas': 150000, 'in-gasoline': 60000,
        'in-diesel': 90000, 'in-water': 80000, 'in-waste': 900,
        'in-eff': 25, 'in-re': 45, 'in-eveff': 35
      };
      Object.keys(preset).forEach(function (id) {
        const el = document.getElementById(id);
        if (el) { el.value = preset[id]; el.dispatchEvent(new Event('input')); }
      });
      K.toast('중규모 지자체(인구 30만) 표준 시나리오를 적용했습니다.', 'info');
      setTimeout(function () { run(true); }, 120);
    };

    run(true);
  });
})();
