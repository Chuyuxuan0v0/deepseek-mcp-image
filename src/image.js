import { readFile } from 'node:fs/promises'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
const DEFAULT_FETCH_TIMEOUT_MS = 15_000

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number)
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = octets
  return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
    || a === 192 && b === 168
}

function assertPublicHttpUrl(source) {
  let url
  try {
    url = new URL(source)
  } catch {
    throw new Error('图片 URL 格式无效')
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('图片 URL 必须使用 http(s) 协议')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const privateIpv6 = hostname === '::1' || hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80:')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || privateIpv6 || isPrivateIpv4(hostname) || net.isIP(hostname) === 0 && hostname === 'metadata.google.internal') {
    throw new Error('出于安全原因，不允许访问本机、内网或云元数据地址')
  }
}

const MAGIC_SNIFFERS = [
  {
    mime: 'image/png',
    test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
      && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: 'image/jpeg',
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    test: (b) => b.length >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    mime: 'image/webp',
    test: (b) => b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  {
    mime: 'image/bmp',
    test: (b) => b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d,
  },
  {
    mime: 'image/svg+xml',
    test: (b) => {
      const head = b.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart()
      return head.startsWith('<') && /<svg[\s>]/i.test(head)
    },
  },
]

/** 按魔数识别 MIME；识别失败返回 null */
export function sniffMime(buffer) {
  for (const { mime, test } of MAGIC_SNIFFERS) {
    if (test(buffer)) return mime
  }
  return null
}

const EXT_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
}

function filenameFromMime(mime) {
  return `image${MIME_EXT[mime] ?? '.png'}`
}

function parseDataUrl(source) {
  const match = /^data:([^;,]+)?((?:;[^,]*)*),([\s\S]*)$/i.exec(source)
  if (!match) throw new Error('data URL 格式无效')
  const mime = (match[1] || '').trim() || null
  const isBase64 = /;base64/i.test(match[2] || '')
  const payload = match[3]
  const buffer = Buffer.from(isBase64 ? payload : decodeURIComponent(payload), isBase64 ? 'base64' : 'utf8')
  return { mime, buffer }
}

/** 按扩展名回退识别 MIME；无法识别返回 null */
export function mimeFromExt(filename) {
  return EXT_MIME[path.extname(filename).toLowerCase()] ?? null
}

/**
 * 将图片来源（本地路径、file://、data: 或 http(s) URL）转为 buffer / data URL。
 * @param {string} source 本地文件路径、file://、data:image 或 http(s):// URL
 * @param {{ maxBytes?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ mime: string, buffer: Buffer, dataUrl: string, filename: string, sourceUrl?: string }>}
 */
export async function loadImageAsDataUrl(source, { maxBytes = DEFAULT_MAX_BYTES, fetchImpl = fetch } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`图片大小上限必须是正整数，当前值为 ${maxBytes}`)
  }

  let buffer
  let fallbackMime = null
  let filename = 'image.png'
  let localPath = source

  if (/^data:/i.test(source)) {
    const parsed = parseDataUrl(source)
    buffer = parsed.buffer
    fallbackMime = parsed.mime?.startsWith('image/') ? parsed.mime : null
    filename = filenameFromMime(fallbackMime)
  } else if (/^file:/i.test(source)) {
    try {
      localPath = fileURLToPath(source)
    } catch {
      throw new Error('file:// URL 格式无效')
    }
    try {
      buffer = await readFile(localPath)
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error(`图片文件不存在：${localPath}`)
      throw new Error(`读取图片失败：${e.message}`)
    }
    fallbackMime = mimeFromExt(localPath)
    filename = path.basename(localPath)
  } else if (/^https?:\/\//i.test(source)) {
    assertPublicHttpUrl(source)
    let res
    try {
      res = await fetchImpl(source, { signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS) })
    } catch (e) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        throw new Error(`下载图片超时（>${DEFAULT_FETCH_TIMEOUT_MS}ms）`)
      }
      throw new Error(`下载图片失败：${e.message}`)
    }
    if (!res.ok) {
      throw new Error(`下载图片失败：HTTP ${res.status} ${res.statusText ?? ''}`.trimEnd())
    }
    const contentType = (res.headers?.get?.('content-type') ?? '').split(';')[0].trim()
    if (contentType.startsWith('image/')) fallbackMime = contentType
    const contentLength = Number(res.headers?.get?.('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`图片大小 ${contentLength} 字节超过上限 ${maxBytes} 字节（可用环境变量 MAX_IMAGE_BYTES 调整）`)
    }

    if (res.body?.getReader) {
      const reader = res.body.getReader()
      const chunks = []
      let total = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > maxBytes) {
            await reader.cancel()
            throw new Error(`图片大小超过上限 ${maxBytes} 字节（可用环境变量 MAX_IMAGE_BYTES 调整）`)
          }
          chunks.push(Buffer.from(value))
        }
      } finally {
        reader.releaseLock()
      }
      buffer = Buffer.concat(chunks, total)
    } else {
      buffer = Buffer.from(await res.arrayBuffer())
    }
    try {
      filename = path.basename(new URL(source).pathname) || 'image.png'
    } catch {
      filename = 'image.png'
    }
  } else {
    try {
      buffer = await readFile(source)
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error(`图片文件不存在：${source}`)
      throw new Error(`读取图片失败：${e.message}`)
    }
    fallbackMime = mimeFromExt(source)
    filename = path.basename(source) || 'image.png'
  }

  if (buffer.length > maxBytes) {
    throw new Error(`图片大小 ${buffer.length} 字节超过上限 ${maxBytes} 字节（可用环境变量 MAX_IMAGE_BYTES 调整）`)
  }

  const mime = sniffMime(buffer) ?? fallbackMime
  if (!mime) {
    throw new Error('无法识别图片格式（支持 PNG / JPEG / GIF / WebP / BMP / SVG）')
  }
  return {
    mime,
    buffer,
    filename,
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    sourceUrl: /^https?:\/\//i.test(source) ? source : undefined,
  }
}
