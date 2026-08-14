# deepseek-mcp-image

中文 | [English](README.en.md)

给 **DeepSeek 等纯文本模型** 用的识图 MCP 服务器：让不支持图片输入的 LLM 也能看图。

主模型调用 `describe_image` 工具并传入图片（本地路径或 http(s) URL），
服务器将图片转为 base64 data URL，交给支持图像输入的商汤多模态模型
**SenseNova 6.8 Flash-Lite**（`sensenova-6.8-flash-lite`）识别，返回文字描述。

## 环境要求

- Node.js ≥ 18
- 商汤开放平台 API Key（[sensenova.cn](https://www.sensenova.cn/)）

## 安装

```bash
git clone https://github.com/Chuyuxuan0v0/deepseek-mcp-image.git
cd deepseek-mcp-image
npm install
```

## 配置环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `SENSENOVA_API_KEY` | ✅ | — | 商汤 API Key |
| `SENSENOVA_BASE_URL` | — | `https://token.sensenova.cn/v1` | API 基础地址 |
| `MAX_IMAGE_BYTES` | — | `20971520`（20MB） | 单张图片大小上限 |

PowerShell（Windows）示例：

```powershell
$env:SENSENOVA_API_KEY = "sk-你的key"
```

## 运行测试

```bash
npm test
```

## 接入 MCP 客户端

标准 stdio MCP 服务器，启动命令：`node <本仓库路径>/src/index.js`。

### Claude Desktop

`claude_desktop_config.json` 示例：

```json
{
  "mcpServers": {
    "deepseek-mcp-image": {
      "command": "node",
      "args": ["<本仓库路径>/src/index.js"],
      "env": { "SENSENOVA_API_KEY": "sk-你的key" }
    }
  }
}
```

### DeepSeek Harness（dsh）

在 profile 补丁层（如 `~/.dsh/profiles/web/cordis.patch.yml`）追加一行：

```yaml
- insert:
    - id: mcp-vision
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: vision
        transport: stdio
        command: node
        args: ['<本仓库路径>/src/index.js']
        env:
          SENSENOVA_API_KEY: !!js process.env.SENSENOVA_API_KEY ?? ''
        failOnStartupError: false
```

重启 dsh 后，主模型即可看到 `mcp__vision__describe_image` 工具（图片支持本地路径或 URL）。

### 其他客户端

Reasonix / Cursor / 通用 MCP 客户端按各自 stdio 服务器配置方式接入即可。

## 工具说明

### describe_image

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `image` | string | ✅ | — | 本地文件路径（绝对/相对）或 `http(s)://` URL |
| `question` | string | — | `请详细描述这张图片的内容` | 要问图片的问题 |
| `max_tokens` | integer | — | `1000` | 最大生成 token 数，上限 4096 |

支持的图片格式：PNG / JPEG / GIF / WebP / BMP / SVG。

## 手动验收

设置好 `SENSENOVA_API_KEY` 后，用 SDK 客户端脚本调用一次：

```bash
cd deepseek-mcp-image && node --input-type=module -e "
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/index.js'],
  env: { ...process.env, SENSENOVA_API_KEY: process.env.SENSENOVA_API_KEY },
});
const client = new Client({ name: 'manual', version: '0.0.1' });
await client.connect(transport);
const r = await client.callTool({ name: 'describe_image', arguments: { image: 'https://www.sensenova.cn/images/logo.png' } });
console.log(JSON.stringify(r, null, 2));
await client.close();
"
```

预期输出：`isError` 为 `false`，`content[0].text` 为图片的文字描述。

## 限制

- 本地图片以 base64 data URL 内联传输，单张上限默认 20MB（`MAX_IMAGE_BYTES` 可调）。
- 不缓存 API 结果；每次调用都会消耗商汤 API 额度。
- `finish_reason = content_filter` 时返回合规拦截提示（可能命中商汤内容审核）。

## License

[MIT](LICENSE)
