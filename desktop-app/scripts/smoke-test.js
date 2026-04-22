const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const requiredFiles = [
  'main.js',
  'preload.js',
  'renderer.html',
  path.join('src', 'server.js'),
  path.join('src', 'naver-login.js'),
  path.join('src', 'naver-upload.js'),
  path.join('src', 'playwright-runtime.js'),
  path.join('src', 'session-state.js'),
  path.join('scripts', 'install-chromium.js'),
  path.join('scripts', 'verify-chromium.js'),
]

const missingFiles = requiredFiles.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)))
if (missingFiles.length > 0) {
  console.error('필수 파일이 누락되었습니다:')
  for (const file of missingFiles) {
    console.error(`- ${file}`)
  }
  process.exit(1)
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
if (!packageJson.scripts || !packageJson.scripts['build:win']) {
  console.error('package.json에 build:win 스크립트가 없습니다.')
  process.exit(1)
}

console.log('Smoke test passed.')
