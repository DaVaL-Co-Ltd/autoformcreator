# AutoForm Naver RPA 데스크탑 앱

네이버 블로그 자동 업로드 도우미 Electron 앱

## 기능

- Windows/Mac 데스크탑 앱 (.exe / .dmg)
- 시스템 트레이 상주
- Windows 시작 시 자동 실행
- localhost:3000 RPA 서버 내장
- Playwright + Chromium 포함
- 네이버 세션 자동 유지

## 개발 환경 설정

```bash
cd desktop-app
npm install
npx playwright install chromium
npm start
```

## 빌드 (사용자 배포용 설치 파일 생성)

### Windows .exe 인스톨러
```bash
npm run build:win
```
→ `dist/AutoForm Naver RPA Setup 1.0.0.exe` 생성

### Mac .dmg
```bash
npm run build:mac
```

## 배포 흐름

1. 제작자가 빌드한 `.exe` 파일을 웹사이트에 업로드
2. 사용자가 다운로드 → 설치 실행
3. 앱 실행 → "네이버 로그인" 버튼 클릭 → 로그인
4. 창 닫으면 트레이로 최소화 + 자동 실행 등록됨
5. 이후 PC 껐다 켜도 자동 실행

## 아이콘 추가 필요

`assets/icon.ico` (Windows), `assets/icon.icns` (Mac), `assets/icon.png` (공통) 파일 추가 필요.

간단히 256x256 PNG 하나를 `icon.png`로 저장하면 시작 가능.

## 폴더 구조

```
desktop-app/
├── package.json
├── main.js             # Electron 진입점
├── preload.js
├── renderer.html       # 메인 UI
├── src/
│   ├── server.js       # Express + Multer 서버
│   ├── naver-upload.js # 블로그 업로드 (Playwright)
│   └── naver-login.js  # 로그인 + 세션 저장
└── assets/
    └── icon.png (ico/icns)
```
