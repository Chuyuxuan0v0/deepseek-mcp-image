import test from 'node:test'
import assert from 'node:assert/strict'
import { getImageHostConfig, uploadImage } from '../src/minitools.js'

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test('getImageHostConfig 读取 MINI_TOOLS_* 变量', () => {
  const cfg = getImageHostConfig({
    MINI_TOOLS_USER_ID: 'uid',
    MINI_TOOLS_API_KEY: 'key',
    MINI_TOOLS_DURATION: '7-day',
  })
  assert.equal(cfg.userId, 'uid')
  assert.equal(cfg.apiKey, 'key')
  assert.equal(cfg.duration, '7-day')
  assert.equal(cfg.baseUrl, 'https://api.mini-tools.uk')
})

test('getImageHostConfig 兼容请求头同名变量，并去掉 Bearer 前缀', () => {
  const cfg = getImageHostConfig({
    'X-API-User-ID': 'uid-header',
    Authorization: 'Bearer mtu_live_test',
  })
  assert.equal(cfg.userId, 'uid-header')
  assert.equal(cfg.apiKey, 'mtu_live_test')
  assert.equal(cfg.duration, '1-day')
})

test('getImageHostConfig 空字符串视为未配置', () => {
  const cfg = getImageHostConfig({ MINI_TOOLS_USER_ID: '', MINI_TOOLS_API_KEY: '' })
  assert.equal(cfg.userId, undefined)
  assert.equal(cfg.apiKey, undefined)
})

test('uploadImage 缺少凭证时报可读错误', async () => {
  await assert.rejects(
    uploadImage({ buffer: PNG_1PX, filename: 'a.png', mime: 'image/png', userId: '', apiKey: '' }),
    /图床凭证/,
  )
})

test('uploadImage 拒绝图床不支持的 MIME', async () => {
  await assert.rejects(
    uploadImage({
      buffer: PNG_1PX, filename: 'a.bmp', mime: 'image/bmp', userId: 'u', apiKey: 'k',
    }),
    /不支持该图片格式/,
  )
})

test('uploadImage 发送 multipart 并返回公开 URL', async () => {
  let captured
  const fetchImpl = async (url, init) => {
    captured = { url, headers: init.headers, body: init.body }
    return {
      ok: true,
      status: 201,
      text: async () => '',
      json: async () => ({
        success: true,
        uploaded: [{ url: 'https://pub.mini-tools.uk/1-day/a.png' }],
      }),
    }
  }
  const url = await uploadImage({
    buffer: PNG_1PX,
    filename: 'a.png',
    mime: 'image/png',
    userId: 'uid',
    apiKey: 'secret',
    fetchImpl,
  })
  assert.equal(url, 'https://pub.mini-tools.uk/1-day/a.png')
  assert.equal(captured.url, 'https://api.mini-tools.uk/v1/upload')
  assert.equal(captured.headers['X-API-User-ID'], 'uid')
  assert.equal(captured.headers.Authorization, 'Bearer secret')
  assert.ok(captured.body instanceof FormData)
  assert.equal(captured.body.get('duration'), '1-day')
})

test('uploadImage HTTP 401 提示检查图床凭证', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })
  await assert.rejects(
    uploadImage({
      buffer: PNG_1PX, filename: 'a.png', mime: 'image/png', userId: 'u', apiKey: 'bad', fetchImpl,
    }),
    /图床/,
  )
})

test('uploadImage 响应缺少 url 时报格式异常', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 201,
    text: async () => '',
    json: async () => ({ success: true, uploaded: [] }),
  })
  await assert.rejects(
    uploadImage({
      buffer: PNG_1PX, filename: 'a.png', mime: 'image/png', userId: 'u', apiKey: 'k', fetchImpl,
    }),
    /图床 API 响应格式异常/,
  )
})
