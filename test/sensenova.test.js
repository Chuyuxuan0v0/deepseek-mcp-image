import test from 'node:test'
import assert from 'node:assert/strict'
import { callChat, buildImageMessage, MODEL } from '../src/sensenova.js'

const DATA_URL = 'data:image/png;base64,iVBORw0KGgo='

test('buildImageMessage 生成含 image_url 的 user 消息', () => {
  const msg = buildImageMessage(DATA_URL)
  assert.equal(msg.role, 'user')
  assert.equal(msg.content.length, 1)
  assert.equal(msg.content[0].type, 'image_url')
  assert.equal(msg.content[0].image_url.url, DATA_URL)
})

test('callChat 请求体符合商汤规范并解析响应', async () => {
  let captured = null
  const fetchImpl = async (url, init) => {
    captured = { url, headers: init.headers, body: JSON.parse(init.body) }
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({
        id: 'chatcmpl-test',
        choices: [{ index: 0, message: { role: 'assistant', content: '图片里有一只猫' }, finish_reason: 'stop' }],
      }),
    }
  }
  const { content, finishReason } = await callChat({
    apiKey: 'sk-test', messages: [buildImageMessage(DATA_URL)], maxTokens: 500, fetchImpl,
  })
  assert.equal(content, '图片里有一只猫')
  assert.equal(finishReason, 'stop')

  assert.equal(captured.url, 'https://token.sensenova.cn/v1/chat/completions')
  assert.equal(captured.headers.Authorization, 'Bearer sk-test')
  assert.equal(captured.body.model, MODEL)
  assert.equal(captured.body.stream, false)
  assert.equal(captured.body.n, 1)
  assert.equal(captured.body.reasoning_effort, 'none')
  assert.equal(captured.body.temperature, 0.6)
  assert.equal(captured.body.top_p, 0.95)
  assert.equal(captured.body.max_tokens, 500)
  assert.equal(captured.body.messages[0].content[0].image_url.url, DATA_URL)
})

test('content_filter 返回合规拦截提示', async () => {
  const fetchImpl = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ choices: [{ index: 0, message: { role: 'assistant', content: null }, finish_reason: 'content_filter' }] }),
  })
  const { content, finishReason } = await callChat({ apiKey: 'sk-test', messages: [], fetchImpl })
  assert.equal(finishReason, 'content_filter')
  assert.match(content, /合规/)
})

test('缺少 API key 报可读错误', async () => {
  await assert.rejects(callChat({ apiKey: '', messages: [], fetchImpl: async () => ({}) }), /SENSENOVA_API_KEY/)
})

test('HTTP 401 提示检查 API key', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' })
  await assert.rejects(callChat({ apiKey: 'sk-bad', messages: [], fetchImpl }), /请检查 SENSENOVA_API_KEY/)
})

test('HTTP 500 透传状态码与错误详情', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => '{"error":"boom"}' })
  await assert.rejects(callChat({ apiKey: 'sk-test', messages: [], fetchImpl }), /HTTP 500/)
})

test('网络异常包装为可读错误', async () => {
  const fetchImpl = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(callChat({ apiKey: 'sk-test', messages: [], fetchImpl }), /调用商汤 API 失败/)
})
