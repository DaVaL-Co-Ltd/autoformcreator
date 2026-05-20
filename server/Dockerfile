# Playwright 1.59.1 공식 이미지 — Chromium 브라우저와 실행에 필요한 OS 라이브러리가
# 이미지 안에 미리 들어있다. 빌드 단계에서 브라우저를 내려받지 않으므로
# Render Free 플랜에서도 빌드가 멈추지 않는다.
FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

# 1) 의존성 설치 레이어 — package 파일이 바뀔 때만 다시 실행된다(Docker 레이어 캐시).
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# 2) 애플리케이션 소스 복사 (.dockerignore 가 node_modules 를 제외한다).
#    server/index.js 가 ../api/_lib/extractionsStore 를 참조하므로 api 도 함께 복사한다.
COPY server ./server
COPY api ./api

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/server
CMD ["node", "index.js"]
