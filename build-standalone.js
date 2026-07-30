/* ============================================================
   build-standalone.js
   assets/ 의 CSS·JS를 index.html 에 인라인으로 삽입해
   단일 파일 배포본(K-ECO-SIM-단일파일.html)을 생성합니다.

   실행:  node build-standalone.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'K-ECO-SIM-단일파일.html');

let html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

// 1) 로컬 CSS 인라인
html = html.replace(
  /<link rel="stylesheet" href="(assets\/[^"]+)">/g,
  (m, href) => {
    const css = fs.readFileSync(path.join(DIR, href), 'utf8');
    return '<style>\n/* ===== ' + href + ' ===== */\n' + css + '\n</style>';
  }
);

// 2) 로컬 JS 인라인 (순서 유지)
html = html.replace(
  /<script src="(assets\/[^"]+)"><\/script>/g,
  (m, src) => {
    const js = fs.readFileSync(path.join(DIR, src), 'utf8');
    return '<script>\n/* ===== ' + src + ' ===== */\n' + js + '\n</script>';
  }
);

fs.writeFileSync(OUT, html, 'utf8');

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log('생성 완료: ' + path.basename(OUT) + ' (' + kb + ' KB)');
console.log('※ 외부 라이브러리는 CDN에서 불러오므로 인터넷 연결이 필요합니다.');
