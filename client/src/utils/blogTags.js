const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'blog',
  'content',
])

function ensureArray(value) {
  return Array.isArray(value) ? value : []
}

function cleanTag(value = '') {
  return String(value || '')
    .replace(/^#+/, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .trim()
}

function addTag(tags, seen, value) {
  const tag = cleanTag(value)
  if (!tag || tag.length < 2) return
  const key = tag.toLowerCase()
  if (seen.has(key)) return
  seen.add(key)
  tags.push(tag)
}

function addSplitTags(tags, seen, value = '') {
  String(value || '')
    .split(/[\s,/#|·:;()[\]{}"'“”‘’]+/u)
    .map(cleanTag)
    .filter((tag) => tag && !STOP_WORDS.has(tag.toLowerCase()))
    .forEach((tag) => addTag(tags, seen, tag))
}

export function normalizeBlogTags(blog = {}, maxTags = 10) {
  const tags = []
  const seen = new Set()

  for (const tag of ensureArray(blog?.tags || blog?.hashtags)) {
    addTag(tags, seen, tag)
  }

  for (const section of ensureArray(blog?.sections)) {
    addTag(tags, seen, section?.keyPhrase)
    addSplitTags(tags, seen, section?.heading)
  }

  addSplitTags(tags, seen, blog?.title)
  addSplitTags(tags, seen, blog?.summary)

  return tags.slice(0, maxTags)
}
