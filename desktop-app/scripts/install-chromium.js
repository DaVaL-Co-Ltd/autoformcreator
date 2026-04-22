const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')
const playwrightCli = path.join(projectRoot, 'node_modules', 'playwright', 'cli.js')

if (!fs.existsSync(playwrightCli)) {
  console.error('playwright CLI를 찾지 못했습니다. 먼저 npm install 을 실행하세요.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [playwrightCli, 'install', 'chromium'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: '0',
  },
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
