# CodexPlugins

一个用于发布和维护 Codex 插件的公开 marketplace 仓库。

仓库采用 Codex 可发现的标准结构：marketplace 清单位于
`.agents/plugins/marketplace.json`，每个插件位于 `plugins/<plugin-name>/`。
用户添加本 GitHub 仓库后，即可在 Codex 中浏览并安装清单内的插件。

## 已发布插件

| 插件 | 功能 | 来源 |
|------|------|------|
| `niu-image-gen` | 查询上游模型并通过可配置 API 生成、编辑和批量处理图片 | 基于 [borawong/AiMaMi](https://github.com/borawong/AiMaMi) 的 Apache-2.0 授权代码 |

`niu-image-gen` 会把 API Key 保存在本机配置文件中，或从
`NIU_IMAGE_GEN_API_KEY` 环境变量读取。协议、域名/IP、端口、请求路径和模型
也可以自定义。执行图片生成或编辑时，Key 和请求内容会发送给用户配置的 API。

## 用户安装

将本仓库推送到 `Big-Molecule/CodexPlugins` 后，添加 marketplace：

```powershell
codex plugin marketplace add Big-Molecule/CodexPlugins
```

随后可以在 Codex 的插件界面中检索并安装插件，或使用命令：

```powershell
codex
/plugins
```

在 ChatGPT 桌面端中，重启应用后进入 Codex 的 Plugins 页面，选择
`Big Molecule Codex Plugins`，搜索插件并点击加号即可一键安装。

marketplace 更新后，可以刷新本地目录：

```powershell
codex plugin marketplace upgrade big-molecule-codex-plugins
```

安装或更新插件后，建议新建一个 Codex 对话，让新的技能和工具完整加载。

## 目录结构

```text
.
|-- .agents/
|   `-- plugins/
|       `-- marketplace.json
|-- .github/
|   `-- workflows/
|       `-- validate.yml
|-- plugins/
|   `-- <plugin-name>/
|       |-- .codex-plugin/
|       |   `-- plugin.json
|       `-- skills/
|           `-- <skill-name>/
|               `-- SKILL.md
|-- scripts/
|   |-- new_plugin.py
|   `-- validate_repository.py
|-- AGENTS.md
|-- CONTRIBUTING.md
`-- README.md
```

## 创建插件

使用仓库自带脚本创建插件并自动登记到 marketplace：

```powershell
python scripts/new_plugin.py my-plugin `
  --display-name "My Plugin" `
  --description "Describe when Codex should use this plugin."
```

然后编辑生成的 `plugins/my-plugin/skills/my-plugin/SKILL.md`，实现真实工作流。

发布前运行：

```powershell
python scripts/validate_repository.py
```

该检查也会在每次推送和拉取请求中通过 GitHub Actions 自动执行。

## 添加不同类型的能力

一个插件可以按需包含以下内容：

- `skills/`：可复用的 Codex 工作流和领域知识。
- `hooks/hooks.json`：需要用户审核和信任的生命周期 hooks。
- `.mcp.json`：插件提供的 MCP 服务。
- `.app.json`：插件提供的应用集成。
- `scripts/`：技能或工具使用的辅助脚本。
- `assets/`：图标、截图和其他静态资源。

只有实际创建了对应文件时，才应在 `.codex-plugin/plugin.json` 中声明
`mcpServers`、`apps` 或显式 hook 路径。默认位置 `hooks/hooks.json`
可以由 Codex 自动发现。

## 发布检查

- 插件目录名、marketplace 条目名和 `plugin.json` 的 `name` 必须一致。
- 插件名使用小写 kebab-case，最长 64 个字符。
- marketplace 中的路径必须是 `./plugins/<plugin-name>`。
- 插件版本使用严格的语义化版本。
- 不提交密钥、令牌、私有地址或机器相关的绝对路径。
- 所有变更在推送前通过 `python scripts/validate_repository.py`。

## License

仓库自有脚本和文档默认采用 [MIT](LICENSE)；包含上游代码的插件可能使用
各自目录内声明的许可证。完整边界见 [LICENSES.md](LICENSES.md)。
