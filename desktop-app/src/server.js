const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { uploadToNaver, hasSavedSession, getPlaywrightDiagnostics } = require('./naver-upload')
const { getUploadById, getUploadRuntimeState } = require('./upload-runtime')
const { naverLogin } = require('./naver-login')
const { clearSessionState, validateStoredNaverSession } = require('./session-state')

const PORT = 3000
const MAX_UPLOAD_FILE_SIZE = 15 * 1024 * 1024
const UPLOAD_CLIENT_HEADER = 'x-autoform-client'
const INTERNAL_SHUTDOWN_HEADER = 'x-autoform-internal'
const INTERNAL_SHUTDOWN_VALUE = 'shutdown-v1'
const UPLOAD_SOURCE = 'desktop-helper'

let server = null
let lastError = null
let shutdownHandler = null

const configuredOrigins = String(process.env.AUTOFORM_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function parseOrigin(origin) {
  if (!origin) {
    return null
  }

  try {
    return new URL(origin)
  } catch {
    return null
  }
}

function isAllowedOrigin(origin) {
  const parsedOrigin = parseOrigin(origin)
  if (!parsedOrigin) {
    return false
  }

  if (configuredOrigins.includes(origin)) {
    return true
  }

  return parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:'
}

function applyCorsResponseHeaders(req, res) {
  const origin = req.get('origin')
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
  }

  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.get('Access-Control-Request-Headers') || `Content-Type, ${UPLOAD_CLIENT_HEADER}`
  )

  if (origin && isAllowedOrigin(origin) && req.get('Access-Control-Request-Private-Network') === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
  }
}

function getUploadsDir() {
  const uploadsDir = path.join(app.getPath('userData'), 'uploads')
  fs.mkdirSync(uploadsDir, { recursive: true })
  return uploadsDir
}

async function helperSessionReady(uploadRuntime) {
  if (!hasSavedSession()) {
    return false
  }

  const activeEditorUrl = uploadRuntime?.activeUpload?.editorUrl || ''
  if (/^https:\/\/nid\.naver\.com\/nidlogin\.login/i.test(activeEditorUrl)) {
    return false
  }

  const editorUrl = uploadRuntime?.lastFailedUpload?.editorUrl || ''
  const lastError = uploadRuntime?.lastFailedUpload?.error || ''
  if (/^https:\/\/nid\.naver\.com\/nidlogin\.login/i.test(editorUrl)) {
    return false
  }

  if (/log in again|session is missing|session could not be loaded|session expired/i.test(lastError)) {
    return false
  }

  return validateStoredNaverSession()
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

  if (origin && !isAllowedOrigin(origin)) {
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

  expressApp.get('/', async (_req, res) => {
    const playwright = getPlaywrightDiagnostics()
    const uploadRuntime = getUploadRuntimeState()
    res.json({
      appVersion: app.getVersion(),
      chromiumReady: playwright.bundledBrowserFound || playwright.systemBrowserCacheDetected,
      sessionReady: await helperSessionReady(uploadRuntime),
      status: 'ok',
      uploadRuntime,
    })
  })

  expressApp.get('/api/health', async (_req, res) => {
    const playwright = getPlaywrightDiagnostics()
    const uploadRuntime = getUploadRuntimeState()
    res.json({
      appVersion: app.getVersion(),
      chromiumReady: playwright.bundledBrowserFound || playwright.systemBrowserCacheDetected,
      sessionReady: await helperSessionReady(uploadRuntime),
      status: 'ok',
      uploadRuntime,
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
    const endpoint = `http://127.0.0.1:${PORT}/api/upload`

    const existingRuntime = getUploadRuntimeState()
    if (existingRuntime.activeUpload) {
      cleanupFiles(photoPaths)
      res.status(409).json({
        endpoint,
        source: UPLOAD_SOURCE,
        success: false,
        error: 'Another Naver blog upload is already in progress.',
        activeJobId: existingRuntime.activeUpload.id,
        uploadRuntime: existingRuntime,
      })
      return
    }

    try {
      const sessionReady = await validateStoredNaverSession({ bypassCache: true })
      if (!sessionReady) {
        clearSessionState()
        cleanupFiles(photoPaths)
        res.status(400).json({
          endpoint,
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

      const uploadPromise = uploadToNaver({
        content,
        headless,
        photoPaths,
        scheduledAt,
        tags,
        title,
      })

      const initialRuntime = getUploadRuntimeState()
      if (!initialRuntime.activeUpload) {
        // Synchronous validation inside uploadToNaver rejected before registering a job.
        try {
          await uploadPromise
        } catch (validationError) {
          cleanupFiles(photoPaths)
          console.error('[Desktop API] upload rejected before start', validationError)
          res.status(400).json({
            endpoint,
            source: UPLOAD_SOURCE,
            success: false,
            error: validationError.message,
            uploadRuntime: getUploadRuntimeState(),
          })
          return
        }

        cleanupFiles(photoPaths)
        res.status(500).json({
          endpoint,
          source: UPLOAD_SOURCE,
          success: false,
          error: 'Upload completed without registering a job.',
          uploadRuntime: getUploadRuntimeState(),
        })
        return
      }

      const jobId = initialRuntime.activeUpload.id

      uploadPromise
        .catch((error) => {
          console.error('[Desktop API] background upload failed', error)
        })
        .finally(() => {
          cleanupFiles(photoPaths)
        })

      res.status(202).json({
        endpoint,
        source: UPLOAD_SOURCE,
        success: true,
        jobId,
        status: 'queued',
        uploadRuntime: getUploadRuntimeState(),
      })
    } catch (error) {
      cleanupFiles(photoPaths)
      console.error('[Desktop API]', error)
      res.status(500).json({
        endpoint,
        source: UPLOAD_SOURCE,
        success: false,
        error: error.message,
        uploadRuntime: getUploadRuntimeState(),
      })
    }
  })

  expressApp.get('/api/upload/:id', helperClientGuard, (req, res) => {
    const { id } = req.params
    const endpoint = `http://127.0.0.1:${PORT}/api/upload/${id}`
    const found = getUploadById(id)

    if (!found) {
      res.status(404).json({
        endpoint,
        source: UPLOAD_SOURCE,
        success: false,
        error: 'Upload job not found. The desktop helper may have restarted.',
        uploadRuntime: getUploadRuntimeState(),
      })
      return
    }

    const { state, upload: uploadData } = found

    if (state === 'active') {
      res.json({
        endpoint,
        source: UPLOAD_SOURCE,
        success: true,
        status: 'in_progress',
        upload: uploadData,
        uploadRuntime: getUploadRuntimeState(),
      })
      return
    }

    if (state === 'completed') {
      res.json({
        endpoint,
        source: UPLOAD_SOURCE,
        success: true,
        status: 'completed',
        mode: uploadData.mode || null,
        scheduled: Boolean(uploadData.scheduled),
        scheduledAt: uploadData.scheduledAt || null,
        url: uploadData.url || null,
        upload: uploadData,
        uploadRuntime: getUploadRuntimeState(),
      })
      return
    }

    res.json({
      endpoint,
      source: UPLOAD_SOURCE,
      success: false,
      status: 'failed',
      error: uploadData.error || 'Upload failed.',
      upload: uploadData,
      uploadRuntime: getUploadRuntimeState(),
    })
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
