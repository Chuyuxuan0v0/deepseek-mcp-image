import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDotEnv, loadDotEnv } from '../src/env.js'

test('parseDotEnv 解析 KEY=VALUE，忽略空行与注释', () => {
  const parsed = parseDotEnv(`
# comment
MINI_TOOLS_USER_ID=user-1
X-API-User-ID=user-header
Authorization=Bearer test-key

`)
  assert.equal(parsed.MINI_TOOLS_USER_ID, 'user-1')
  assert.equal(parsed['X-API-User-ID'], 'user-header')
  assert.equal(parsed.Authorization, 'Bearer test-key')
})

test('loadDotEnv 只填充尚未存在的变量，不覆盖已有值（含空字符串）', async () => {
  const env = { MINI_TOOLS_USER_ID: '', KEEP: 'old' }
  const { writeFile, mkdtemp } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const dir = await mkdtemp(join(tmpdir(), 'mcpimg-env-'))
  const file = join(dir, '.env')
  await writeFile(file, 'MINI_TOOLS_USER_ID=from-file\nKEEP=from-file\nNEW=added\n')
  const loaded = loadDotEnv(file, env)
  assert.equal(loaded, true)
  assert.equal(env.MINI_TOOLS_USER_ID, '')
  assert.equal(env.KEEP, 'old')
  assert.equal(env.NEW, 'added')
})

test('loadDotEnv 文件不存在时返回 false 且不抛错', () => {
  const env = {}
  assert.equal(loadDotEnv('C:/definitely/not/.env', env), false)
  assert.deepEqual(env, {})
})
