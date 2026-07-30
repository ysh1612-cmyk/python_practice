/* ============================================================
   boot.js — 부팅 · 대시보드 · 네비게이션 · 테마 · 라이브러리 점검
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO;

  /* ---------- 사용 라이브러리 점검 목록 ---------- */
  const LIBS = [
    ['three.js',      function () { return window.THREE; },        '3D 렌더링 (WebGL)'],
    ['OrbitControls', function () { return window.THREE && THREE.OrbitControls; }, '3D 카메라 조작'],
    ['Chart.js',      function () { return window.Chart; },        '차트 시각화'],
    ['D3.js',         function () { return window.d3; },           '데이터 시각화'],
    ['d3-sankey',     function () { return window.d3 && d3.sankey; }, '물질흐름 Sankey'],
    ['d3-contour',    function () { return window.d3 && d3.contours; }, '등농도선 렌더링'],
    ['GSAP',          function () { return window.gsap; },         '고성능 애니메이션'],
    ['anime.js',      function () { return window.anime; },        '요소 애니메이션'],
    ['Leaflet',       function () { return window.L; },            '인터랙티브 지도'],
    ['Lodash',        function () { return window._; },            '유틸리티 (debounce)'],
    ['Day.js',        function () { return window.dayjs; },        '날짜/시간 처리'],
    ['Numeral.js',    function () { return window.numeral; },      '숫자 포맷'],
    ['SweetAlert2',   function () { return window.Swal; },         '모달 다이얼로그'],
    ['Toastify',      function () { return window.Toastify; },     '토스트 알림'],
    ['canvas-confetti', function () { return window.confetti; },   '목표 달성 연출'],
    ['CountUp.js',    function () { return window.countUp; },      '수치 카운트업'],
    ['NProgress',     function () { return window.NProgress; },    '로딩 진행바'],
    ['AOS',           function () { return window.AOS; },          '스크롤 등장효과'],
    ['Popper.js',     function () { return window.Popper; },       '팝오버 위치계산'],
    ['Tippy.js',      function () { return window.tippy; },        '툴팁'],
    ['particles.js',  function () { return window.particlesJS; },  '입자 배경'],
    ['chroma.js',     function () { return window.chroma; },       '색상 스케일'],
    ['html2canvas',   function () { return window.html2canvas; },  '보고서 캡처'],
    ['jsPDF',         function () { return window.jspdf; },        'PDF 생성'],
    ['SheetJS (xlsx)', function () { return window.XLSX; },        'Excel 내보내기']
  ];

  /* ---------- 대시보드 3D 지구본 ---------- */
  function buildGlobe() {
    const S = K.scene3D('heroGlobe', {
      camera: [0, 6, 42], ground: false, fog: false,
      minDist: 26, maxDist: 90, targetY: 0, autoRotate: true
    });
    if (!S) return;

    const R = 13;

    // 본체 — 반투명 와이어 지구
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R, 48, 48),
      new THREE.MeshStandardMaterial({
        color: 0x0e3b53, roughness: 0.55, metalness: 0.4,
        transparent: true, opacity: 0.92,
        emissive: 0x06202f, emissiveIntensity: 0.5
      })
    );
    S.scene.add(globe);

    const wire = new THREE.Mesh(
      new THREE.SphereGeometry(R + 0.18, 30, 22),
      new THREE.MeshBasicMaterial({ color: 0x22c98a, wireframe: true, transparent: true, opacity: 0.2 })
    );
    S.scene.add(wire);

    // 대기 글로우
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(R + 1.6, 40, 40),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.09, side: THREE.BackSide
      })
    );
    S.scene.add(halo);

    // 지표 데이터 포인트 (관측지점 은유)
    const pts = new THREE.Group();
    for (let i = 0; i < 90; i++) {
      const phi = Math.acos(2 * ((i + 0.5) / 90) - 1);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;   // 피보나치 구면 분포
      const c = [0x22c98a, 0x38bdf8, 0xfbbf24][i % 3];
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 8, 8),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.2 })
      );
      dot.position.setFromSphericalCoords(R + 0.35, phi, theta);
      dot.userData = { ph: Math.random() * Math.PI * 2 };
      pts.add(dot);
    }
    S.scene.add(pts);

    // 궤도 링 (관측위성 은유)
    const ringGroup = new THREE.Group();
    [[0.15, 0x22c98a], [-0.5, 0x38bdf8], [0.85, 0xa78bfa]].forEach(function (cfg, i) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R + 4 + i * 2, 0.09, 8, 96),
        new THREE.MeshBasicMaterial({ color: cfg[1], transparent: true, opacity: 0.5 })
      );
      ring.rotation.x = Math.PI / 2 + cfg[0];
      ring.rotation.y = cfg[0] * 0.7;
      ringGroup.add(ring);

      const sat = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55),
        new THREE.MeshStandardMaterial({ color: cfg[1], emissive: cfg[1], emissiveIntensity: 1.1 })
      );
      sat.userData = { r: R + 4 + i * 2, sp: 0.4 + i * 0.22, tilt: cfg[0], off: i * 2 };
      ringGroup.add(sat);
    });
    S.scene.add(ringGroup);

    S.onTick(function (t) {
      globe.rotation.y += 0.0016;
      wire.rotation.y  += 0.0022;
      pts.rotation.y   += 0.0016;
      pts.children.forEach(function (d, i) {
        const s = 1 + Math.sin(t * 2.2 + d.userData.ph) * 0.35;
        d.scale.set(s, s, s);
      });
      ringGroup.children.forEach(function (o) {
        if (!o.userData.r) return;
        const a = t * o.userData.sp + o.userData.off;
        o.position.set(
          Math.cos(a) * o.userData.r,
          Math.sin(a) * o.userData.r * Math.sin(o.userData.tilt),
          Math.sin(a) * o.userData.r * Math.cos(o.userData.tilt)
        );
      });
    });
    S.start();
  }

  /* ---------- KPI 카운트업 ---------- */
  function animateKPI() {
    document.querySelectorAll('.kpi-num').forEach(function (el) {
      const target = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.dec, 10) || 0;
      if (window.countUp) {
        new countUp.CountUp(el, target, {
          decimalPlaces: dec, duration: 2.2, separator: ','
        }).start();
      } else {
        el.textContent = K.fmt(target, dec);
      }
    });
  }

  /* ---------- 라이브러리 점검 배지 ---------- */
  function paintStack() {
    const host = document.getElementById('stackList');
    if (!host) return;
    let ok = 0;
    host.innerHTML = LIBS.map(function (l) {
      let loaded = false;
      try { loaded = !!l[1](); } catch (e) { loaded = false; }
      if (loaded) ok++;
      return '<span class="stack-item' + (loaded ? '' : ' off') + '" data-tip="' + l[2] + '">' +
             (loaded ? '✓' : '✕') + ' <b>' + l[0] + '</b></span>';
    }).join('');

    host.insertAdjacentHTML('beforeend',
      '<span class="stack-item" style="border-color:var(--eco)">' +
      '총 <b>' + LIBS.length + '개</b> 라이브러리 중 <b>' + ok + '개</b> 정상 로드</span>');

    if (window.tippy) {
      tippy('[data-tip]', {
        content: function (ref) { return ref.getAttribute('data-tip'); },
        theme: 'light', delay: [120, 0]
      });
    }
    return ok;
  }

  /* ---------- 입자 배경 ---------- */
  function initParticles() {
    if (!window.particlesJS) return;
    try {
      particlesJS('heroParticles', {
        particles: {
          number: { value: 46, density: { enable: true, value_area: 900 } },
          color: { value: ['#22c98a', '#38bdf8'] },
          shape: { type: 'circle' },
          opacity: { value: 0.35, random: true },
          size: { value: 2.6, random: true },
          line_linked: { enable: true, distance: 145, color: '#2f6f8f', opacity: 0.22, width: 1 },
          move: { enable: true, speed: 1.1, out_mode: 'out' }
        },
        interactivity: {
          events: { onhover: { enable: true, mode: 'grab' }, resize: true },
          modes: { grab: { distance: 150, line_linked: { opacity: 0.45 } } }
        },
        retina_detect: true
      });
    } catch (e) { /* 배경 효과 실패는 무시 */ }
  }

  /* ---------- 시계 ---------- */
  function startClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const tick = function () {
      el.textContent = window.dayjs
        ? dayjs().format('YYYY.MM.DD (ddd) HH:mm:ss')
        : new Date().toLocaleString('ko-KR');
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- 테마 전환 ---------- */
  function initTheme() {
    const btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.onclick = function () {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      btn.textContent = next === 'light' ? '☀️' : '🌙';
      // 차트 테마 재적용
      Object.keys(K.charts).forEach(function (id) {
        const c = K.charts[id];
        if (!c) return;
        const th = K.chartTheme();
        if (c.options.plugins && c.options.plugins.legend)
          c.options.plugins.legend.labels.color = th.text;
        if (c.options.scales) {
          Object.keys(c.options.scales).forEach(function (ax) {
            const sc = c.options.scales[ax];
            if (sc.ticks) sc.ticks.color = th.muted;
            if (sc.grid)  sc.grid.color  = th.grid;
            if (sc.pointLabels) sc.pointLabels.color = th.text;
          });
        }
        c.update('none');
      });
      K.toast(next === 'light' ? '라이트 모드로 전환했습니다.' : '다크 모드로 전환했습니다.', 'info');
    };
  }

  /* ---------- 네비게이션 ---------- */
  function initNav() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { K.go(t.dataset.view); });
    });
    document.querySelectorAll('[data-goto]').forEach(function (el) {
      el.addEventListener('click', function () { K.go(el.dataset.goto); });
    });

    // 키보드 단축키 1~8
    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input,select,textarea')) return;
      const views = ['home', 'carbon', 'waste', 'air', 'energy', 'ev', 'water', 'report'];
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 8) K.go(views[n - 1]);
    });
  }

  /* ---------- 둘러보기 ---------- */
  function initTour() {
    const btn = document.getElementById('tourBtn');
    if (!btn) return;
    btn.onclick = function () {
      if (!window.Swal) { K.go('carbon'); return; }
      Swal.fire({
        title: 'K-ECO SIM 사용 안내',
        html:
          '<div style="text-align:left;font-size:14px;line-height:1.85">' +
          '<b>1. 모듈 선택</b> — 상단 탭에서 6개 시뮬레이션 중 하나를 고릅니다.<br>' +
          '<b>2. 조건 입력</b> — 왼쪽 패널의 슬라이더를 움직이면 결과가 <u>실시간</u>으로 재계산됩니다.<br>' +
          '<b>3. 3D 확인</b> — 3D 화면은 드래그로 회전, 휠로 확대할 수 있습니다.<br>' +
          '<b>4. 보고서</b> — 마지막 「보고서」 탭에서 전체 결과를 PDF·Excel로 내려받습니다.<br><br>' +
          '<span style="color:#8fa3c4;font-size:12.5px">💡 키보드 <b>1~8</b> 키로 탭을 빠르게 이동할 수 있습니다.</span>' +
          '</div>',
        icon: 'info',
        confirmButtonText: '탄소중립 모듈부터 시작',
        showCancelButton: true,
        cancelButtonText: '닫기',
        background: '#111b2d', color: '#e6eefc',
        confirmButtonColor: '#22c98a', cancelButtonColor: '#334155',
        width: 560
      }).then(function (res) { if (res.isConfirmed) K.go('carbon'); });
    };
  }

  /* ---------- 스플래시 진행 ---------- */
  function runSplash(done) {
    const bar = document.querySelector('.splash-bar i');
    const msg = document.getElementById('splashMsg');
    const steps = [
      '3D 렌더링 엔진 로딩…',
      '국가 온실가스 배출계수 적용…',
      '대기확산 모델 준비…',
      '지도 타일 서버 연결…',
      '시뮬레이션 준비 완료'
    ];
    let i = 0;
    const iv = setInterval(function () {
      i++;
      if (bar) bar.style.width = (i / steps.length * 100) + '%';
      if (msg && steps[i - 1]) msg.textContent = steps[i - 1];
      if (i >= steps.length) {
        clearInterval(iv);
        setTimeout(function () {
          const sp = document.getElementById('splash');
          if (sp) sp.classList.add('hide');
          done();
        }, 380);
      }
    }, 260);
  }

  /* ---------- 시작 ---------- */
  window.addEventListener('DOMContentLoaded', function () {
    if (window.NProgress) NProgress.configure({ showSpinner: false, trickleSpeed: 160 });

    initNav();
    initTheme();
    initTour();
    startClock();

    runSplash(function () {
      if (window.AOS) AOS.init({ duration: 720, once: true, offset: 60 });
      initParticles();
      animateKPI();

      try { buildGlobe(); }
      catch (e) { console.warn('지구본 렌더링 실패:', e); }

      const ok = paintStack();

      setTimeout(function () {
        K.toast('K-ECO SIM 준비 완료 — 라이브러리 ' + ok + '개 로드됨', 'ok');
      }, 700);
    });
  });
})();
