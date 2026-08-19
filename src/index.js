import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadImageAsDataUrl } from './image.js'
import { callChat, buildImageMessage } from './sensenova.js'
import { buildSystemPrompt } from './prompt.js'

const maxBytesEnv = process.env.MAX_IMAGE_BYTES
const maxBytesValue = Number(maxBytesEnv)
const maxBytes = Number.isSafeInteger(maxBytesValue) && maxBytesValue > 0 ? maxBytesValue : undefined

const server = new McpServer({ name: 'deepseek-mcp-image', version: '0.1.0' })

server.registerTool(
  'describe_image',
  {
    title: '描述图片内容',
    description:
      '读取一张图片（本地文件路径或 http(s):// URL），调用多模态模型 SenseNova 6.8 Flash-Lite 识别其内容并返回文字描述。用于主模型不支持图片输入时的看图能力。',
    inputSchema: {
      image: z.string().describe('本地文件路径（绝对或相对路径）或 http(s):// 图片 URL'),
      question: z.string().optional().describe('要问图片的问题。省略时只做文字提取与视觉描述，不生成 Answer 分区。'),
      max_tokens: z.number().int().min(1).max(8192).optional().describe('最大生成 token 数，默认 2000'),
    },
  },
  async ({ image, question, max_tokens }) => {
    try {
      const { dataUrl } = await loadImageAsDataUrl(image, { maxBytes })
      const systemPrompt = buildSystemPrompt(question ?? null)
      const messages = [
        { role: 'system', content: systemPrompt },
        buildImageMessage(dataUrl),
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
