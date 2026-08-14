import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadImageAsDataUrl } from './image.js'
import { callChat, buildImageMessage } from './sensenova.js'

const DEFAULT_QUESTION = '请详细描述这张图片的内容'

// 可选环境变量：MAX_IMAGE_BYTES（图片大小上限，默认 20MB）、SENSENOVA_BASE_URL（API 基础地址）
const maxBytesEnv = process.env.MAX_IMAGE_BYTES
const maxBytes = maxBytesEnv && Number.isFinite(Number(maxBytesEnv)) ? Number(maxBytesEnv) : undefined

const server = new McpServer({ name: 'deepseek-mcp-image', version: '0.1.0' })

server.registerTool(
  'describe_image',
  {
    title: '描述图片内容',
    description:
      '读取一张图片（本地文件路径或 http(s):// URL），调用多模态模型 SenseNova 6.8 Flash-Lite 识别其内容并返回文字描述。用于主模型不支持图片输入时的看图能力。',
    inputSchema: {
      image: z.string().describe('本地文件路径（绝对或相对路径）或 http(s):// 图片 URL'),
      question: z.string().optional().describe(`要问图片的问题，默认："${DEFAULT_QUESTION}"`),
      max_tokens: z.number().int().min(1).max(4096).optional().describe('最大生成 token 数，默认 1000'),
    },
  },
  async ({ image, question, max_tokens }) => {
    try {
      const { dataUrl } = await loadImageAsDataUrl(image, { maxBytes })
      const messages = [
        { role: 'system', content: '你是一个说话客观公正的小助手' },
        buildImageMessage(question ?? DEFAULT_QUESTION, dataUrl),
      ]
      const { content } = await callChat({
        apiKey: process.env.SENSENOVA_API_KEY,
        baseUrl: process.env.SENSENOVA_BASE_URL,
        messages,
        maxTokens: max_tokens ?? 1000,
      })
      return { content: [{ type: 'text', text: content }] }
    } catch (err) {
      return { content: [{ type: 'text', text: `describe_image 失败：${err.message}` }], isError: true }
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
