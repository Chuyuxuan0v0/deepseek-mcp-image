const DEFAULT_BASE_URL = 'https://api.mini-tools.uk'
const DEFAULT_DURATION = '1-day'
const HOST_MAX_BYTES = 5 * 1024 * 1024
const HOST_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function stripBearer(value) {
  if (!value) return value
  return value.replace(/^Bearer\s+/i, '').trim()
}

/** 从图床相关环境变量读取配置；空字符串视为未设置 */
export function getImageHostConfig(env = process.env) {
  return {
    userId: firstNonEmpty(env.MINI_TOOLS_USER_ID, env['X-API-User-ID']),
    apiKey: stripBearer(firstNonEmpty(env.MINI_TOOLS_API_KEY, env.Authorization)),
    duration: firstNonEmpty(env.MINI_TOOLS_DURATION) || DEFAULT_DURATION,
    baseUrl: (firstNonEmpty(env.MINI_TOOLS_BASE_URL) || DEFAULT_BASE_URL).replace(/\/+$/, ''),
  }
}

/**
 * 将本地图片上传到 Mini Tools 图床，返回公开 URL。
 * @param {{ buffer: Buffer, filename: string, mime: string, userId: string, apiKey: string, duration?: string, baseUrl?: string, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<string>}
 */
export async function uploadImage({
  buffer,
  filename,
  mime,
  userId,
  apiKey,
  duration = DEFAULT_DURATION,
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = fetch,
}) {
  if (!userId || !apiKey) {
    throw new Error('缺少图床凭证：请设置 MINI_TOOLS_USER_ID 与 MINI_TOOLS_API_KEY（或 .env 中的 X-API-User-ID 与 Authorization）')
  }
  if (!HOST_MIMES.has(mime)) {
    throw new Error(`图床不支持该图片格式（${mime}），仅支持 JPEG / PNG / GIF / WebP`)
  }
  if (buffer.length > HOST_MAX_BYTES) {
    throw new Error(`图片大小 ${buffer.length} 字节超过图床上限 ${HOST_MAX_BYTES} 字节`)
  }

  const form = new FormData()
  form.set('duration', duration)
  form.set('file', new Blob([buffer], { type: mime }), filename || 'image.png')

  let res
  try {
    res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/v1/upload`, {
      method: 'POST',
      headers: {
        'X-API-User-ID': userId,
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new Error('上传图床超时（>15000ms）')
    }
    throw new Error(`上传图床失败：${e.message}`)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('图床 API 返回 401/403：请检查 MINI_TOOLS_USER_ID 与 MINI_TOOLS_API_KEY 是否正确')
    }
    const detail = await res.text().catch(() => '')
    throw new Error(`图床 API 返回 HTTP ${res.status}${detail ? `：${detail.slice(0, 300)}` : ''}`)
  }

  const data = await res.json()
  const url = data?.uploaded?.[0]?.url
  if (!url) {
    throw new Error('图床 API 响应格式异常（缺少 uploaded[0].url）')
  }
  return url
}
