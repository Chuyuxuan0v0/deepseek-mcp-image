# deepseek-mcp-image

[中文](README.md) | English

A vision MCP server **built for DeepSeek and other text-only LLMs** — giving models without image input the ability to see.

The host model calls the `describe_image` tool with an image (local path or http(s) URL); the server converts it to a base64 data URL and sends it to the SenseNova multimodal model **6.8 Flash-Lite** (`sensenova-6.8-flash-lite`) for recognition, returning a text description.

## Requirements

- Node.js ≥ 18
- SenseNova API Key ([sensenova.cn](https://www.sensenova.cn/))

## Install

```bash
git clone https://github.com/Chuyuxuan0v0/deepseek-mcp-image.git
cd deepseek-mcp-image
npm install
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SENSENOVA_API_KEY` | ✅ | — | SenseNova API Key |
| `SENSENOVA_BASE_URL` | — | `https://token.sensenova.cn/v1` | API base URL |
| `MAX_IMAGE_BYTES` | — | `20971520` (20MB) | Max image size per call |

PowerShell (Windows) example:

```powershell
$env:SENSENOVA_API_KEY = "sk-your-key"
```

## Run Tests

```bash
npm test
```

## Connect to MCP Clients

Standard stdio MCP server; start command: `node <repo-path>/src/index.js`.

### Claude Desktop

Example `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deepseek-mcp-image": {
      "command": "node",
      "args": ["<repo-path>/src/index.js"],
      "env": { "SENSENOVA_API_KEY": "sk-your-key" }
    }
  }
}
```

### DeepSeek Harness (dsh)

Append an entry to your profile patch layer (e.g. `~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: mcp-vision
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: vision
        transport: stdio
        command: node
        args: ['<repo-path>/src/index.js']
        env:
          SENSENOVA_API_KEY: !!js process.env.SENSENOVA_API_KEY ?? ''
        failOnStartupError: false
```

After restarting dsh, the host model sees the `mcp__vision__describe_image` tool (images may be local paths or URLs).

### Other Clients

Reasonix / Cursor / any MCP client: configure it as a stdio server.

## Tool Reference

### describe_image

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| `image` | string | ✅ | — | Local file path (absolute/relative) or `http(s)://` URL |
| `question` | string | — | `请详细描述这张图片的内容` | Question to ask about the image |
| `max_tokens` | integer | — | `1000` | Max output tokens, up to 4096 |

Supported formats: PNG / JPEG / GIF / WebP / BMP / SVG.

## Manual Acceptance

With `SENSENOVA_API_KEY` set, call the server once via an SDK client script:

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

Expected output: `isError` is `false`, and `content[0].text` is the text description of the image.

## Limitations

- Local images are inlined as base64 data URLs; the default cap is 20MB (`MAX_IMAGE_BYTES` is configurable).
- Results are not cached; every call consumes SenseNova quota.
- `finish_reason = content_filter` returns a compliance-blocked notice (SenseNova content moderation may apply).

## License

[MIT](LICENSE)
