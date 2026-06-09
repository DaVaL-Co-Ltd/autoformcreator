# Instagram/YouTube multi-account setup

이 프로젝트는 Instagram과 YouTube 계정을 여러 개 연결할 수 있다. 앱 안에서는 **설정 > 플랫폼 연동 상태 > 계정 추가**로 OAuth 연결을 시작하지만, Meta/Google 개발자 콘솔의 앱 설정은 사용자가 직접 준비해야 한다.

## 공통 서버 환경변수

운영 서버의 공개 URL이 `https://example.com`이면 callback URL은 다음과 같다.

- Instagram: `https://example.com/api/instagram/oauth/callback`
- YouTube: `https://example.com/api/youtube/oauth/callback`

로컬 기본값은 서버 코드 기준으로 다음 URI를 사용한다.

- Instagram: `http://localhost:3001/api/instagram/oauth/callback`
- YouTube: `http://localhost:3001/api/youtube/oauth/callback`

## Instagram Meta 설정

참고 공식 문서:

- Instagram Graph API Overview: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/
- Content Publishing: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing/

필수 전제:

- Instagram 계정은 Professional 계정이어야 한다.
- Instagram 계정이 Facebook Page에 연결되어 있어야 한다.
- Meta 앱에서 Instagram Graph API를 사용할 수 있어야 한다.

서버 환경변수:

```env
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_REDIRECT_URI=https://example.com/api/instagram/oauth/callback
```

Meta Developers에서 할 일:

1. Meta Developers에서 앱을 생성하거나 기존 앱을 연다.
2. Instagram Graph API 사용에 필요한 제품/권한을 설정한다.
3. OAuth redirect URI에 `INSTAGRAM_REDIRECT_URI` 값을 정확히 등록한다.
4. 앱 권한에 아래 scope가 사용 가능해야 한다.
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
   - `business_management`
5. 개발 모드에서는 앱 역할에 등록된 사용자/테스터 계정만 연결할 수 있다.
6. 실제 외부 계정을 연결하려면 Meta App Review에서 필요한 권한 승인을 받아야 한다.

참고: 서버 코드는 기존 호환을 위해 `META_APP_ID`, `META_APP_SECRET`도 읽는다. redirect URI는 `INSTAGRAM_REDIRECT_URI`를 사용한다.

앱에서 계정 추가:

1. 설정 페이지의 플랫폼 연동 상태로 이동한다.
2. Instagram 카드에서 `Instagram 계정 추가`를 누른다.
3. Meta 로그인/승인을 완료한다.
4. 연결된 Facebook Page 중 Instagram Business 계정이 붙은 항목들이 계정 목록에 등록된다.

## YouTube Google Cloud 설정

참고 공식 문서:

- YouTube OAuth 2.0 server-side flow: https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps
- Videos insert API: https://developers.google.com/youtube/v3/docs/videos/insert

서버 환경변수:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://example.com/api/youtube/oauth/callback
```

Google Cloud Console에서 할 일:

1. Google Cloud 프로젝트를 만든다.
2. API Library에서 **YouTube Data API v3**를 활성화한다.
3. OAuth consent screen을 설정한다.
4. OAuth Client를 `Web application` 유형으로 만든다.
5. Authorized redirect URIs에 `GOOGLE_REDIRECT_URI` 값을 정확히 등록한다.
6. 앱이 요청하는 scope는 현재 코드 기준으로 다음 두 개다.
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
7. 테스트 모드라면 OAuth consent screen의 test users에 연결할 Google 계정을 추가한다.
8. 외부 사용자에게 배포하려면 Google OAuth 앱 검증이 필요할 수 있다.

앱에서 계정 추가:

1. 설정 페이지의 플랫폼 연동 상태로 이동한다.
2. YouTube 카드에서 `Google 계정 추가`를 누른다.
3. Google 로그인/승인을 완료한다.
4. 승인된 계정의 YouTube 채널이 계정 목록에 등록된다.

## 운영 메모

- 같은 콘텐츠를 여러 계정에 올리면 서버가 계정별로 순차 업로드한다.
- 일부 계정 업로드가 실패해도 다른 계정이 성공하면 대표 업로드는 성공으로 기록되고 실패 계정은 응답의 `failures`에 남는다.
- 토큰은 브라우저에 노출하지 않고 서버의 `instagram_tokens`, `youtube_tokens` 테이블에 계정 id별로 저장한다.
- `platform_accounts`에는 계정 표시 정보만 저장한다.
