import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { loadDotEnv } from './src/env.js'
import { getImageHostConfig } from './src/minitools.js'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
loadDotEnv(path.join(ROOT, '.env'))

const cfg = getImageHostConfig()
const HOST = '127.0.0.1'
const PORT = Number(process.env.GALLERY_PORT) || 3780

function authHeaders() {
  return {
    'X-API-User-ID': cfg.userId,
    Authorization: `Bearer ${cfg.apiKey}`,
  }
}

function send(res, status, body, contentType = 'application/json; charset=utf-8') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
  })
  res.end(payload)
}

async function proxy(apiPath, method = 'GET') {
  const res = await fetch(`${cfg.baseUrl}${apiPath}`, {
    method,
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { error: text.slice(0, 300) || `HTTP ${res.status}` }
  }
  return { status: res.status, data }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${HOST}:${PORT}`)

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/gallery.html')) {
      const html = await readFile(path.join(ROOT, 'gallery.html'), 'utf8')
      send(res, 200, html, 'text/html; charset=utf-8')
      return
    }

    if (!cfg.userId || !cfg.apiKey) {
      send(res, 503, { error: '缺少图床凭证：请在项目根目录 .env 中配置 X-API-User-ID 与 Authorization（或 MINI_TOOLS_USER_ID / MINI_TOOLS_API_KEY）' })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/usage') {
      const { status, data } = await proxy('/v1/usage')
      send(res, status, data)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/images') {
      const qs = new URLSearchParams()
      qs.set('limit', url.searchParams.get('limit') || '20')
      const cursor = url.searchParams.get('cursor')
      if (cursor) qs.set('cursor', cursor)
      const { status, data } = await proxy(`/v1/images?${qs}`)
      send(res, status, data)
      return
    }

    if (req.method === 'DELETE' && url.pathname === '/api/images') {
      const key = url.searchParams.get('key')
      if (!key) {
        send(res, 400, { error: '缺少 key' })
        return
      }
      const { status, data } = await proxy(`/v1/images/${encodeURI(key)}`, 'DELETE')
      send(res, status, data)
      return
    }

    send(res, 404, { error: '未找到' })
  } catch (err) {
    send(res, 500, { error: err.message || '服务器错误' })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`图床相册：http://${HOST}:${PORT}`)
  console.log('凭证只在本机读取 .env，不会写入页面。按 Ctrl+C 退出。')
})
