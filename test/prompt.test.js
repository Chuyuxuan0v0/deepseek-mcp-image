import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSystemPrompt } from '../src/prompt.js'

test('有 question 时包含三个分区、TASK 3 与原始问题文本', () => {
  const prompt = buildSystemPrompt('what is this?')
  assert.match(prompt, /--- Extracted Text ---/)
  assert.match(prompt, /--- Visual Context ---/)
  assert.match(prompt, /--- Answer ---/)
  assert.match(prompt, /TASK 3/)
  assert.match(prompt, /what is this\?/)
})

test('无 question 时包含提取与描述分区，但不含 Answer 与 TASK 3', () => {
  const prompt = buildSystemPrompt(null)
  assert.match(prompt, /--- Extracted Text ---/)
  assert.match(prompt, /--- Visual Context ---/)
  assert.doesNotMatch(prompt, /--- Answer ---/)
  assert.doesNotMatch(prompt, /TASK 3/)
})
