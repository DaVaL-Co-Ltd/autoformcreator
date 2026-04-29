export function stripBlogAutoFormatMarkers(raw = '') {
  return String(raw || '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/--([^-\n]+)--/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_\s][^_]*[^_\s])_/g, '$1')
    .replace(/(^|[^*])\*([^*\s][^*]*[^*\s])\*(?!\*)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~/g, '')
}

export function sanitizeBlogBodyForDisplay(raw = '') {
  return stripBlogAutoFormatMarkers(raw).trim()
}

export function sanitizeBlogBodyForUpload(raw = '') {
  return stripBlogAutoFormatMarkers(raw)
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

