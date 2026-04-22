const fs = require('fs')
const path = require('path')
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  powerSaveBlocker,
  dialog,
  shell,
  nativeImage,
} = require('electron')
const AutoLaunch = require('auto-launch')
const Store = require('electron-store')
const { startServer, stopServer, getServerStatus, setShutdownHandler } = require('./src/server')
const { hasSavedSession, getPlaywrightDiagnostics } = require('./src/naver-upload')

const APP_NAME = 'AutoForm Naver RPA'
const APP_ID = 'com.autoformcreator.naverrpa'

const store = new Store({
  defaults: {
    autoLaunch: true,
    preventSleep: true,
  },
})

let mainWindow = null
let tray = null
let powerSaveId = null

const autoLauncher = new AutoLaunch({
  name: APP_NAME,
  path: app.getPath('exe'),
  isHidden: true,
})

const fallbackIcon = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAKUlEQVR42mNgGAWjYBSMglEwCqZmQAWMglEwCkbBKBgFo2AUjAIAT7QBFfNHYsYAAAAASUVORK5CYII='
)

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
})

function getAssetPath(fileName) {
  return path.join(__dirname, 'assets', fileName)
}

function getWindowIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const iconPath = getAssetPath(iconName)
  return fs.existsSync(iconPath) ? iconPath : undefined
}

function getTrayIcon() {
  const iconPath = getWindowIconPath() || getAssetPath('icon.png')
  if (!iconPath || !fs.existsSync(iconPath)) {
    return fallbackIcon
  }

  const image = nativeImage.createFromPath(iconPath)
  return image.isEmpty() ? fallbackIcon : image
}

function getStatusPayload() {
  const serverStatus = getServerStatus()
  const playwright = getPlaywrightDiagnostics()

  return {
    appVersion: app.getVersion(),
    autoLaunchEnabled: store.get('autoLaunch', true),
    chromiumReady: playwright.bundledBrowserFound || playwright.systemBrowserCacheDetected,
    diagnostics: {
      bundledChromium: playwright.bundledBrowserFound,
      cachedChromium: playwright.systemBrowserCacheDetected,
    },
    loggedIn: hasSavedSession(),
    serverPort: serverStatus.port,
    serverRunning: serverStatus.running,
    serverError: serverStatus.lastError,
  }
}

async function syncAutoLaunch(enabled) {
  store.set('autoLaunch', enabled)

  try {
    if (enabled) {
      await autoLauncher.enable()
    } else {
      await autoLauncher.disable()
    }

    refreshTrayMenu()
    return { enabled, warning: null }
  } catch (error) {
    refreshTrayMenu()
    return { enabled, warning: error.message }
  }
}

async function restartServer() {
  stopServer()

  try {
    await startServer()
    updateTrayStatus('running')
    return { success: true, status: getServerStatus() }
  } catch (error) {
    updateTrayStatus('error')
    return { success: false, error: error.message }
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    minWidth: 520,
    minHeight: 680,
    resizable: false,
    show: false,
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer.html'))
  mainWindow.setMenuBarVisibility(false)

  const startHidden = process.argv.includes('--hidden') || app.commandLine.hasSwitch('hidden')
  if (!startHidden) {
    mainWindow.once('ready-to-show', () => mainWindow.show())
  }

  mainWindow.on('close', (event) => {
    if (app.isQuitting) {
      return
    }

    event.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: '대시보드 열기',
      click: () => mainWindow?.show(),
    },
    {
      label: '로컬 서버 재시작',
      click: async () => {
        await restartServer()
      },
    },
    {
      label: '네이버 재로그인',
      click: () => {
        mainWindow?.show()
        mainWindow?.webContents.send('trigger-login')
      },
    },
    {
      label: '로그 폴더 열기',
      click: () => shell.openPath(app.getPath('userData')),
    },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: store.get('autoLaunch', true),
      click: async (menuItem) => {
        const result = await syncAutoLaunch(menuItem.checked)
        if (result.warning) {
          dialog.showMessageBox({
            type: 'warning',
            message: '자동 실행 설정은 변경되었지만 운영체제 등록 중 경고가 발생했습니다.',
            detail: result.warning,
          })
        }
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])
}

function refreshTrayMenu() {
  if (!tray) {
    return
  }

  tray.setContextMenu(buildTrayMenu())
}

function createTray() {
  tray = new Tray(getTrayIcon())
  refreshTrayMenu()
  updateTrayStatus('running')

  tray.on('click', () => {
    if (!mainWindow) {
      return
    }

    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function updateTrayStatus(status = 'running') {
  if (!tray) {
    return
  }

  const labels = {
    error: `${APP_NAME} - 오류`,
    running: `${APP_NAME} - 실행 중`,
    stopped: `${APP_NAME} - 중지`,
  }

  tray.setToolTip(labels[status] || labels.running)
}

ipcMain.handle('get-status', () => getStatusPayload())
ipcMain.handle('toggle-autolaunch', async (_event, enabled) => syncAutoLaunch(Boolean(enabled)))
ipcMain.handle('restart-server', async () => restartServer())

ipcMain.handle('login-naver', async () => {
  const { naverLogin } = require('./src/naver-login')

  try {
    const result = await naverLogin()
    return { success: true, ...result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('open-logs-folder', () => shell.openPath(app.getPath('userData')))

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_ID)
  setShutdownHandler(() => {
    app.isQuitting = true
    app.quit()
  })
  createMainWindow()
  createTray()

  if (store.get('preventSleep', true)) {
    powerSaveId = powerSaveBlocker.start('prevent-app-suspension')
  }

  if (store.get('autoLaunch', true)) {
    try {
      await autoLauncher.enable()
    } catch (error) {
      console.warn('[AutoLaunch]', error.message)
    }
  }

  try {
    await startServer()
    updateTrayStatus('running')
  } catch (error) {
    updateTrayStatus('error')
    dialog.showErrorBox('로컬 서버 시작 실패', error.message)
  }
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
    return
  }

  createMainWindow()
})

app.on('window-all-closed', (event) => {
  if (process.platform !== 'darwin') {
    return
  }

  if (!app.isQuitting) {
    event.preventDefault()
  }
})

app.on('before-quit', () => {
  app.isQuitting = true

  if (powerSaveId !== null) {
    powerSaveBlocker.stop(powerSaveId)
  }

  stopServer()
})
