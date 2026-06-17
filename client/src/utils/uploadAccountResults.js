export function normalizeUploadFailures(failures = []) {
  if (!Array.isArray(failures)) return []

  return failures
    .map((failure) => {
      if (!failure) return null
      if (typeof failure === 'string') {
        return { accountId: null, error: failure }
      }
      return {
        accountId: failure.accountId || failure.id || null,
        error: failure.error || failure.message || '업로드 실패',
      }
    })
    .filter(Boolean)
}

export function normalizeUploadAccountResults(meta = {}) {
  const source = meta && typeof meta === 'object' ? meta : {}
  const results = source.accountResults && typeof source.accountResults === 'object'
    ? source.accountResults
    : {}
  const failures = normalizeUploadFailures(source.failures)
  const failureIds = new Set(failures.map((failure) => failure.accountId).filter(Boolean))

  const successRows = Object.entries(results).map(([accountId, result]) => ({
    accountId,
    status: 'success',
    url: result?.url || result?.permalink || (result?.videoId ? `https://youtu.be/${result.videoId}` : null),
    error: null,
  }))

  const failureRows = failures
    .filter((failure) => !failure.accountId || !results[failure.accountId])
    .map((failure) => ({
      accountId: failure.accountId,
      status: 'failed',
      url: null,
      error: failure.error,
    }))

  return [
    ...successRows.map((row) => (
      failureIds.has(row.accountId) ? { ...row, status: 'partial' } : row
    )),
    ...failureRows,
  ]
}

export function hasUploadAccountFailures(meta = {}) {
  return normalizeUploadFailures(meta?.failures).length > 0
}
