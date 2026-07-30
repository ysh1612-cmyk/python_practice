# K-ECO SIM | 환경시뮬레이터 프로젝트 인수인계 및 종합 작업 내역

이 문서는 **Claude (클로드)** 등 다른 AI 모델이 본 프로젝트의 전체 작업 상태, 기술 스택, Supabase 연동 정보 및 향후 과제를 즉시 파악하고 이어서 개발할 수 있도록 작성된 종합 인수인계 가이드입니다.

---

## 1. 프로젝트 개요

- **프로젝트명**: K-ECO SIM (한국환경공단 환경 시뮬레이션 종합 플랫폼)
- **배포 주소 (Vercel)**: [https://simulator-theta-neon.vercel.app/](https://simulator-theta-neon.vercel.app/)
- **로컬 작업 경로**: `c:\Users\USER\Downloads\기후부html\환경시뮬레이터`
- **주요 목적**: 탄소중립, 자원순환, 대기질, 신재생에너지, 무공해차, 물환경 6대 영역의 공학적 산식을 3D 웹 렌더링 및 실시간 인터랙션으로 계산하는 종합 시뮬레이터

---

## 2. 폴더 및 파일 구조

```
환경시뮬레이터/
├─ index.html                  # 메인 웹사이트 (개발용, 6대 뷰 + Supabase Script + AI 챗봇)
├─ K-ECO-SIM-단일파일.html      # 전체 라이브러리/CSS/JS가 인라인으로 결합된 배포/단일 파일 (199KB)
├─ build-standalone.js         # index.html과 assets/ 를 합쳐 K-ECO-SIM-단일파일.html 생성하는 스크립트
├─ README.md                   # 기본 소개 및 6대 산정 모델 근거 문서
└─ assets/
   ├─ style.css                # 전체 UI 다크/라이트 테마 + 모달 + AI 챗봇 스타일
   ├─ core.js                  # 3D 씬/카메라 생성 헬퍼, 공통 엔진, 배출계수 DB
   ├─ sim-carbon.js            # ① 탄소중립 인벤토리 (IPCC Tier 1)
   ├─ sim-waste.js             # ② 자원순환 물질흐름 (MFA + D3 Sankey)
   ├─ sim-air.js               # ③ 대기오염 확산 (Gaussian Plume + Open-Meteo 실시간 기상 API 연동)
   ├─ sim-energy.js            # ④ 신재생에너지 발전량 (PVWatts + Betz 풍력)
   ├─ sim-ev.js                # ⑤ 무공해차 충전인프라 (Leaflet 지도 + K-Means 최적화)
   ├─ sim-water.js             # ⑥ 하수처리 공정 진단 (A²O 제거율 모델)
   ├─ report.js                # 통합 보고서 생성, PDF/Excel 내보내기
   ├─ boot.js                  # 부팅 스플래시, 대시보드 3D 지구본, 탭 전환, 25종 라이브러리 검수
   └─ supabase-app.js          # [NEW] Supabase Auth, DB 저장, AI 환경 챗봇 연동 모듈
```

---

## 3. 구축된 4대 핵심 신규 기능 & 연동 정보

### 1) 🔒 Supabase Auth (회원가입 & 로그인)
- **위치**: 상단 헤더 우측 `🔒 로그인 / 회원가입` 버튼 및 모달 (`assets/supabase-app.js`)
- **기능**: 이메일/비밀번호 기반 로그인, 회원가입, 세션 상태 자동 점검 및 헤더 사용자 프로필 표시.

### 2) ☁️ Supabase Cloud DB 저장
- **연동 URL**: `https://hhbqelhdyqlhevgixtyb.supabase.co`
- **Anon Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhoYnFlbGhkeXFsaGV2Z2l4dHliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTE1NTUsImV4cCI6MjEwMDk2NzU1NX0.gIyQUjV_rqQdyqftlaPWZbGeWtVO_rSqsHddSR9pMoE`
- **저장 위치**: `📄 보고서` 탭 내 「Supabase Cloud DB 연결됨」 패널
- **저장 대상 테이블**: `simulation_results` (유저 ID, 이메일, 시뮬레이션 계산 상태 JSON 기록)

### 3) 🌿 ECO AI 대화형 환경 챗봇
- **위치**: 웹사이트 우측 하단 플로팅 챗봇 (`💬 ECO AI`)
- **기능**: IPCC 배출계수, Gaussian Plume 대기확산 공식, PVWatts 태양광 발전, A²O 하수처리 공정 등 환경공단 산식 안내 및 실시간 Q&A.

### 4) 📡 실시간 기상/풍속 Open API 연동
- **위치**: `🏭 대기확산` 탭 왼쪽 패널 ➔ `📡 실시간 기상/풍속 API 연동` 버튼
- **연동 API**: Open-Meteo Weather API (`https://api.open-meteo.com/v1/forecast`)
- **기능**: 서울 지역 실시간 풍속(m/s) 및 대기온도(°C)를 라이브로 호출하여 확산 모델에 즉시 반영.

---

## 4. 클로드가 이어서 진행할 작업 (Next Steps)

1. **Git Commit & Push**:
   - 로컬에서 수정된 코드(`index.html`, `assets/`, `K-ECO-SIM-단일파일.html`)를 GitHub에 `git push` 하여 Vercel 배포 사이트에 최신 변경 사항 적용하기.
2. **Supabase Table RLS 설정 (필요시)**:
   - Supabase 대시보드에서 `simulation_results` 테이블 생성 및 RLS(Row Level Security) 정책 확인.
3. **추가 커스텀 기능 개발**:
   - 저장된 시뮬레이션 이력 불러오기(Load History) 목록 UI 추가.
