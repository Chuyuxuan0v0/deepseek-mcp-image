import path from 'node:path'
import { loadImageAsDataUrl } from './image.js'
import { getImageHostConfig, uploadImage } from './minitools.js'

/**
 * 将图片来源解析为商汤可访问的公开 http(s) URL。
 * 公网 URL 校验后原样返回；本地路径则上传 Mini Tools 图床。
 */
export async function resolvePublicImageUrl(source, { maxBytes, fetchImpl = fetch, host } = {}) {
  const loaded = await loadImageAsDataUrl(source, { maxBytes, fetchImpl })
  if (loaded.sourceUrl) return loaded.sourceUrl

  const cfg = host ?? getImageHostConfig()
  return uploadImage({
    buffer: loaded.buffer,
    filename: loaded.filename || path.basename(source),
    mime: loaded.mime,
    userId: cfg.userId,
    apiKey: cfg.apiKey,
    duration: cfg.duration,
    baseUrl: cfg.baseUrl,
    fetchImpl,
  })
}
