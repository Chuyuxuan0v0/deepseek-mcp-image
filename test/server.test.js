import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

/** 以指定 env 启动 MCP 服务器；默认跳过 .env 且清空图床凭证，避免测试误用真实密钥 */
async function startServer(env = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(ROOT, 'src', 'index.js')],
    env: {
      ...process.env,
      MINI_TOOLS_SKIP_DOTENV: '1',
      MINI_TOOLS_USER_ID: '',
      MINI_TOOLS_API_KEY: '',
      'X-API-User-ID': '',
      Authorization: '',
      ...env,
    },
  })
  const client = new Client({ name: 'test-client', version: '0.0.1' })
  await client.connect(transport)
  return client
}

function textOf(result) {
  const t = result.content.find((c) => c.type === 'text')
  return t ? t.text : ''
}

test('listTools 包含 describe_image', async () => {
  const client = await startServer({ SENSENOVA_API_KEY: '' })
  try {
    const { tools } = await client.listTools()
    assert.ok(tools.some((t) => t.name === 'describe_image'))
  } finally {
    await client.close()
  }
})

test('本地文件不存在时返回 isError 与"不存在"提示', async () => {
  const client = await startServer({ SENSENOVA_API_KEY: '' })
  try {
    const r = await client.callTool({ name: 'describe_image', arguments: { image: 'C:/definitely/not/exists.png' } })
    assert.equal(r.isError, true)
    assert.match(textOf(r), /不存在/)
  } finally {
    await client.close()
  }
})

test('本地 PNG 缺少图床凭证时报可读错误（不发真实请求）', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpimg-'))
  const img = path.join(dir, 'a.png')
  await fs.writeFile(img, PNG_1PX)
  const client = await startServer({ SENSENOVA_API_KEY: '' })
  try {
    const r = await client.callTool({ name: 'describe_image', arguments: { image: img, question: '这是什么' } })
    assert.equal(r.isError, true)
    assert.match(textOf(r), /图床凭证/)
  } finally {
    await client.close()
  }
})

test('有 question 时工具调用链路正常，缺图床凭证时报错', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcpimg-'))
  const img = path.join(dir, 'a.png')
  await fs.writeFile(img, PNG_1PX)
  const client = await startServer({ SENSENOVA_API_KEY: '' })
  try {
    const r = await client.callTool({ name: 'describe_image', arguments: { image: img, question: '这段代码有什么问题' } })
    assert.equal(r.isError, true)
    assert.match(textOf(r), /图床凭证/)
  } finally {
    await client.close()
  }
})
