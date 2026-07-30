/* ============================================================
   report.js — 통합 진단 보고서 생성 · PDF/Excel 내보내기
   ============================================================ */

(function () {
  'use strict';
  const K = window.KECO;

  function today() {
    return window.dayjs ? dayjs().format('YYYY년 M월 D일') : new Date().toLocaleDateString('ko-KR');
  }
  function stamp() {
    return window.dayjs ? dayjs().format('YYYY-MM-DD HH:mm') : new Date().toLocaleString('ko-KR');
  }

  function table(rows) {
    return '<table><tbody>' + rows.map(function (r) {
      return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function na(section) {
    return '<p class="note">※ ' + section + ' 모듈을 아직 실행하지 않았습니다. ' +
           '해당 탭을 한 번 열면 결과가 자동으로 포함됩니다.</p>';
  }

  /* ---------- 보고서 HTML 생성 ---------- */
  function build() {
    const s = K.store;
    let h = '';

    h += '<h1>환경 시뮬레이션 통합 진단 보고서</h1>';
    h += '<p class="paper-sub">K-ECO SIM · 한국환경공단 환경 시뮬레이션 종합 플랫폼 &nbsp;|&nbsp; 작성일 ' + today() + '</p>';

    /* ---- 종합 요약 ---- */
    const totalCut =
      (s.carbon ? s.carbon.cut : 0) +
      (s.waste  ? Math.max(0, s.waste.netGhg) : 0) +
      (s.energy ? s.energy.ghg : 0) +
      (s.ev     ? Math.max(0, s.ev.cut) : 0);

    h += '<h2>Ⅰ. 종합 요약</h2>';
    h += '<div class="summary">';
    h += '본 보고서는 K-ECO SIM 플랫폼의 6대 시뮬레이션 모듈 실행 결과를 종합한 것입니다.<br>';
    if (totalCut > 0) {
      h += '분석 대상의 <b>연간 온실가스 감축 잠재량은 총 ' + K.fmt(totalCut, 0) + ' tCO₂eq</b>로 산정되었으며, ' +
           '이는 30년생 소나무 <b>' + K.fmt(totalCut * 1000 / K.EF.treeAbs, 0) + '그루</b>의 연간 흡수량 ' +
           '(산림 약 ' + K.fmt(totalCut * 1000 / K.EF.treeAbs / 1000, 1) + ' ha)에 상응합니다.<br>';
    }
    h += '각 모듈의 산정 결과와 근거는 아래 각 절에 상세히 기술하였습니다.';
    h += '</div>';

    /* ---- 탄소중립 ---- */
    h += '<h2>Ⅱ. 탄소중립 인벤토리 산정 결과</h2>';
    if (s.carbon) {
      const c = s.carbon;
      h += table([
        ['총 배출량 (현재)', K.fmt(c.total, 1) + ' tCO₂eq/년'],
        ['Scope 1 (직접배출)', K.fmt(c.scope1, 1) + ' tCO₂eq/년'],
        ['Scope 2 (간접배출)', K.fmt(c.scope2, 1) + ' tCO₂eq/년'],
        ['감축 후 배출량', K.fmt(c.afterTotal, 1) + ' tCO₂eq/년'],
        ['감축량 / 감축률', K.fmt(c.cut, 1) + ' tCO₂eq/년 (' + c.cutRate.toFixed(1) + '%)'],
        ['상쇄 필요 식재량', K.fmt(c.trees, 0) + ' 그루 (30년생 소나무)'],
        ['2030 NDC 목표(40%) 대비', c.cutRate >= 40
          ? '<b style="color:#0d7a52">달성</b>'
          : '<b style="color:#c2334d">미달 (' + (40 - c.cutRate).toFixed(1) + '%p 부족)</b>']
      ]);
      h += '<p class="note">산정근거: 2006 IPCC 국가인벤토리 가이드라인 Tier 1 (배출량 = 활동자료 × 배출계수), ' +
           '국가 온실가스 배출계수(전력 0.4594 kgCO₂eq/kWh)</p>';
    } else h += na('탄소중립');

    /* ---- 자원순환 ---- */
    h += '<h2>Ⅲ. 자원순환 물질흐름 분석 결과</h2>';
    if (s.waste) {
      const w = s.waste;
      h += table([
        ['대상 인구 / 원단위', K.fmt(w.pop, 0) + ' 명 / ' + w.percap.toFixed(2) + ' kg·인⁻¹·일⁻¹'],
        ['연간 발생량', K.fmt(w.total, 0) + ' 톤/년'],
        ['재활용량 / 재활용률', K.fmt(w.recycled, 0) + ' 톤 (' + w.recRate.toFixed(1) + '%)'],
        ['소각 처리량', K.fmt(w.incin, 0) + ' 톤/년'],
        ['매립 처리량', K.fmt(w.landfill, 0) + ' 톤/년 (' + K.fmt(w.landVol, 0) + ' m³)'],
        ['회피 온실가스', K.fmt(w.avoided, 0) + ' tCO₂eq/년'],
        ['순 온실가스 효과', K.fmt(w.netGhg, 0) + ' tCO₂eq/년'],
        ['매립지 잔여수명', (w.life >= 999 ? '≥ 999' : w.life.toFixed(1)) + ' 년'],
        ['2030 재활용률 목표(70%) 대비', w.recRate >= 70
          ? '<b style="color:#0d7a52">달성</b>'
          : '<b style="color:#c2334d">미달 (' + (70 - w.recRate).toFixed(1) + '%p 부족)</b>']
      ]);
      h += '<p class="note">산정근거: 물질흐름분석(MFA), 성상별 회피배출계수, 매립 CH₄ 간이계수 0.40 tCO₂eq/t</p>';
    } else h += na('자원순환');

    /* ---- 대기확산 ---- */
    h += '<h2>Ⅳ. 대기오염물질 확산 모델링 결과</h2>';
    if (s.air) {
      const a = s.air;
      h += table([
        ['대상 오염물질', a.pollName],
        ['실제 굴뚝높이 / 연기상승고', K.fmt(a.h, 0) + ' m / ' + K.fmt(a.dh, 1) + ' m'],
        ['유효굴뚝높이 (He)', K.fmt(a.He, 1) + ' m'],
        ['배출률 Q', K.fmt(a.Q, 0) + ' g/s'],
        ['기상조건', '풍속 ' + a.u.toFixed(1) + ' m/s · 안정도 ' + a.stab + '급 · ' +
                     (a.terrain === 'urban' ? '도시지역' : '전원지역')],
        ['최대 지표농도', K.fmt(a.cmax, 1) + ' ㎍/㎥'],
        ['최대농도 출현거리', K.fmt(a.xmax, 0) + ' m (풍하방향)'],
        ['대기환경기준', a.std + ' ㎍/㎥ (24시간 평균)'],
        ['기준 대비 / 판정', a.ratio.toFixed(1) + '% — ' + (a.pass
          ? '<b style="color:#0d7a52">적합</b>'
          : '<b style="color:#c2334d">초과</b>')]
      ]);
      h += '<p class="note">산정근거: Gaussian Plume Model, Pasquill-Gifford(Briggs) 확산계수, Holland 연기상승식</p>';
    } else h += na('대기확산');

    /* ---- 신재생에너지 ---- */
    h += '<h2>Ⅴ. 신재생에너지 발전량 산정 결과</h2>';
    if (s.energy) {
      const e = s.energy;
      h += table([
        ['태양광 설비용량 / 일사시간', K.fmt(e.cap, 0) + ' kWp / ' + e.H.toFixed(1) + ' h·일⁻¹'],
        ['태양광 연간 발전량', K.fmt(e.pvYear / 1000, 1) + ' MWh/년 (이용률 ' + e.pvCF.toFixed(1) + '%)'],
        ['풍력 설비 (기수 × 정격)', e.n + ' 기 × ' + K.fmt(e.ratedKW, 0) + ' kW'],
        ['풍력 연간 발전량', K.fmt(e.wtYear / 1000, 1) + ' MWh/년 (이용률 ' + e.cf.toFixed(1) + '%)'],
        ['총 발전량', K.fmt(e.totalKWh / 1000, 1) + ' MWh/년'],
        ['공급 가능 가구수', K.fmt(e.households, 0) + ' 가구 (가구당 3,600 kWh 기준)'],
        ['온실가스 감축량', K.fmt(e.ghg, 0) + ' tCO₂eq/년'],
        ['총 투자비 / 연간수익', K.fmt(e.capex / 1e8, 2) + ' 억원 / ' + K.fmt(e.revenue / 1e8, 2) + ' 억원'],
        ['투자 회수기간', (e.payback >= 999 ? '회수 불가' : e.payback.toFixed(1) + ' 년')]
      ]);
      h += '<p class="note">산정근거: PVWatts 방식(E = P × H × 365 × PR), Betz 출력식(P = ½ρAv³Cp, ρ=1.225 kg/m³)</p>';
    } else h += na('신재생에너지');

    /* ---- 무공해차 ---- */
    h += '<h2>Ⅵ. 무공해차 충전인프라 산정 결과</h2>';
    if (s.ev) {
      const v = s.ev;
      h += table([
        ['전기차 보급 대수', K.fmt(v.n, 0) + ' 대'],
        ['연평균 주행거리 / 전비', K.fmt(v.km, 0) + ' km / ' + v.eff.toFixed(1) + ' km·kWh⁻¹'],
        ['필요 충전기 (완속/급속)', K.fmt(v.chargers, 0) + ' 기 (' + K.fmt(v.slow, 0) + ' / ' + K.fmt(v.fast, 0) + ')'],
        ['연간 충전 전력수요', v.gwh.toFixed(2) + ' GWh/년'],
        ['첨두 계약전력', v.peakMW.toFixed(1) + ' MW'],
        ['내연기관차 대비 감축량', K.fmt(v.cut, 0) + ' tCO₂eq/년 (' + v.cutRate.toFixed(1) + '% 감축)'],
        ['재생에너지 충전 비율', v.green.toFixed(0) + '%'],
        ['연간 충전요금 규모', K.fmt(v.cost / 1e8, 2) + ' 억원 (320원/kWh 기준)']
      ]);
      h += '<p class="note">산정근거: 충전효율 0.90, 내연기관차 연비 12 km/L 가정, K-Means 수요가중 입지 최적화</p>';
    } else h += na('무공해차');

    /* ---- 물환경 ---- */
    h += '<h2>Ⅶ. 하수처리 공정 진단 결과</h2>';
    if (s.water) {
      const q = s.water;
      const mark = function (v, std, dec) {
        const ok = v <= std;
        return K.fmt(v, dec) + ' / ' + std + ' — ' +
          (ok ? '<b style="color:#0d7a52">적합</b>' : '<b style="color:#c2334d">초과</b>');
      };
      h += table([
        ['계획 유량 / 처리인구', K.fmt(q.Q, 0) + ' m³/일 / ' + K.fmt(q.population, 0) + ' 명'],
        ['적용 공정', q.adv.label],
        ['운전조건', 'MLSS ' + K.fmt(q.mlss, 0) + ' mg/L · SRT ' + q.srt + '일 · HRT ' + q.hrt + '시간 · 수온 ' + q.T + '℃'],
        ['방류 BOD (기준 10)', mark(q.eff.bod, 10, 1)],
        ['방류 COD (기준 40)', mark(q.eff.cod, 40, 1)],
        ['방류 SS (기준 10)', mark(q.eff.ss, 10, 1)],
        ['방류 T-N (기준 20)', mark(q.eff.tn, 20, 1)],
        ['방류 T-P (기준 0.2)', mark(q.eff.tp, 0.2, 2)],
        ['BOD 제거율', q.removal.bod.toFixed(1) + '%'],
        ['슬러지 발생량', q.sludge.toFixed(1) + ' 톤/일 (함수율 80%)'],
        ['전력 사용량', K.fmt(q.powerYear, 0) + ' MWh/년 (' + q.powerUnit.toFixed(2) + ' kWh/m³)'],
        ['종합 판정', q.passAll
          ? '<b style="color:#0d7a52">전 항목 적합</b>'
          : '<b style="color:#c2334d">일부 항목 기준 초과</b>']
      ]);
      h += '<p class="note">산정근거: 단위공정별 제거율 모델, 온도보정 θ=1.047, Yobs = Y/(1+kd·SRT), ' +
           '공공하수처리시설 방류수 수질기준(Ⅰ지역)</p>';
    } else h += na('물환경');

    /* ---- 결론 ---- */
    h += '<h2>Ⅷ. 결론 및 정책 제언</h2>';
    h += '<div class="summary">';
    const recs = [];
    if (s.carbon && s.carbon.cutRate < 40)
      recs.push('탄소중립 — 현 시나리오의 감축률이 2030 NDC 목표(40%)에 미달하므로, 재생에너지 전환율(RE100) 및 건물 에너지효율 개선 목표의 상향이 필요합니다.');
    if (s.waste && s.waste.recRate < 70)
      recs.push('자원순환 — 재활용률이 2030 목표(70%)에 미달합니다. 분리배출 참여율 제고 캠페인과 선별시설 자동화(광학·AI 선별) 투자를 우선 검토하십시오.');
    if (s.air && !s.air.pass)
      recs.push('대기환경 — 최대 지표농도가 대기환경기준을 초과합니다. 방지시설 효율 개선을 통한 배출률 저감 또는 굴뚝높이 상향이 요구됩니다.');
    if (s.energy && s.energy.payback > 15)
      recs.push('신재생에너지 — 투자 회수기간이 15년을 초과하여 경제성이 낮습니다. REC 가중치 상향 대상 사업 또는 고일사 지역으로의 입지 재검토가 필요합니다.');
    if (s.ev && s.ev.ratio > 5)
      recs.push('무공해차 — 충전기 1기당 담당 차량이 5대를 초과합니다. 환경부 목표 수준(2~3대/기) 달성을 위한 충전기 확충이 필요합니다.');
    if (s.water && !s.water.passAll)
      recs.push('물환경 — 방류수 일부 항목이 수질기준을 초과합니다. 고도처리 공정 상향(MBR·오존산화) 또는 SRT 연장 운전을 검토하십시오.');

    if (recs.length) {
      h += '<b>주요 개선 제언</b><ol style="margin:10px 0 0 18px;padding:0">' +
           recs.map(function (r) { return '<li style="margin-bottom:7px">' + r + '</li>'; }).join('') +
           '</ol>';
    } else {
      h += '실행된 모든 모듈에서 관련 환경 기준 및 정책 목표를 충족하는 것으로 진단되었습니다. ' +
           '현 수준의 관리체계를 유지하되, 목표 상향에 대비한 추가 감축 여력 확보를 권고합니다.';
    }
    h += '</div>';

    h += '<div class="stamp">' +
         'K-ECO SIM v1.0 &nbsp;|&nbsp; 산출 일시 ' + stamp() + '<br>' +
         '<span style="font-size:11px;color:#8b97a8">본 산정 결과는 정책 검토용 참고자료이며, 법정 인·허가 목적의 공식 산정치가 아닙니다.</span>' +
         '</div>';

    return h;
  }

  /* ---------- Excel 내보내기 ---------- */
  function toExcel() {
    if (!window.XLSX) { K.toast('XLSX 라이브러리를 불러오지 못했습니다.', 'err'); return; }
    const s = K.store;
    const wb = XLSX.utils.book_new();
    let any = false;

    function add(name, rows) {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 34 }, { wch: 22 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, ws, name);
      any = true;
    }

    if (s.carbon) add('탄소중립', [
      ['항목', '값', '단위'],
      ['총 배출량', +s.carbon.total.toFixed(2), 'tCO2eq/년'],
      ['Scope 1', +s.carbon.scope1.toFixed(2), 'tCO2eq/년'],
      ['Scope 2', +s.carbon.scope2.toFixed(2), 'tCO2eq/년'],
      ['감축 후 배출량', +s.carbon.afterTotal.toFixed(2), 'tCO2eq/년'],
      ['감축량', +s.carbon.cut.toFixed(2), 'tCO2eq/년'],
      ['감축률', +s.carbon.cutRate.toFixed(2), '%'],
      ['상쇄 필요 나무', Math.round(s.carbon.trees), '그루']
    ]);

    if (s.waste) add('자원순환', [
      ['항목', '값', '단위'],
      ['연간 발생량', Math.round(s.waste.total), '톤/년'],
      ['재활용량', Math.round(s.waste.recycled), '톤/년'],
      ['재활용률', +s.waste.recRate.toFixed(2), '%'],
      ['소각량', Math.round(s.waste.incin), '톤/년'],
      ['매립량', Math.round(s.waste.landfill), '톤/년'],
      ['회피 온실가스', Math.round(s.waste.avoided), 'tCO2eq/년'],
      ['순 온실가스 효과', Math.round(s.waste.netGhg), 'tCO2eq/년'],
      ['매립지 잔여수명', +s.waste.life.toFixed(1), '년']
    ]);

    if (s.air) add('대기확산', [
      ['항목', '값', '단위'],
      ['대상 오염물질', s.air.pollName, '-'],
      ['굴뚝높이', s.air.h, 'm'],
      ['연기상승고', +s.air.dh.toFixed(2), 'm'],
      ['유효굴뚝높이', +s.air.He.toFixed(2), 'm'],
      ['배출률 Q', s.air.Q, 'g/s'],
      ['풍속', s.air.u, 'm/s'],
      ['대기안정도', s.air.stab, '급'],
      ['최대 지표농도', +s.air.cmax.toFixed(2), 'ug/m3'],
      ['최대농도 출현거리', s.air.xmax, 'm'],
      ['환경기준', s.air.std, 'ug/m3'],
      ['판정', s.air.pass ? '적합' : '초과', '-']
    ]);

    if (s.energy) add('신재생에너지', [
      ['항목', '값', '단위'],
      ['태양광 설비용량', s.energy.cap, 'kWp'],
      ['태양광 발전량', +(s.energy.pvYear / 1000).toFixed(2), 'MWh/년'],
      ['태양광 이용률', +s.energy.pvCF.toFixed(2), '%'],
      ['풍력 기수', s.energy.n, '기'],
      ['풍력 정격출력', Math.round(s.energy.ratedKW), 'kW'],
      ['풍력 발전량', +(s.energy.wtYear / 1000).toFixed(2), 'MWh/년'],
      ['풍력 이용률', +s.energy.cf.toFixed(2), '%'],
      ['총 발전량', +(s.energy.totalKWh / 1000).toFixed(2), 'MWh/년'],
      ['온실가스 감축', Math.round(s.energy.ghg), 'tCO2eq/년'],
      ['투자 회수기간', +s.energy.payback.toFixed(2), '년']
    ]);

    if (s.ev) add('무공해차', [
      ['항목', '값', '단위'],
      ['전기차 대수', s.ev.n, '대'],
      ['필요 충전기', s.ev.chargers, '기'],
      ['  완속', s.ev.slow, '기'],
      ['  급속', s.ev.fast, '기'],
      ['연간 전력수요', +s.ev.gwh.toFixed(3), 'GWh/년'],
      ['첨두 계약전력', +s.ev.peakMW.toFixed(2), 'MW'],
      ['온실가스 감축', Math.round(s.ev.cut), 'tCO2eq/년'],
      ['감축률', +s.ev.cutRate.toFixed(2), '%']
    ]);

    if (s.water) add('물환경', [
      ['항목', '값', '기준'],
      ['계획 유량 (m3/일)', s.water.Q, '-'],
      ['적용 공정', s.water.adv.label, '-'],
      ['방류 BOD (mg/L)', +s.water.eff.bod.toFixed(2), 10],
      ['방류 COD (mg/L)', +s.water.eff.cod.toFixed(2), 40],
      ['방류 SS (mg/L)', +s.water.eff.ss.toFixed(2), 10],
      ['방류 T-N (mg/L)', +s.water.eff.tn.toFixed(2), 20],
      ['방류 T-P (mg/L)', +s.water.eff.tp.toFixed(3), 0.2],
      ['BOD 제거율 (%)', +s.water.removal.bod.toFixed(2), '-'],
      ['슬러지 발생량 (톤/일)', +s.water.sludge.toFixed(2), '-'],
      ['전력 사용량 (MWh/년)', Math.round(s.water.powerYear), '-'],
      ['종합 판정', s.water.passAll ? '적합' : '초과', '-']
    ]);

    if (!any) { K.toast('먼저 시뮬레이션 모듈을 실행해 주세요.', 'warn'); return; }

    const fn = 'K-ECO_SIM_진단결과_' + (window.dayjs ? dayjs().format('YYYYMMDD_HHmm') : 'export') + '.xlsx';
    XLSX.writeFile(wb, fn);
    K.toast('Excel 파일을 저장했습니다: ' + fn, 'ok');
  }

  /* ---------- PDF 내보내기 (html2canvas → jsPDF) ---------- */
  function toPDF() {
    const paper = document.getElementById('reportPaper');
    if (!paper || paper.querySelector('.paper-empty')) {
      K.toast('먼저 보고서를 생성해 주세요.', 'warn');
      return;
    }
    if (!window.html2canvas || !window.jspdf) {
      K.toast('PDF 라이브러리를 불러오지 못했습니다.', 'err');
      return;
    }

    if (window.NProgress) NProgress.start();
    K.toast('PDF를 생성하는 중입니다…', 'info');

    html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', logging: false })
      .then(function (canvas) {
        const jsPDF = window.jspdf.jsPDF;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pw = 210, ph = 297, margin = 8;
        const iw = pw - margin * 2;
        const ih = canvas.height * iw / canvas.width;
        const img = canvas.toDataURL('image/jpeg', 0.94);

        let left = ih, pos = margin;
        pdf.addImage(img, 'JPEG', margin, pos, iw, ih);
        left -= (ph - margin * 2);
        while (left > 0) {
          pos = margin - (ih - left);
          pdf.addPage();
          pdf.addImage(img, 'JPEG', margin, pos, iw, ih);
          left -= (ph - margin * 2);
        }

        const fn = 'K-ECO_SIM_진단보고서_' + (window.dayjs ? dayjs().format('YYYYMMDD_HHmm') : 'report') + '.pdf';
        pdf.save(fn);
        if (window.NProgress) NProgress.done();
        K.toast('PDF를 저장했습니다: ' + fn, 'ok');
      })
      .catch(function (e) {
        console.error(e);
        if (window.NProgress) NProgress.done();
        K.toast('PDF 생성에 실패했습니다.', 'err');
      });
  }

  /* ---------- 초기화 ---------- */
  K.register('report', function () {
    const gen = document.getElementById('genReport');
    const paper = document.getElementById('reportPaper');

    function generate() {
      paper.innerHTML = build();
      const done = Object.keys(K.store).filter(function (k) { return K.store[k]; }).length;
      K.toast('보고서를 생성했습니다 (' + done + '/6 모듈 반영).', 'ok');
      if (window.gsap) gsap.from(paper, { opacity: 0, y: 18, duration: 0.5, ease: 'power2.out' });
    }

    gen.onclick = generate;
    document.getElementById('pdfBtn').onclick = toPDF;
    document.getElementById('xlsBtn').onclick = toExcel;
    document.getElementById('printBtn').onclick = function () {
      if (paper.querySelector('.paper-empty')) generate();
      setTimeout(function () { window.print(); }, 320);
    };

    generate();
  });
})();
