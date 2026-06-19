# AutoFormCreator

AI 기반 콘텐츠 자동 생성 및 업로드 보조 도구입니다. PDF/문서 자료를 분석해 블로그, 뉴스레터, 인스타그램 카드, 유튜브 쇼츠 대본과 영상을 생성하고, 플랫폼 업로드까지 이어갈 수 있도록 구성되어 있습니다.

## 주요 기능

- 문서 업로드 및 분석: LlamaParse로 PDF/문서 텍스트를 추출하고 Gemini로 핵심 내용을 검증·요약합니다.
- 채널별 콘텐츠 생성: 블로그 글, 뉴스레터, 인스타그램 문구/카드, 쇼츠 대본을 생성합니다.
- 쇼츠 생성 방식:
  - 직접 영상까지 생성: HeyGen API로 아바타 영상 생성, 자막 번인, 결과 저장까지 처리합니다.
  - 영상 프롬포트만 생성: 1인 컨셉 전용입니다. 생성된 대본과 HeyGen Video Agent용 프롬포트를 사용자가 HeyGen 홈페이지에 직접 붙여넣어 제작합니다.
- 쇼츠 컨셉 프리셋: 동완쌤 데이터 브리핑, 면접 답변 클리닉, 학부모 멘탈 케어, 제자 루틴/공부법 등 브랜드형 숏폼 컨셉을 제공합니다.
- 이미지/카드 생성: 블로그 썸네일, 인스타그램 카드형 이미지, 업로드 이미지 합성을 지원합니다.
- 플랫폼 연동: YouTube, Instagram 업로드 세션과 예약 업로드 흐름을 지원합니다.
- 결과 저장: Supabase를 통해 생성 결과와 미디어 URL을 저장합니다.

## 프로젝트 구조

```text
.
├── client/        # React + Vite 프론트엔드
├── server/        # Express API 프록시, HeyGen/Instagram/YouTube/미디어 처리
├── api/           # 공용 API/lib 코드 및 서버리스 호환 엔트리
├── db/            # 데이터베이스 관련 파일
├── docs/          # 운영/연동 문서
├── scripts/       # 보조 스크립트
├── desktop-app/   # 데스크톱 헬퍼 앱
└── tools/         # 개발/운영 도구
```

## 로컬 실행

Node.js 20 이상을 권장합니다.

```bash
# 프론트엔드
cd client
npm install
npm run dev
```

```bash
# API 서버
cd server
npm install
npm run dev
```

기본 포트는 다음과 같습니다.

- 프론트엔드: Vite dev server 기본 포트
- API 서버: `http://localhost:3001`

프론트엔드에서 로컬 API 서버를 사용하려면 `client/.env.local`에 다음 값을 설정합니다.

```env
VITE_SERVER_URL=http://localhost:3001
```

## 빌드 및 검증

```bash
cd client
npm run build
```

```bash
cd client
npm run lint
```

서버는 별도 빌드 단계 없이 Node.js로 실행됩니다.

```bash
cd server
npm start
```

## 주요 환경변수

실제 키 값은 커밋하지 말고 `.env.local` 또는 배포 환경변수에 설정합니다.

### 클라이언트

```env
VITE_SERVER_URL=http://localhost:3001
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DESKTOP_HELPER_DOWNLOAD_URL=
```

### 서버

```env
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
API_SECRET=

GEMINI_API_KEYS=
GEMINI_API_KEY=
GOOGLE_API_KEY=
LLAMAPARSE_API_KEY=
HEYGEN_API_KEY=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_KEY=
JWT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/youtube/oauth/callback

INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=http://localhost:3001/api/instagram/oauth/callback
INSTAGRAM_ACCESS_TOKEN=
INSTAGRAM_BUSINESS_ID=
```

## 쇼츠 생성 운영 메모

- 직접 영상까지 생성은 HeyGen API를 사용하므로 계정 크레딧이 소모됩니다.
- 영상 프롬포트만 생성은 HeyGen Video Agent에 붙여넣기 위한 1인 컨셉만 지원합니다.
- 2인 이상 아바타 컨셉은 Video Agent의 단일 아바타 제약 때문에 프롬포트만 생성 모드에서 선택할 수 없습니다.
- 2인 이상 컨셉 영상이 필요하면 직접 영상까지 생성 모드를 사용합니다.
- 생성된 영상은 가능하면 Supabase에 업로드해 서버 재시작이나 Render 슬립 이후에도 접근 가능하게 유지합니다.

## 배포 메모

- 프론트엔드는 Vite 빌드 결과물을 정적 호스팅할 수 있습니다.
- 서버는 Express 앱이며 `server/index.js`를 `npm start`로 실행합니다.
- Render 등 서버 배포 환경에서는 `PORT`, API 키, Supabase 서비스 키, OAuth redirect URI를 배포 환경에 맞춰 설정해야 합니다.
- 텍스트 파일은 UTF-8로 유지합니다. 한글 문자열을 수정한 뒤 깨진 문자나 물음표 대체 문자가 생기지 않았는지 확인합니다.

## 관련 문서

- [다중 플랫폼 계정 설정](docs/multi-account-platform-setup.md)
