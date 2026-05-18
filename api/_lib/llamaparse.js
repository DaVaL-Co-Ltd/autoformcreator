function getLlamaParseApiKey() {
  return String(process.env.LLAMAPARSE_API_KEY || '').trim()
}

function getLlamaParseAuthHeader() {
  const apiKey = getLlamaParseApiKey()
  if (!apiKey) return null
  return `Bearer ${apiKey}`
}

module.exports = {
  getLlamaParseApiKey,
  getLlamaParseAuthHeader,
}
