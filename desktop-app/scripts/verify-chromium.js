const fs = require('fs')
const path = require('path')

const browsersDir = path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers')

function getChromiumFolders(basePath) {
  if (!fs.existsSync(basePath)) {
    return []
  }

  return fs
    .readdirSync(basePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map((entry) => entry.name)
}

const chromiumFolders = getChromiumFolders(browsersDir)

if (chromiumFolders.length === 0) {
  console.error('Bundled Chromium이 없습니다.')
  console.error('desktop-app 폴더에서 `npm run install:chromium` 을 실행한 뒤 다시 빌드하세요.')
  process.exit(1)
}

console.log('Bundled Chromium detected:')
for (const folder of chromiumFolders) {
  console.log(`- ${folder}`)
}
