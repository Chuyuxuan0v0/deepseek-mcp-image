import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolvePublicImageUrl } from '../src/resolve.js'

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

async function tmpPng() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpimg-'))
  const file = path.join(dir, 'a.png')
  await fs.writeFile(file, PNG_1PX)
  return file
}

function mockUploadFetch() {
  return async (url, init) => {
    if (String(url).includes('/v1/upload')) {
      assert.equal(init.headers['X-API-User-ID'], 'uid')
      return {
        ok: true,
        status: 201,
        text: async () => '',
        json: async () => ({ success: true, uploaded: [{ url: 'https://pub.mini-tools.uk/1-day/a.png' }] }),
      }
    }
    throw new Error(`unexpected fetch ${url}`)
  }
}

test('公网 URL 校验后原样返回，不上传图床', async () => {
  let uploadCalled = false
  const fetchImpl = async (url) => {
    if (String(url).includes('/v1/upload')) {
      uploadCalled = true
      throw new Error('不应上传')
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => PNG_1PX.buffer.slice(PNG_1PX.byteOffset, PNG_1PX.byteOffset + PNG_1PX.byteLength),
    }
  }
  const url = await resolvePublicImageUrl('https://example.com/logo.png', { fetchImpl, host: { userId: 'u', apiKey: 'k' } })
  assert.equal(url, 'https://example.com/logo.png')
  assert.equal(uploadCalled, false)
})

test('本地路径缺少图床凭证时报错', async () => {
  const file = await tmpPng()
  await assert.rejects(
    resolvePublicImageUrl(file, { host: { userId: '', apiKey: '' } }),
    /图床凭证/,
  )
})

test('本地路径上传图床后返回公开 URL', async () => {
  const file = await tmpPng()
  const url = await resolvePublicImageUrl(file, {
    fetchImpl: mockUploadFetch(),
    host: { userId: 'uid', apiKey: 'secret' },
  })
  assert.equal(url, 'https://pub.mini-tools.uk/1-day/a.png')
})

test('file:// URL 按本地文件上传图床', async () => {
  const file = await tmpPng()
  const href = pathToFileURL(file).href
  const url = await resolvePublicImageUrl(href, {
    fetchImpl: mockUploadFetch(),
    host: { userId: 'uid', apiKey: 'secret' },
  })
  assert.equal(url, 'https://pub.mini-tools.uk/1-day/a.png')
})

test('data:image URL 解码后上传图床', async () => {
  const dataUrl = `data:image/png;base64,${PNG_1PX.toString('base64')}`
  const url = await resolvePublicImageUrl(dataUrl, {
    fetchImpl: mockUploadFetch(),
    host: { userId: 'uid', apiKey: 'secret' },
  })
  assert.equal(url, 'https://pub.mini-tools.uk/1-day/a.png')
})
