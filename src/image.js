import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

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

/** 按扩展名回退识别 MIME；无法识别返回 null */
export function mimeFromExt(filename) {
  return EXT_MIME[path.extname(filename).toLowerCase()] ?? null
}

/**
 * 将图片来源（本地路径或 http(s) URL）转为 base64 data URL。
 * @param {string} source 本地文件路径或 http(s):// URL
 * @param {{ maxBytes?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ mime: string, dataUrl: string }>}
 */
export async function loadImageAsDataUrl(source, { maxBytes = DEFAULT_MAX_BYTES, fetchImpl = fetch } = {}) {
  let buffer
  let fallbackMime = null

  if (/^https?:\/\//i.test(source)) {
    const res = await fetchImpl(source)
    if (!res.ok) {
      throw new Error(`下载图片失败：HTTP ${res.status} ${res.statusText ?? ''}`.trimEnd())
    }
    const contentType = (res.headers?.get?.('content-type') ?? '').split(';')[0].trim()
    if (contentType.startsWith('image/')) fallbackMime = contentType
    buffer = Buffer.from(await res.arrayBuffer())
  } else {
    try {
      buffer = await readFile(source)
    } catch (e) {
      if (e.code === 'ENOENT') throw new Error(`图片文件不存在：${source}`)
      throw new Error(`读取图片失败：${e.message}`)
    }
    fallbackMime = mimeFromExt(source)
  }

  if (buffer.length > maxBytes) {
    throw new Error(`图片大小 ${buffer.length} 字节超过上限 ${maxBytes} 字节（可用环境变量 MAX_IMAGE_BYTES 调整）`)
  }

  const mime = sniffMime(buffer) ?? fallbackMime
  if (!mime) {
    throw new Error('无法识别图片格式（支持 PNG / JPEG / GIF / WebP / BMP / SVG）')
  }
  return { mime, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
}