import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isInstagramMediaIdUnavailableError,
  publishInstagramMediaWithRetry,
} from './instagram-publish.js'

test('retries when Instagram publish returns Media ID is not available', async () => {
  let attempts = 0
  let readinessChecks = 0

  const result = await publishInstagramMediaWithRetry({
    creationId: '1789',
    baseDelayMs: 0,
    logger: { warn() {} },
    publish: async () => {
      attempts += 1
      if (attempts < 3) {
        throw new Error('Media ID is not available')
      }
      return { id: 'published-media' }
    },
    waitUntilReady: async () => {
      readinessChecks += 1
    },
  })

  assert.deepEqual(result, { id: 'published-media' })
  assert.equal(attempts, 3)
  assert.equal(readinessChecks, 2)
})

test('does not retry non-transient Instagram publish errors', async () => {
  let attempts = 0

  await assert.rejects(
    publishInstagramMediaWithRetry({
      creationId: '1789',
      baseDelayMs: 0,
      logger: { warn() {} },
      publish: async () => {
        attempts += 1
        throw new Error('Invalid OAuth access token.')
      },
    }),
    /Invalid OAuth access token\./
  )

  assert.equal(attempts, 1)
})

test('matches the transient Media ID error case-insensitively', () => {
  assert.equal(isInstagramMediaIdUnavailableError(new Error('media id IS NOT available')), true)
  assert.equal(isInstagramMediaIdUnavailableError(new Error('Other error')), false)
})
