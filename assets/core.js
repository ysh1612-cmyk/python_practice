/* ============================================================
   core.js — 공통 엔진 (유틸 · 3D 헬퍼 · 네비게이션 · 계수 상수)
   ============================================================ */

window.KECO = (function () {
  'use strict';

  /* ---------- 국가 온실가스 배출계수 및 환경 상수 ----------
     출처: 2006 IPCC 국가인벤토리 가이드라인, 국가 온실가스 배출계수(2021),
           환경부 온실가스 배출량 산정지침, 대기환경보전법 시행규칙        */
  const EF = {
    elec:      0.4594,  // kgCO2eq / kWh   (국가 전력 배출계수)
    gas:       2.176,   // kgCO2eq / m3    (도시가스 LNG)
    gasoline:  2.097,   // kgCO2 / L
    diesel:    2.582,   // kgCO2 / L
    water:     0.332,   // kgCO2 / m3      (상수도 생산·공급)
    wasteInc:  1.10,    // tCO2 / t        (생활폐기물 소각)
    wasteLand: 0.40,    // tCO2eq / t      (매립 CH4 간이계수)
    treeAbs:   6.6,     // kgCO2 / 그루·년 (30년생 소나무)
    // 재활용에 따른 회피 배출계수 (tCO2eq / t)
    recycle: { paper: 3.00, plastic: 2.00, food: 0.35, glass: 0.30, metal: 4.50, etc: 0.20 },
    // 폐기물 겉보기 밀도 (t / m3) — 매립 용량 산정용
    density:   0.85
  };

  /* ---------- 대기환경기준 (24시간 평균, ㎍/㎥ 환산) ---------- */
  const AQ_STD = {
    so2:  { name: 'SO₂',    std: 131, unit: '㎍/㎥' },
    no2:  { name: 'NO₂',    std: 113, unit: '㎍/㎥' },
    pm10: { name: 'PM-10',  std: 100, unit: '㎍/㎥' },
    pm25: { name: 'PM-2.5', std: 35,  unit: '㎍/㎥' }
  };

  /* ---------- 공공하수처리시설 방류수 수질기준 (1일 500㎥ 이상, Ⅲ지역) ----------
     BOD 10 / COD 40 / SS 10 / T-N 20 / T-P 0.5 mg/L 이하                        */
  const EFF_STD = { bod: 10, cod: 40, ss: 10, tn: 20, tp: 0.5 };

  /* ---------- 시뮬레이션 결과 저장소 (보고서 모듈이 참조) ---------- */
  const store = { carbon: null, waste: null, air: null, energy: null, ev: null, water: null };

  /* ============================================================
     숫자 · 문자 유틸
     ============================================================ */
  function fmt(n, dec) {
    if (!isFinite(n)) return '-';
    dec = dec === undefined ? 0 : dec;
    return Number(n).toLocaleString('ko-KR', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }

  /** 값에 따라 소수점 자릿수를 자동 결정 */
  function fmtAuto(n) {
    const a = Math.abs(n);
    if (a >= 1000) return fmt(n, 0);
    if (a >= 100)  return fmt(n, 1);
    if (a >= 1)    return fmt(n, 2);
    return fmt(n, 3);
  }

  /** 결과 카드 숫자를 카운트업 애니메이션으로 갱신 */
  function setNum(id, value, dec) {
    const el = document.getElementById(id);
    if (!el) return;
    dec = dec === undefined ? 0 : dec;
    if (window.countUp && isFinite(value)) {
      const from = parseFloat(String(el.textContent).replace(/,/g, '')) || 0;
      new countUp.CountUp(el, value, {
        startVal: from, decimalPlaces: dec, duration: 0.9, separator: ','
      }).start();
    } else {
      el.textContent = fmt(value, dec);
    }
  }

  function toast(msg, type) {
    if (!window.Toastify) return;
    const bg = {
      ok:   'linear-gradient(135deg,#22c98a,#0fa06b)',
      warn: 'linear-gradient(135deg,#fbbf24,#f59e0b)',
      err:  'linear-gradient(135deg,#fb7185,#e11d48)',
      info: 'linear-gradient(135deg,#38bdf8,#0284c7)'
    }[type || 'ok'];
    Toastify({
      text: msg, duration: 2600, gravity: 'bottom', position: 'right',
      style: { background: bg, borderRadius: '10px', fontWeight: '700', fontSize: '13px' }
    }).showToast();
  }

  /** 슬라이더와 라벨을 묶고, 변경 시 콜백을 디바운스 실행 */
  function bind(inputId, labelId, onChange, formatter) {
    const inp = document.getElementById(inputId);
    const lab = document.getElementById(labelId);
    if (!inp) return null;
    const paint = function () {
      if (lab) lab.textContent = formatter ? formatter(parseFloat(inp.value)) : fmt(parseFloat(inp.value));
    };
    const debounced = _.debounce(function () { if (onChange) onChange(); }, 90);
    inp.addEventListener('input', function () { paint(); debounced(); });
    paint();
    return inp;
  }

  function val(id) { const e = document.getElementById(id); return e ? parseFloat(e.value) : 0; }
  function raw(id) { const e = document.getElementById(id); return e ? e.value : ''; }

  /* ============================================================
     Three.js 공통 씬 생성기
     ============================================================ */
  function scene3D(hostId, opts) {
    const host = document.getElementById(hostId);
    if (!host || !window.THREE) return null;
    opts = opts || {};

    // 재초기화 시 기존 캔버스 제거
    host.innerHTML = '';

    const w = host.clientWidth || 600;
    const h = host.clientHeight || 380;

    const scene = new THREE.Scene();
    scene.background = null;
    if (opts.fog !== false) scene.fog = new THREE.Fog(0x0a1220, 60, 260);

    const camera = new THREE.PerspectiveCamera(opts.fov || 50, w / h, 0.1, 2000);
    const cp = opts.camera || [45, 32, 55];
    camera.position.set(cp[0], cp[1], cp[2]);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);

    // 조명
    scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x0b1220, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(48, 70, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;   sun.shadow.camera.bottom = -90;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x66aaff, 0.35);
    fill.position.set(-40, 24, -30);
    scene.add(fill);

    // 바닥 + 그리드
    if (opts.ground !== false) {
      const gsz = opts.groundSize || 150;
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(gsz / 2, 64),
        new THREE.MeshStandardMaterial({
          color: opts.groundColor || 0x14233a, roughness: 0.95, metalness: 0.05
        })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const grid = new THREE.GridHelper(gsz, opts.gridDiv || 30, 0x2a4260, 0x1b2c44);
      grid.position.y = 0.02;
      scene.add(grid);
    }

    // 컨트롤
    let controls = null;
    if (window.THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.minDistance = opts.minDist || 15;
      controls.maxDistance = opts.maxDist || 320;
      controls.maxPolarAngle = Math.PI / 2 - 0.03;
      controls.target.set(0, opts.targetY || 8, 0);
      if (opts.autoRotate) { controls.autoRotate = true; controls.autoRotateSpeed = 0.55; }
      controls.update();
    }

    // 반응형
    const onResize = _.debounce(function () {
      const nw = host.clientWidth, nh = host.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }, 140);
    window.addEventListener('resize', onResize);

    const api = {
      scene: scene, camera: camera, renderer: renderer, controls: controls,
      host: host, tickFns: [], _raf: null, _stopped: false,

      /** 매 프레임 실행할 함수 등록 */
      onTick: function (fn) { this.tickFns.push(fn); return this; },

      /** 렌더 루프 시작 */
      start: function () {
        const self = this;
        let t = 0;
        (function loop() {
          if (self._stopped) return;
          self._raf = requestAnimationFrame(loop);
          t += 0.016;
          for (let i = 0; i < self.tickFns.length; i++) self.tickFns[i](t);
          if (self.controls) self.controls.update();
          self.renderer.render(self.scene, self.camera);
        })();
        return this;
      },

      /** 정리 (뷰 재초기화 시 호출) */
      dispose: function () {
        this._stopped = true;
        if (this._raf) cancelAnimationFrame(this._raf);
        window.removeEventListener('resize', onResize);
        this.scene.traverse(function (o) {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (Array.isArray(o.material)) o.material.forEach(function (m) { m.dispose(); });
            else o.material.dispose();
          }
        });
        this.renderer.dispose();
        if (this.host) this.host.innerHTML = '';
      },

      /** 씬에 붙인 동적 그룹 초기화용 헬퍼 */
      clearGroup: function (group) {
        while (group.children.length) {
          const c = group.children.pop();
          if (c.geometry) c.geometry.dispose();
          if (c.material) {
            if (Array.isArray(c.material)) c.material.forEach(function (m) { m.dispose(); });
            else c.material.dispose();
          }
          group.remove(c);
        }
      }
    };
    return api;
  }

  /** 3D 공간에 텍스트 라벨(스프라이트) 생성 */
  function label3D(text, color, scale) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(10,18,32,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(0, 0, 256, 64, 14); ctx.fill(); }
    else ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = color || '#e6eefc';
    ctx.font = 'bold 30px "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);

    const tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const s = scale || 1;
    sp.scale.set(11 * s, 2.75 * s, 1);
    return sp;
  }

  /* ============================================================
     Chart.js 공통 테마
     ============================================================ */
  function chartTheme() {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    return {
      text:  light ? '#334155' : '#c7d5ec',
      muted: light ? '#64748b' : '#8fa3c4',
      grid:  light ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.07)'
    };
  }

  /** 기존 차트를 파괴하고 새로 생성 (중복 렌더 방지) */
  const charts = {};
  function chart(canvasId, config) {
    const cv = document.getElementById(canvasId);
    if (!cv || !window.Chart) return null;
    if (charts[canvasId]) charts[canvasId].destroy();

    const th = chartTheme();
    config.options = config.options || {};
    config.options.responsive = true;
    config.options.maintainAspectRatio = false;
    config.options.animation = { duration: 700, easing: 'easeOutQuart' };

    config.options.plugins = config.options.plugins || {};
    config.options.plugins.legend = Object.assign(
      { labels: { color: th.text, font: { size: 11.5, weight: '600' }, boxWidth: 12, padding: 12 } },
      config.options.plugins.legend || {}
    );
    config.options.plugins.tooltip = Object.assign({
      backgroundColor: 'rgba(10,18,32,.94)', titleColor: '#fff', bodyColor: '#c7d5ec',
      borderColor: 'rgba(34,201,138,.4)', borderWidth: 1, padding: 11, cornerRadius: 8
    }, config.options.plugins.tooltip || {});

    if (config.type !== 'doughnut' && config.type !== 'pie' && config.type !== 'radar') {
      config.options.scales = config.options.scales || {};
      ['x', 'y'].forEach(function (ax) {
        config.options.scales[ax] = Object.assign({
          ticks: { color: th.muted, font: { size: 11 } },
          grid:  { color: th.grid, drawBorder: false }
        }, config.options.scales[ax] || {});
      });
    }
    if (config.type === 'radar') {
      config.options.scales = config.options.scales || {};
      config.options.scales.r = Object.assign({
        angleLines: { color: th.grid }, grid: { color: th.grid },
        pointLabels: { color: th.text, font: { size: 11.5, weight: '600' } },
        ticks: { color: th.muted, backdropColor: 'transparent', font: { size: 10 } }
      }, config.options.scales.r || {});
    }

    charts[canvasId] = new Chart(cv, config);
    return charts[canvasId];
  }

  /* ============================================================
     뷰 네비게이션
     ============================================================ */
  const initialized = {};
  const initializers = {};

  /** 뷰가 처음 열릴 때 실행할 초기화 함수 등록 */
  function register(view, fn) { initializers[view] = fn; }

  function go(view) {
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });

    const target = document.getElementById('view-' + view);
    const tab = document.querySelector('.tab[data-view="' + view + '"]');
    if (target) target.classList.add('active');
    if (tab) tab.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 지연 초기화 — 첫 진입 시에만 무거운 3D/차트 생성
    if (!initialized[view] && initializers[view]) {
      if (window.NProgress) NProgress.start();
      setTimeout(function () {
        try {
          initializers[view]();
          initialized[view] = true;
        } catch (e) {
          console.error('[' + view + '] 초기화 실패:', e);
          toast(view + ' 모듈 초기화 중 오류가 발생했습니다.', 'err');
        }
        if (window.NProgress) NProgress.done();
      }, 60);
    } else if (window.AOS) {
      AOS.refresh();
    }
  }

  /* ============================================================
     공개 API
     ============================================================ */
  return {
    EF: EF, AQ_STD: AQ_STD, EFF_STD: EFF_STD, store: store,
    fmt: fmt, fmtAuto: fmtAuto, setNum: setNum, toast: toast,
    bind: bind, val: val, raw: raw,
    scene3D: scene3D, label3D: label3D,
    chart: chart, chartTheme: chartTheme, charts: charts,
    register: register, go: go
  };
})();
