export const DEFAULT_BASE_URL = 'https://token.sensenova.cn/v1'
export const MODEL = 'sensenova-6.8-flash-lite'

/** 生成含 image_url 的 user 消息（商汤多模态输入格式） */
export function buildImageMessage(imageUrl) {
  return {
    role: 'user',
    content: [{ type: 'image_url', image_url: { url: imageUrl } }],
  }
}

/**
 * 调用商汤 chat/completions（非流式），返回文本内容。
 * @param {{ apiKey: string, baseUrl?: string, messages: object[], maxTokens?: number, fetchImpl?: typeof fetch }} opts
 * @returns {Promise<{ content: string, finishReason: string }>}
 */
export async function callChat({ apiKey, baseUrl = DEFAULT_BASE_URL, messages, maxTokens = 2000, fetchImpl = fetch }) {
  if (!apiKey) {
    throw new Error('缺少 SENSENOVA_API_KEY，请设置环境变量后重试')
  }

  const body = {
    model: MODEL,
    messages,
    n: 1,
    stream: false,
    max_tokens: maxTokens,
    reasoning_effort: 'none',
    temperature: 0.6,
    top_p: 0.95,
  }

  let res
  try {
    const endpoint = `${baseUrl || DEFAULT_BASE_URL}`.replace(/\/+$/, '')
    res = await fetchImpl(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(`调用商汤 API 失败：${e.message}`)
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('商汤 API 返回 401：请检查 SENSENOVA_API_KEY 是否正确')
    }
    const detail = await res.text().catch(() => '')
    throw new Error(`商汤 API 返回 HTTP ${res.status}${detail ? `：${detail.slice(0, 300)}` : ''}`)
  }

  const data = await res.json()
  const choice = data?.choices?.[0]
  if (!choice?.message) {
    throw new Error('商汤 API 响应格式异常（缺少 choices[0].message）')
  }
  const finishReason = choice.finish_reason ?? 'stop'
  if (finishReason === 'content_filter') {
    return { content: '内容被合规审核拦截，请更换图片或问题后重试', finishReason }
  }
  return { content: choice.message.content ?? '', finishReason }
}
