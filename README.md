# uccje

Userscript ChatGPT Conversation JSON Exporter。

在 ChatGPT 对话页的分享按钮旁添加一个下载按钮，点击后下载当前对话的原始 JSON。

## 使用

先安装篡改猴、暴力猴或其它兼容的 userscript 管理器，然后点击：

**[安装 uccje](https://raw.githubusercontent.com/A7T/uccje/main/uccje.user.js)**

userscript 管理器会打开安装确认页。完成安装后，打开一个 ChatGPT 对话。

下载文件名为：

```text
{conversation-id}-{yyyyMMddHHmm}.json
```

时间使用当前分支最后一个可用节点的 `message.create_time`，并按浏览器本地时区格式化；缺失时依次回退到 `conversation.update_time` 和下载时间。同一分钟内的重名文件交给浏览器处理。

## 边界

uccje 只下载：

```text
GET /backend-api/conversation/{conversation-id}
```

返回的原始文本。脚本会解析 JSON 以校验 conversation ID 和生成文件名，但不会重新序列化或修改文件内容。

uccje 不会：

- 转换为 Markdown、HTML 或 PDF。
- 扁平化分支或过滤 system、tool、reasoning 消息。
- 额外请求 Canvas / textdocs。
- 下载或打包图片、音频、上传附件和工具生成文件。
- 批量导出、创建分享链接或把内容发送给其它服务。

因此，导出的 JSON 会保留主接口原本提供的 textdoc 事件、asset pointer、文件 ID 和元数据，但不保证包含 Canvas 的完整当前状态或附件的二进制内容。

## 认证与隐私

点击按钮时，uccje 通过 ChatGPT 的同源 `/api/auth/session` 获取临时 access token，再即时请求当前对话。token 只存在于这次操作的内存中，不会写入脚本、存储、日志或导出文件。

脚本不拦截或替换 `window.fetch`，不使用全局变量；DOM ID 和属性统一使用 `uccje-` 前缀，以减少与其它 userscript 的冲突。

## 兼容性

uccje 依赖 ChatGPT 网页当前的内部接口与 DOM，因此 ChatGPT 改版后可能需要调整。它不是 OpenAI 官方导出工具。

当前只匹配：

```text
https://chatgpt.com/*
```

## 许可证

MIT License。见 [`LICENSE`](LICENSE)。
