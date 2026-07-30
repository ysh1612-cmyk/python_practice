/* ============================================================
   sim-waste.js — 자원순환 물질흐름(MFA) 시뮬레이터
   산정근거: 물질흐름분석(Material Flow Analysis)
             발생 → 분리배출 → 선별 → 재활용/소각/매립
             회피배출 = 재활용량 × 성상별 회피배출계수
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO, EF = K.EF;

  let S3 = null, flowGroup = null, particles = [];

  const COMP = [
    { key: 'paper',   id: 'c-paper',   name: '종이',     hex: '#38bdf8', color: 0x38bdf8 },
    { key: 'plastic', id: 'c-plastic', name: '플라스틱', hex: '#fbbf24', color: 0xfbbf24 },
    { key: 'food',    id: 'c-food',    name: '음식물',   hex: '#22c98a', color: 0x22c98a },
    { key: 'glass',   id: 'c-glass',   name: '유리',     hex: '#a78bfa', color: 0xa78bfa },
    { key: 'metal',   id: 'c-metal',   name: '금속',     hex: '#fb7185', color: 0xfb7185 },
    { key: 'etc',     id: 'c-etc',     name: '기타',     hex: '#94a3b8', color: 0x94a3b8 }
  ];

  /* 성상별 실제 재활용 가능성 보정계수 (오염·이물질 등 반영) */
  const RECOVERABLE = { paper: 0.92, plastic: 0.72, food: 0.95, glass: 0.88, metal: 0.96, etc: 0.15 };

  function calculate() {
    const pop    = K.val('in-pop');
    const percap = K.val('in-percap');
    const sep    = K.val('in-sep')  / 100;
    const sort   = K.val('in-sort') / 100;
    const incR   = K.val('in-inc')  / 100;
    const cap    = K.val('in-cap');

    // 연간 총 발생량 (톤/년)
    const total = pop * percap * 365 / 1000;

    // 성상비 정규화
    const rawComp = {};
    let sum = 0;
    COMP.forEach(function (c) {
      const v = Math.max(0, K.val(c.id) || 0);
      rawComp[c.key] = v; sum += v;
    });
    if (sum === 0) { rawComp.etc = 100; sum = 100; }

    // 성상별 물질흐름
    const flow = {};
    let recycled = 0, residue = 0, avoided = 0;
    COMP.forEach(function (c) {
      const share = rawComp[c.key] / sum;
      const gen   = total * share;
      // 재활용량 = 발생량 × 분리배출참여율 × 선별효율 × 성상별 회수가능계수
      const rec   = gen * sep * sort * RECOVERABLE[c.key];
      const res   = gen - rec;
      recycled += rec;
      residue  += res;
      avoided  += rec * EF.recycle[c.key];
      flow[c.key] = { gen: gen, rec: rec, res: res, share: share * 100 };
    });

    const incin  = residue * incR;          // 소각
    const landfl = residue * (1 - incR);    // 매립
    const recRate = total > 0 ? recycled / total * 100 : 0;

    // 온실가스: 회피배출(+) - 소각배출 - 매립배출
    const incGhg  = incin  * EF.wasteInc;
    const landGhg = landfl * EF.wasteLand;
    const netGhg  = avoided - incGhg - landGhg;

    // 매립지 잔여수명 (년) = 잔여용량(m3) / 연간매립부피(m3/년)
    const landVol = landfl / EF.density;
    const life = landVol > 0 ? cap / landVol : 999;

    return {
      pop: pop, percap: percap, total: total, flow: flow, comp: rawComp, compSum: sum,
      recycled: recycled, residue: residue, incin: incin, landfill: landfl,
      recRate: recRate, avoided: avoided, incGhg: incGhg, landGhg: landGhg,
      netGhg: netGhg, landVol: landVol, life: Math.min(life, 999),
      sep: sep * 100, sort: sort * 100, cap: cap
    };
  }

  /* ---------- 3D 처리 흐름 ---------- */
  function build3D() {
    S3 = K.scene3D('waste3d', {
      camera: [0, 42, 78], groundSize: 150, gridDiv: 30, targetY: 6
    });
    if (!S3) return;

    flowGroup = new THREE.Group();
    S3.scene.add(flowGroup);

    // 4개 처리시설 플랫폼: 발생 → 선별 → [재활용 / 소각 / 매립]
    const stations = [
      { name: '발생원',   x: -46, z: 0,   color: 0x94a3b8 },
      { name: '선별시설', x: -14, z: 0,   color: 0x38bdf8 },
      { name: '재활용',   x: 26,  z: -26, color: 0x22c98a },
      { name: '소각',     x: 26,  z: 0,   color: 0xfbbf24 },
      { name: '매립',     x: 26,  z: 26,  color: 0xfb7185 }
    ];

    stations.forEach(function (st) {
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(9, 10, 2.2, 6),
        new THREE.MeshStandardMaterial({
          color: st.color, roughness: 0.42, metalness: 0.35,
          emissive: st.color, emissiveIntensity: 0.16
        })
      );
      pad.position.set(st.x, 1.1, st.z);
      pad.castShadow = true; pad.receiveShadow = true;
      S3.scene.add(pad);

      // 시설 상부 구조물
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(2.4, 3.4, 9, 8),
        new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.5, metalness: 0.4 })
      );
      tower.position.set(st.x, 6.7, st.z);
      tower.castShadow = true;
      S3.scene.add(tower);

      const lab = K.label3D(st.name, '#ffffff', 0.85);
      lab.position.set(st.x, 15, st.z);
      S3.scene.add(lab);
      st.pad = pad;
    });

    // 흐름 입자 — 각 경로를 따라 이동
    const routes = [
      { from: [-46, 4, 0], to: [-14, 4, 0],   color: 0x94a3b8, key: 'gen' },
      { from: [-14, 4, 0], to: [26, 4, -26],  color: 0x22c98a, key: 'rec' },
      { from: [-14, 4, 0], to: [26, 4, 0],    color: 0xfbbf24, key: 'inc' },
      { from: [-14, 4, 0], to: [26, 4, 26],   color: 0xfb7185, key: 'land' }
    ];

    routes.forEach(function (rt) {
      for (let i = 0; i < 26; i++) {
        const p = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.85),
          new THREE.MeshStandardMaterial({
            color: rt.color, emissive: rt.color, emissiveIntensity: 0.7, roughness: 0.35
          })
        );
        p.userData = { route: rt, t: i / 26, speed: 0.0055 + Math.random() * 0.003, active: true };
        flowGroup.add(p);
        particles.push(p);
      }
    });

    S3.onTick(function () {
      particles.forEach(function (p) {
        const u = p.userData;
        if (!u.active) { p.visible = false; return; }
        p.visible = true;
        u.t += u.speed;
        if (u.t > 1) u.t -= 1;
        const f = u.route.from, t = u.route.to;
        p.position.x = f[0] + (t[0] - f[0]) * u.t;
        p.position.z = f[2] + (t[2] - f[2]) * u.t;
        // 포물선 궤적
        p.position.y = f[1] + Math.sin(u.t * Math.PI) * 7;
        p.rotation.x += 0.05; p.rotation.y += 0.04;
      });
    });
    S3.start();
  }

  /** 처리 비율에 따라 각 경로 입자 수를 조절 */
  function update3D(r) {
    if (!particles.length) return;
    const shares = {
      gen:  1,
      rec:  r.total > 0 ? r.recycled / r.total : 0,
      inc:  r.total > 0 ? r.incin    / r.total : 0,
      land: r.total > 0 ? r.landfill / r.total : 0
    };
    const byKey = {};
    particles.forEach(function (p) {
      const k = p.userData.route.key;
      byKey[k] = byKey[k] || [];
      byKey[k].push(p);
    });
    Object.keys(byKey).forEach(function (k) {
      const list = byKey[k];
      const n = Math.max(1, Math.round(list.length * shares[k]));
      list.forEach(function (p, i) { p.userData.active = i < n; });
    });
  }

  /* ---------- D3 Sankey 다이어그램 ---------- */
  function drawSankey(r) {
    const host = document.getElementById('wasteSankey');
    if (!host || !window.d3 || !d3.sankey) return;
    host.innerHTML = '';

    const W = host.clientWidth || 700, H = 320;
    const svg = d3.select(host).append('svg')
      .attr('width', '100%').attr('height', H)
      .attr('viewBox', '0 0 ' + W + ' ' + H);

    const nodes = [{ name: '총 발생량' }, { name: '분리배출' }, { name: '혼합배출' },
                   { name: '재활용' }, { name: '소각' }, { name: '매립' }];
    const sepT = r.total * (r.sep / 100);
    const mixT = r.total - sepT;

    const links = [
      { source: 0, target: 1, value: Math.max(0.01, sepT) },
      { source: 0, target: 2, value: Math.max(0.01, mixT) },
      { source: 1, target: 3, value: Math.max(0.01, r.recycled) },
      { source: 1, target: 4, value: Math.max(0.01, (sepT - r.recycled) * (r.incin / (r.residue || 1))) },
      { source: 2, target: 4, value: Math.max(0.01, r.incin * (mixT / (r.residue || 1))) },
      { source: 2, target: 5, value: Math.max(0.01, r.landfill) }
    ];

    const colors = ['#94a3b8', '#38bdf8', '#64748b', '#22c98a', '#fbbf24', '#fb7185'];

    try {
      const sk = d3.sankey()
        .nodeWidth(18).nodePadding(22)
        .extent([[6, 10], [W - 6, H - 10]]);
      const graph = sk({
        nodes: nodes.map(function (d) { return Object.assign({}, d); }),
        links: links.map(function (d) { return Object.assign({}, d); })
      });

      svg.append('g').selectAll('path').data(graph.links).enter().append('path')
        .attr('d', d3.sankeyLinkHorizontal())
        .attr('fill', 'none')
        .attr('stroke', function (d) { return colors[d.target.index]; })
        .attr('stroke-opacity', 0.32)
        .attr('stroke-width', function (d) { return Math.max(1.5, d.width); })
        .append('title')
        .text(function (d) {
          return d.source.name + ' → ' + d.target.name + '\n' + K.fmt(d.value, 0) + ' 톤/년';
        });

      const node = svg.append('g').selectAll('g').data(graph.nodes).enter().append('g');
      node.append('rect')
        .attr('x', function (d) { return d.x0; })
        .attr('y', function (d) { return d.y0; })
        .attr('width', function (d) { return d.x1 - d.x0; })
        .attr('height', function (d) { return Math.max(2, d.y1 - d.y0); })
        .attr('fill', function (d) { return colors[d.index]; })
        .attr('rx', 4);
      node.append('text')
        .attr('x', function (d) { return d.x0 < W / 2 ? d.x1 + 8 : d.x0 - 8; })
        .attr('y', function (d) { return (d.y0 + d.y1) / 2; })
        .attr('dy', '0.35em')
        .attr('text-anchor', function (d) { return d.x0 < W / 2 ? 'start' : 'end'; })
        .attr('fill', K.chartTheme().text)
        .style('font-size', '11.5px').style('font-weight', '700')
        .text(function (d) { return d.name + ' (' + K.fmt(d.value, 0) + 't)'; });
    } catch (e) {
      host.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:20px">' +
        'Sankey 렌더링을 사용할 수 없습니다 (d3-sankey 로드 실패).</p>';
    }
  }

  /* ---------- 차트 ---------- */
  function updateCharts(r) {
    K.chart('wasteBar', {
      type: 'bar',
      data: {
        labels: COMP.map(function (c) { return c.name; }),
        datasets: [
          { label: '발생량', data: COMP.map(function (c) { return +r.flow[c.key].gen.toFixed(0); }),
            backgroundColor: 'rgba(148,163,184,.35)', borderRadius: 5 },
          { label: '재활용량', data: COMP.map(function (c) { return +r.flow[c.key].rec.toFixed(0); }),
            backgroundColor: COMP.map(function (c) { return c.hex; }), borderRadius: 5 }
        ]
      },
      options: { scales: { y: { title: { display: true, text: '톤/년', color: K.chartTheme().muted } } } }
    });

    // 분리배출 참여율 시나리오별 회피배출
    const xs = [], ys = [], zs = [];
    for (let s = 30; s <= 100; s += 5) {
      xs.push(s + '%');
      const sc = s / 100, sortR = K.val('in-sort') / 100;
      let rec = 0, av = 0;
      COMP.forEach(function (c) {
        const gen = r.total * (r.comp[c.key] / r.compSum);
        const rr = gen * sc * sortR * RECOVERABLE[c.key];
        rec += rr; av += rr * EF.recycle[c.key];
      });
      const res = r.total - rec;
      const inc = res * (K.val('in-inc') / 100);
      const lnd = res - inc;
      ys.push(+av.toFixed(0));
      zs.push(+(av - inc * EF.wasteInc - lnd * EF.wasteLand).toFixed(0));
    }

    K.chart('wasteLine', {
      type: 'line',
      data: {
        labels: xs,
        datasets: [
          { label: '회피배출량(총)', data: ys, borderColor: '#22c98a',
            backgroundColor: 'rgba(34,201,138,.14)', borderWidth: 3, tension: 0.35, fill: true, pointRadius: 0 },
          { label: '순 온실가스 효과', data: zs, borderColor: '#38bdf8',
            borderWidth: 2, borderDash: [5, 4], tension: 0.35, fill: false, pointRadius: 0 }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { title: { display: true, text: '분리배출 참여율', color: K.chartTheme().muted } },
          y: { title: { display: true, text: 'tCO₂eq/년', color: K.chartTheme().muted } }
        }
      }
    });
  }

  /* ---------- 성상비 합계 표시 ---------- */
  function paintSum() {
    let sum = 0;
    COMP.forEach(function (c) { sum += Math.max(0, K.val(c.id) || 0); });
    const el = document.getElementById('compSum');
    const warn = document.getElementById('compWarn');
    if (el) el.textContent = K.fmt(sum, 0);
    if (warn) {
      warn.innerHTML = Math.abs(sum - 100) < 0.5
        ? ''
        : '<span class="bad">— 100%가 아니므로 비율로 자동 정규화됩니다</span>';
    }
  }

  /* ---------- 전체 갱신 ---------- */
  function run(silent) {
    paintSum();
    const r = calculate();
    K.store.waste = r;

    K.setNum('w-total', r.total, 0);
    K.setNum('w-rate',  r.recRate, 1);
    K.setNum('w-ghg',   r.netGhg, 0);
    K.setNum('w-life',  r.life >= 999 ? 999 : r.life, 1);

    update3D(r);
    drawSankey(r);
    updateCharts(r);

    if (!silent) {
      K.toast('재활용률 ' + r.recRate.toFixed(1) + '% · 순 온실가스효과 ' + K.fmt(r.netGhg, 0) + ' tCO₂eq', 'ok');
      if (r.recRate >= 70 && window.confetti) {
        confetti({ particleCount: 100, spread: 75, origin: { y: 0.75 },
          colors: ['#22c98a', '#38bdf8'] });
      }
    }
  }

  /* ---------- 초기화 ---------- */
  K.register('waste', function () {
    build3D();

    K.bind('in-pop',    'lbl-pop',    run.bind(null, true), function (v) { return K.fmt(v, 0); });
    K.bind('in-percap', 'lbl-percap', run.bind(null, true), function (v) { return v.toFixed(2); });
    K.bind('in-sep',    'lbl-sep',    run.bind(null, true), function (v) { return K.fmt(v, 0); });
    K.bind('in-sort',   'lbl-sort',   run.bind(null, true), function (v) { return K.fmt(v, 0); });
    K.bind('in-inc',    'lbl-inc',    run.bind(null, true), function (v) { return K.fmt(v, 0); });
    K.bind('in-cap',    'lbl-cap',    run.bind(null, true), function (v) { return K.fmt(v, 0); });

    const deb = _.debounce(function () { run(true); }, 200);
    COMP.forEach(function (c) {
      const el = document.getElementById(c.id);
      if (el) el.addEventListener('input', deb);
    });

    document.getElementById('wasteApply').onclick = function () { run(false); };
    run(true);
  });
})();
