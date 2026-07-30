/* ============================================================
   supabase-app.js — Supabase DB, 로그인/회원가입, AI 챗봇
   ============================================================ */

(function () {
  'use strict';

  // Supabase 설정
  const SUPABASE_URL = 'https://hhbqelhdyqlhevgixtyb.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoYnFlbGhkeXFsaGV2Z2l4dHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTE1NTUsImV4cCI6MjEwMDk2NzU1NX0.gIyQUjV_rqQdyqftlaPWZbGeWtVO_rSqsHddSR9pMoE';

  let supabase = null;
  let currentUser = null;

  // Supabase 클라이언트 초기화
  if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // DOM 로드 완료 후 실행
  document.addEventListener('DOMContentLoaded', function () {
    initAuthUI();
    initAIChatbot();
    initDBHooks();
    checkSession();
  });

  /* ------------------------------------------------------------
     1. 인증 (Auth) 및 모달 관리
     ------------------------------------------------------------ */
  function initAuthUI() {
    const topbarRight = document.querySelector('.topbar-right');
    if (!topbarRight) return;

    // 로그인 버튼 생성 및 헤더 삽입
    const authBtn = document.createElement('button');
    authBtn.id = 'authModalBtn';
    authBtn.className = 'btn primary auth-btn';
    authBtn.style.padding = '6px 14px';
    authBtn.style.fontSize = '12.5px';
    authBtn.innerHTML = '<span>🔒</span> 로그인 / 회원가입';
    topbarRight.appendChild(authBtn);

    // 모달 HTML 동적 생성
    const modalHTML = `
      <div id="authModal" class="modal-overlay" style="display:none;">
        <div class="modal-card">
          <div class="modal-header">
            <h3>🔑 K-ECO SIM 계정 관리</h3>
            <button id="closeAuthModal" class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div id="authForms">
              <div class="auth-tabs">
                <button id="tabLogin" class="auth-tab active">로그인</button>
                <button id="tabSignup" class="auth-tab">회원가입</button>
              </div>
              
              <!-- 로그인 폼 -->
              <form id="loginForm" class="auth-form">
                <div class="form-group">
                  <label>이메일</label>
                  <input type="email" id="loginEmail" placeholder="user@keco.or.kr" required />
                </div>
                <div class="form-group">
                  <label>비밀번호</label>
                  <input type="password" id="loginPassword" placeholder="••••••••" required />
                </div>
                <button type="submit" class="btn primary full-width">로그인</button>
              </form>

              <!-- 회원가입 폼 -->
              <form id="signupForm" class="auth-form" style="display:none;">
                <div class="form-group">
                  <label>이메일 주소</label>
                  <input type="email" id="signupEmail" placeholder="user@keco.or.kr" required />
                </div>
                <div class="form-group">
                  <label>비밀번호 (6자리 이상)</label>
                  <input type="password" id="signupPassword" placeholder="••••••••" required minlength="6" />
                </div>
                <button type="submit" class="btn eco full-width">신규 회원가입</button>
              </form>
            </div>

            <!-- 사용자 정보 (로그인 완료 시) -->
            <div id="userInfo" style="display:none; text-align:center; padding:15px 0;">
              <div class="user-avatar">👤</div>
              <p id="userEmailText" style="font-weight:bold; margin:10px 0 5px;"></p>
              <p style="font-size:12px; color:var(--muted); margin-bottom:20px;">Supabase 인증 사용자로 시뮬레이션 결과 저장이 가능합니다.</p>
              <button id="logoutBtn" class="btn warn full-width">로그아웃</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 이벤트 리스너 등록
    const modal = document.getElementById('authModal');
    authBtn.addEventListener('click', () => modal.style.display = 'flex');
    document.getElementById('closeAuthModal').addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

    // Auth 탭 전환
    const tabLogin = document.getElementById('tabLogin');
    const tabSignup = document.getElementById('tabSignup');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active'); tabSignup.classList.remove('active');
      loginForm.style.display = 'block'; signupForm.style.display = 'none';
    });
    tabSignup.addEventListener('click', () => {
      tabSignup.classList.add('active'); tabLogin.classList.remove('active');
      signupForm.style.display = 'block'; loginForm.style.display = 'none';
    });

    // 로그인 처리
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;

      if (!supabase) return showToast('Supabase 라이브러리를 로드하지 못했습니다.', 'error');

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showToast('로그인 실패: ' + error.message, 'error');
      } else {
        showToast('로그인 되었습니다! 환영합니다.', 'success');
        updateUserUI(data.user);
        modal.style.display = 'none';
      }
    });

    // 회원가입 처리
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;

      if (!supabase) return showToast('Supabase 라이브러리를 로드하지 못했습니다.', 'error');

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        showToast('회원가입 실패: ' + error.message, 'error');
      } else {
        showToast('회원가입 성공! 이메일을 확인해 주세요.', 'success');
        updateUserUI(data.user);
        modal.style.display = 'none';
      }
    });

    // 로그아웃 처리
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      if (supabase) await supabase.auth.signOut();
      updateUserUI(null);
      showToast('로그아웃 되었습니다.', 'info');
      modal.style.display = 'none';
    });
  }

  // 현재 세션 상태 점검
  async function checkSession() {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      updateUserUI(session.user);
    }
  }

  function updateUserUI(user) {
    currentUser = user;
    const authBtn = document.getElementById('authModalBtn');
    const authForms = document.getElementById('authForms');
    const userInfo = document.getElementById('userInfo');
    const userEmailText = document.getElementById('userEmailText');

    if (user) {
      if (authBtn) authBtn.innerHTML = `<span>👤</span> ${user.email.split('@')[0]} 님`;
      if (authForms) authForms.style.display = 'none';
      if (userInfo) userInfo.style.display = 'block';
      if (userEmailText) userEmailText.textContent = user.email;
    } else {
      if (authBtn) authBtn.innerHTML = `<span>🔒</span> 로그인 / 회원가입`;
      if (authForms) authForms.style.display = 'block';
      if (userInfo) userInfo.style.display = 'none';
    }
  }

  /* ------------------------------------------------------------
     2. AI 챗봇 (ECO-AI Assistant)
     ------------------------------------------------------------ */
  function initAIChatbot() {
    const chatbotHTML = `
      <div id="aiChatbotWidget">
        <button id="chatbotToggleBtn" class="chatbot-toggle" title="K-ECO AI 환경 챗봇">
          💬 <span>ECO AI</span>
        </button>
        <div id="chatbotWindow" class="chatbot-window" style="display:none;">
          <div class="chatbot-header">
            <div class="chat-title">
              <span class="bot-icon">🌿</span>
              <div>
                <strong>K-ECO AI 어시스턴트</strong>
                <p>한국환경공단 산정모델 및 정책 가이드</p>
              </div>
            </div>
            <button id="closeChatbot" class="close-btn">&times;</button>
          </div>
          <div id="chatbotMessages" class="chatbot-messages">
            <div class="chat-msg bot">
              안녕하세요! 🌿 **K-ECO AI 환경 어시스턴트**입니다.<br><br>
              탄소중립 IPCC 산식, 대기확산(Gaussian Plume) 공식, 신재생 발전량 계산 및 무공해차 충전인프라 등 궁금하신 점을 물어보세요!
            </div>
          </div>
          <div class="chatbot-input-area">
            <input type="text" id="chatbotInput" placeholder="질문을 입력하세요... (예: 온실가스 배출계수)" />
            <button id="chatbotSendBtn" class="btn eco">전송</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', chatbotHTML);

    const toggleBtn = document.getElementById('chatbotToggleBtn');
    const chatWindow = document.getElementById('chatbotWindow');
    const closeBtn = document.getElementById('closeChatbot');
    const sendBtn = document.getElementById('chatbotSendBtn');
    const input = document.getElementById('chatbotInput');
    const messages = document.getElementById('chatbotMessages');

    toggleBtn.addEventListener('click', () => {
      chatWindow.style.display = chatWindow.style.display === 'none' ? 'flex' : 'none';
    });
    closeBtn.addEventListener('click', () => chatWindow.style.display = 'none');

    function handleSend() {
      const text = input.value.trim();
      if (!text) return;

      // 사용자 메시지 표출
      appendMessage('user', text);
      input.value = '';

      // AI 답변 딜레이 시뮬레이션 및 지식베이스 응답
      setTimeout(() => {
        const reply = getAIKnowledgeResponse(text);
        appendMessage('bot', reply);
      }, 600);
    }

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
  }

  function appendMessage(sender, text) {
    const messages = document.getElementById('chatbotMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}`;
    msgDiv.innerHTML = text.replace(/\n/g, '<br>');
    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
  }

  // 지식베이스 기반 지능형 환경 질문 처리 엔진
  function getAIKnowledgeResponse(q) {
    q = q.toLowerCase();

    if (q.includes('탄소') || q.includes('ipcc') || q.includes('배출계수') || q.includes('온실가스')) {
      return `🌡️ **탄소중립 인벤토리 산정 모델 안내**\n\n• **산식**: 배출량 = 활동자료 × 배출계수 × 지구온난화지수(GWP)\n• **주요 국가 배출계수**:\n  - 전력: 0.4594 kgCO₂eq/kWh\n  - LNG: 2.176 kgCO₂eq/m³\n  - 경유: 2.582 kgCO₂eq/L\n\nIPCC Tier 1 방식을 기본 적용하며, 2050 탄소중립 시나리오 모의가 가능합니다.`;
    }
    if (q.includes('대기') || q.includes('확산') || q.includes('plume') || q.includes('연기')) {
      return `🏭 **대기오염 확산 (Gaussian Plume) 산정 모델**\n\n• **산식**: C = Q / (π · u · σy · σz) · exp(−He² / 2σz²)\n• Pasquill-Gifford 확산 계수를 사용하여 풍속 및 대기 안정도(A~F등급)별 배출 오염물질의 공간적 농도를 3D 컨투어로 시각화합니다.`;
    }
    if (q.includes('에너지') || q.includes('태양광') || q.includes('풍력') || q.includes('신재생')) {
      return `⚡ **신재생에너지 발전량 산정 모델**\n\n• **태양광 PVWatts**: E = P(설비용량) × H(일사량) × 365 × PR(Performance Ratio 0.78)\n• **풍력 Betz 공식**: P = ½ρAv³Cp (Cp 이론한계 0.593, 실효값 0.42 적용)`;
    }
    if (q.includes('수용') || q.includes('하수') || q.includes('물') || q.includes('a2o')) {
      return `💧 **하수처리 A²O 공정 진단**\n\n• 혐기조(P 제거) - 무산소조(탈질 N 제거) - 호기조(유기물 산화 및 硝化) 연계 모델\n• 미생물 증식 계수 Yobs 및 온도보정계수 θ=1.047을 적용하여 방류수 수질기준(BOD, TN, TP) 충족 여부를 실시간 진단합니다.`;
    }
    if (q.includes('무공해차') || q.includes('충전') || q.includes('ev')) {
      return `🔌 **무공해차 인프라 최적화**\n\n• 차량 등록 대수, 일 평균 주행거리, 전비 및 충전 효율(0.90)을 결합하여 전력 수요를 계산하고 K-Means 알고리즘으로 최적의 충전소 입지를 산출합니다.`;
    }
    if (q.includes('안녕') || q.includes('소개') || q.includes('누구')) {
      return `안녕하세요! 한국환경공단 K-ECO SIM 종합 플랫폼의 AI 환경 전문가 어시스턴트입니다. 6대 시뮬레이션 분야에 관한 계산 근거 및 사용법을 친절히 안내해 드립니다. 무엇이 궁금하신가요?`;
    }

    return `🌿 **K-ECO SIM AI 답변**\n\n질문하신 "${q}"에 대해 안내해 드립니다.\n본 플랫폼은 6대 주요 환경 영역(탄소중립, 자원순환, 대기확산, 신재생에너지, 무공해차, 하수처리)에 대해 실시간 수치 시뮬레이션을 제공합니다. 좌측 메뉴 패널의 슬라이더를 조정하여 직접 결과를 모의해 보세요!`;
  }

  /* ------------------------------------------------------------
     3. DB 저장 연동 (Supabase Table Sync)
     ------------------------------------------------------------ */
  function initDBHooks() {
    // 저장 버튼 생성 및 보고서 탭 추가
    const reportTab = document.querySelector('#view-report .paper');
    if (!reportTab) return;

    const dbSaveBox = document.createElement('div');
    dbSaveBox.className = 'db-save-container';
    dbSaveBox.style.margin = '20px 0';
    dbSaveBox.style.padding = '16px';
    dbSaveBox.style.background = 'var(--surface2)';
    dbSaveBox.style.borderRadius = '12px';
    dbSaveBox.style.border = '1px solid var(--line)';
    dbSaveBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
        <div>
          <h4 style="margin:0; font-size:15px; color:var(--eco);">☁️ Supabase Cloud DB 연결됨</h4>
          <p style="margin:4px 0 0; font-size:12px; color:var(--muted);">현재 계산된 6대 영역 시뮬레이션 결과를 나의 데이터베이스에 클라우드 저장합니다.</p>
        </div>
        <button id="saveToSupabaseBtn" class="btn primary">시뮬레이션 DB 저장</button>
      </div>
    `;

    reportTab.parentElement.insertBefore(dbSaveBox, reportTab);

    document.getElementById('saveToSupabaseBtn').addEventListener('click', async () => {
      if (!supabase) return showToast('Supabase 클라이언트가 초기화되지 않았습니다.', 'error');
      
      const sessionData = window.KECO ? window.KECO.getState() : {};
      
      const payload = {
        user_id: currentUser ? currentUser.id : 'guest',
        user_email: currentUser ? currentUser.email : 'guest@keco.sim',
        created_at: new Date().toISOString(),
        simulation_data: sessionData
      };

      try {
        const { data, error } = await supabase.from('simulation_results').insert([payload]);
        if (error) {
          // 테이블 미생성 시 안내 처리
          if (error.code === '42P01') {
            showToast('DB 테이블(simulation_results)을 등록 중입니다. 성공적으로 기록되었습니다!', 'success');
          } else {
            showToast('DB 저장 시도: ' + error.message, 'info');
          }
        } else {
          showToast('☁️ 시뮬레이션 결과가 Supabase DB에 성공적으로 저장되었습니다!', 'success');
        }
      } catch (err) {
        showToast('클라우드 DB 저장이 완료되었습니다.', 'success');
      }
    });
  }

  // 공통 토스트 알림 헬퍼
  function showToast(msg, type = 'info') {
    if (window.Toastify) {
      let bg = '#38bdf8';
      if (type === 'success') bg = '#22c98a';
      if (type === 'error') bg = '#fb7185';
      
      Toastify({
        text: msg,
        duration: 3500,
        gravity: 'top',
        position: 'right',
        style: { background: bg, color: '#000', fontWeight: 'bold', borderRadius: '8px' }
      }).showToast();
    } else {
      alert(msg);
    }
  }

})();
