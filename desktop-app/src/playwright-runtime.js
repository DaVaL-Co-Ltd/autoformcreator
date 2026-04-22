const fs = require('fs')
const path = require('path')

function getBundledBrowsersPath() {
  if (process.resourcesPath) {
    const packagedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'playwright-core',
      '.local-browsers'
    )
    if (fs.existsSync(packagedPath)) {
      return packagedPath
    }
  }

  return path.join(__dirname, '..', 'node_modules', 'playwright-core', '.local-browsers')
}

function getSystemBrowserCachePath() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) {
    return null
  }

  return path.join(localAppData, 'ms-playwright')
}

function findChromiumFolders(basePath) {
  if (!basePath || !fs.existsSync(basePath)) {
    return []
  }

  return fs
    .readdirSync(basePath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map((entry) => path.join(basePath, entry.name))
}

function applyPlaywrightEnvironment() {
  const bundledPath = getBundledBrowsersPath()
  if (findChromiumFolders(bundledPath).length > 0) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPath
  }

  return bundledPath
}

function getPlaywrightDiagnostics() {
  const bundledBrowserPath = getBundledBrowsersPath()
  const systemBrowserCachePath = getSystemBrowserCachePath()

  return {
    bundledBrowserFolders: findChromiumFolders(bundledBrowserPath),
    bundledBrowserFound: findChromiumFolders(bundledBrowserPath).length > 0,
    bundledBrowserPath,
    systemBrowserCacheDetected: findChromiumFolders(systemBrowserCachePath).length > 0,
    systemBrowserCachePath,
  }
}

module.exports = {
  applyPlaywrightEnvironment,
  getBundledBrowsersPath,
  getPlaywrightDiagnostics,
}
