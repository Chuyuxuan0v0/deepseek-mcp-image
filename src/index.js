#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadDotEnv } from './env.js'
import { resolvePublicImageUrl } from './resolve.js'
import { callChat, buildImageMessage } from './sensenova.js'
import { buildSystemPrompt } from './prompt.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
if (process.env.MINI_TOOLS_SKIP_DOTENV !== '1') {
  loadDotEnv(path.join(process.cwd(), '.env'))
  loadDotEnv(path.join(root, '.env'))
}

const maxBytesEnv = process.env.MAX_IMAGE_BYTES
const maxBytesValue = Number(maxBytesEnv)
const maxBytes = Number.isSafeInteger(maxBytesValue) && maxBytesValue > 0 ? maxBytesValue : undefined

const server = new McpServer({ name: 'deepseek-mcp-image', version: '0.1.1' })

server.registerTool(
  'describe_image',
  {
    title: '描述图片内容',
    description:
      '读取本地图片路径或 http(s) 图片 URL，调用多模态模型 SenseNova 6.8 Flash-Lite 识别其内容并返回文字描述。本地路径会先上传到 Mini Tools 图床（需配置图床凭证），公网 URL 直接交给商汤。用于主模型不支持图片输入时的看图能力。',
    inputSchema: {
      image: z.string().min(1).describe('本地图片路径、file://、data:image，或模型可访问的 http(s):// 图片 URL'),
      question: z.string().optional().describe('要问图片的问题。省略时只做文字提取与视觉描述，不生成 Answer 分区。'),
      max_tokens: z.number().int().min(1).max(8192).optional().describe('最大生成 token 数，默认 2000'),
    },
  },
  async ({ image, question, max_tokens }) => {
    try {
      const sourceUrl = await resolvePublicImageUrl(image, { maxBytes })
      const systemPrompt = buildSystemPrompt(question ?? null)
      const messages = [
        { role: 'system', content: systemPrompt },
        buildImageMessage(sourceUrl),
      ]
      const { content } = await callChat({
        apiKey: process.env.SENSENOVA_API_KEY,
        baseUrl: process.env.SENSENOVA_BASE_URL,
        messages,
        maxTokens: max_tokens ?? 2000,
      })
      return { content: [{ type: 'text', text: content }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `describe_image 失败：${err.message}` }], isError: true }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
