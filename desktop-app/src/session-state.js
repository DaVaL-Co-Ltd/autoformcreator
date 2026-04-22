const fs = require('fs')
const { app, safeStorage } = require('electron')
const path = require('path')

function getSessionPath() {
  return path.join(app.getPath('userData'), 'naver-session.json')
}

function wrapSessionPayload(storageState) {
  const serialized = JSON.stringify(storageState)

  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      payload: safeStorage.encryptString(serialized).toString('base64'),
      version: 1,
    }
  }

  return {
    encrypted: false,
    payload: serialized,
    version: 1,
  }
}

function unwrapSessionPayload(rawPayload) {
  if (!rawPayload) {
    return null
  }

  if (rawPayload.version === 1 && typeof rawPayload.payload === 'string') {
    if (rawPayload.encrypted) {
      const decrypted = safeStorage.decryptString(Buffer.from(rawPayload.payload, 'base64'))
      return JSON.parse(decrypted)
    }

    return JSON.parse(rawPayload.payload)
  }

  return rawPayload
}

function loadSessionState() {
  const sessionPath = getSessionPath()
  if (!fs.existsSync(sessionPath)) {
    return null
  }

  const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf8'))
  return unwrapSessionPayload(raw)
}

function saveSessionState(storageState) {
  const sessionPath = getSessionPath()
  fs.writeFileSync(sessionPath, JSON.stringify(wrapSessionPayload(storageState), null, 2), 'utf8')
  return sessionPath
}

module.exports = {
  getSessionPath,
  loadSessionState,
  saveSessionState,
}
