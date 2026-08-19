import { readFileSync } from 'node:fs'

/** 解析 dotenv 文本为键值对象（支持带连字符的键名） */
export function parseDotEnv(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      value.length >= 2
      && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

/**
 * 将 dotenv 文件写入 env 对象；已存在的键（含空字符串）不覆盖。
 * @returns {boolean} 文件存在并已读取时为 true
 */
export function loadDotEnv(filePath, env = process.env) {
  let text
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
  for (const [key, value] of Object.entries(parseDotEnv(text))) {
    if (env[key] === undefined) env[key] = value
  }
  return true
}
