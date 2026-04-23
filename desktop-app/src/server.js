const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { uploadToNaver, hasSavedSession, getPlaywrightDiagnostics } = require('./naver-upload')
const { getUploadRuntimeState } = require('./upload-runtime')
const { naverLogin } = require('./naver-login')

const PORT = 3000
const MAX_UPLOAD_FILE_SIZE = 15 * 1024 * 1024
const UPLOAD_CLIENT_HEADER = 'x-autoform-client'
const INTERNAL_SHUTDOWN_HEADER = 'x-autoform-internal'
const INTERNAL_SHUTDOWN_VALUE = 'shutdown-v1'
const UPLOAD_SOURCE = 'desktop-helper'

let server = null
let lastError = null
let shutdownHandler = null

const allowedOriginPatterns = [
  /^http:\/\/localhost(?::\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(?::\d+)?$/i,
  /^https:\/\/(?:[\w-]+\.)*vercel\.app$/i,
  /^https:\/\/(?:[\w-]+\.)*onrender\.com$/i,
]

const configuredOrigins = String(process.env.AUTOFORM_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function isAllowedOrigin(origin) {
  if (!origin) {
    return false
  }

  return configuredOrigins.includes(origin) || allowedOriginPatterns.some((pattern) => pattern.test(origin))
}

function applyCorsResponseHeaders(req, res) {
  const origin = req.get('origin')
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${UPLOAD_CLIENT_HEADER}`)

  if (req.get('Access-Control-Request-Private-Network') === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
}

function getUploadsDir() {
  const uploadsDir = path.join(app.getPath('userData'), 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  return uploadsDir
}

function parseTags(rawTags) {
  if (!rawTags) {
    return []
  }

  if (Array.isArray(rawTags)) {
    return rawTags
  }

  try {
    const parsed = JSON.parse(rawTags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return String(rawTags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  }
}

function cleanupFiles(paths) {
  for (const filePath of paths) {
    fs.unlink(filePath, () => {})
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, getUploadsDir()),
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname)
    callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: {
    fieldSize: 2 * 1024 * 1024,
    files: 20,
    fileSize: MAX_UPLOAD_FILE_SIZE,
  },
})

function helperClientGuard(req, res, next) {
  const origin = req.get('origin')
  const clientHeader = req.get(UPLOAD_CLIENT_HEADER)

  if (clientHeader !== 'web-client') {
    res.status(403).json({ success: false, error: 'Only the AutoForm web client can access uploads.' })
    return
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ success: false, error: 'Origin is not allowed.' })
    return
  }

  next()
}

function getServerStatus() {
  return {
    lastError,
    port: PORT,
    running: Boolean(server),
    uploadRuntime: getUploadRuntimeState(),
  }
}

function createApp() {
  const expressApp = express()

  expressApp.use(express.json({ limit: '50mb' }))
  expressApp.use((req, res, next) => {
    applyCorsResponseHeaders(req, res)
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  expressApp.get('/', (_req, res) => {
    const playwright = getPlaywrightDiagnostics()
    res.json({
      appVersion: app.getVersion(),
      chromiumReady: playwright.bundledBrowserFound || playwright.systemBrowserCacheDetected,
      sessionReady: hasSavedSession(),
      status: 'ok',
      uploadRuntime: getUploadRuntimeState(),
    })
  })

  expressApp.get('/api/health', (_req, res) => {
    const playwright = getPlaywrightDiagnostics()
    res.json({
      appVersion: app.getVersion(),
      chromiumReady: playwright.bundledBrowserFound || playwright.systemBrowserCacheDetected,
      sessionReady: hasSavedSession(),
      status: 'ok',
      uploadRuntime: getUploadRuntimeState(),
    })
  })

  expressApp.post('/api/internal/shutdown', (req, res) => {
    if (req.ip !== '127.0.0.1' && req.ip !== '::1' && req.ip !== '::ffff:127.0.0.1') {
      res.status(403).json({ success: false, error: 'Local requests only.' })
      return
    }

    if (req.get(INTERNAL_SHUTDOWN_HEADER) !== INTERNAL_SHUTDOWN_VALUE) {
      res.status(403).json({ success: false, error: 'Invalid shutdown token.' })
      return
    }

    if (typeof shutdownHandler !== 'function') {
      res.status(503).json({ success: false, error: 'Shutdown handler unavailable.' })
      return
    }

    res.json({ success: true })
    setTimeout(() => {
      try {
        shutdownHandler()
      } catch (error) {
        console.error('[Desktop API] shutdown failed', error)
      }
    }, 100)
  })

  expressApp.post('/api/session/naver/login', helperClientGuard, async (_req, res) => {
    try {
      const result = await naverLogin()
      res.json({
        success: true,
        endpoint: `http://127.0.0.1:${PORT}/api/session/naver/login`,
        source: UPLOAD_SOURCE,
        sessionPath: result.sessionPath,
        uploadRuntime: getUploadRuntimeState(),
      })
    } catch (error) {
      console.error('[Desktop API] Naver login failed', error)
      res.status(500).json({
        success: false,
        endpoint: `http://127.0.0.1:${PORT}/api/session/naver/login`,
        source: UPLOAD_SOURCE,
        error: error.message,
        uploadRuntime: getUploadRuntimeState(),
      })
    }
  })

  expressApp.post('/api/upload', helperClientGuard, upload.array('photos', 20), async (req, res) => {
    const photoPaths = (req.files || []).map((file) => file.path)

    try {
      if (!hasSavedSession()) {
        cleanupFiles(photoPaths)
        res.status(400).json({
          endpoint: `http://127.0.0.1:${PORT}/api/upload`,
          source: UPLOAD_SOURCE,
          success: false,
          error: 'Naver session is missing. Please log in again from the desktop app.',
          uploadRuntime: getUploadRuntimeState(),
        })
        return
      }

      const { content, scheduledAt, showBrowser, title } = req.body
      const tags = parseTags(req.body.tags)
      const headless = showBrowser !== 'true'

      const result = await uploadToNaver({
        content,
        headless,
        photoPaths,
        scheduledAt,
        tags,
        title,
      })

      cleanupFiles(photoPaths)
      res.json({
        ...result,
        endpoint: `http://127.0.0.1:${PORT}/api/upload`,
        source: UPLOAD_SOURCE,
        uploadRuntime: getUploadRuntimeState(),
      })
    } catch (error) {
      cleanupFiles(photoPaths)
      console.error('[Desktop API]', error)
      res.status(500).json({
        endpoint: `http://127.0.0.1:${PORT}/api/upload`,
        source: UPLOAD_SOURCE,
        success: false,
        error: error.message,
        uploadRuntime: getUploadRuntimeState(),
      })
    }
  })

  return expressApp
}

function startServer() {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(getServerStatus())
      return
    }

    lastError = null
    const expressApp = createApp()

    server = expressApp.listen(PORT, '127.0.0.1', () => {
      console.log(`[Desktop API] listening on http://127.0.0.1:${PORT}`)
      resolve(getServerStatus())
    })

    server.on('error', (error) => {
      lastError = error.message
      server = null
      reject(error)
    })
  })
}

function stopServer() {
  if (!server) {
    return
  }

  server.close()
  server = null
}

module.exports = {
  getServerStatus,
  setShutdownHandler: (handler) => {
    shutdownHandler = handler
  },
  startServer,
  stopServer,
}
