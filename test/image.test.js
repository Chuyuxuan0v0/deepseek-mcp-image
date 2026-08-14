import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadImageAsDataUrl } from '../src/image.js'

// 1x1 透明 PNG 与 1x1 JPEG（base64）
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const JPEG_1PX = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==', 'base64')

async function tmpFile(name, content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpimg-'))
  const file = path.join(dir, name)
  await fs.writeFile(file, content)
  return file
}

test('本地 PNG 生成 data URL，MIME 为 image/png', async () => {
  const file = await tmpFile('a.png', PNG_1PX)
  const { mime, dataUrl } = await loadImageAsDataUrl(file)
  assert.equal(mime, 'image/png')
  assert.ok(dataUrl.startsWith('data:image/png;base64,'))
  assert.ok(dataUrl.includes(PNG_1PX.toString('base64')))
})

test('本地 JPEG 按魔数识别为 image/jpeg（即使扩展名错误）', async () => {
  const file = await tmpFile('wrong.txt', JPEG_1PX)
  const { mime } = await loadImageAsDataUrl(file)
  assert.equal(mime, 'image/jpeg')
})

test('非图片文件抛"无法识别图片格式"', async () => {
  const file = await tmpFile('a.txt', Buffer.from('hello world'))
  await assert.rejects(loadImageAsDataUrl(file), /无法识别图片格式/)
})

test('超过 maxBytes 上限报错', async () => {
  const file = await tmpFile('a.png', PNG_1PX)
  await assert.rejects(loadImageAsDataUrl(file, { maxBytes: 10 }), /超过上限/)
})

test('文件不存在报"文件不存在"', async () => {
  await assert.rejects(loadImageAsDataUrl('C:/definitely/not/exists.png'), /文件不存在/)
})

test('远程 URL：下载后按魔数识别（mock fetchImpl）', async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, 'https://example.com/logo.png')
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/octet-stream' },
      arrayBuffer: async () => PNG_1PX.buffer.slice(PNG_1PX.byteOffset, PNG_1PX.byteOffset + PNG_1PX.byteLength),
    }
  }
  const { mime } = await loadImageAsDataUrl('https://example.com/logo.png', { fetchImpl })
  assert.equal(mime, 'image/png')
})

test('远程 URL：下载失败（HTTP 404）报错', async () => {
  const fetchImpl = async () => ({ ok: false, status: 404, statusText: 'Not Found' })
  await assert.rejects(loadImageAsDataUrl('https://example.com/missing.png', { fetchImpl }), /下载图片失败：HTTP 404/)
})

test('SVG 文本文件识别为 image/svg+xml', async () => {
  const file = await tmpFile('a.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>'))
  const { mime } = await loadImageAsDataUrl(file)
  assert.equal(mime, 'image/svg+xml')
})