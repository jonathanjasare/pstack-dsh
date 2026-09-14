# official pstack 的 DeepSeek Harness 移植

**English title.** pstack-dsh, a DeepSeek Harness port of official pstack.

**中文.** 这是 official pstack 的 DeepSeek Harness 移植。玩法和原则来自 poteto 的 official pstack；只有调用层换成 DSH。

**English.** This is a DeepSeek Harness port of official pstack. Playbooks and principles are poteto's. Only the harness call layer is swapped.

## 来源 / Credits

23 个玩法（playbooks）和 23 条原则（principles）是 [poteto](https://x.com/poteto) 写的，出自 [official pstack](https://github.com/cursor/plugins/tree/main/pstack)。本仓库是 DeepSeek Harness 移植（[aa2246740/pstack-dsh](https://github.com/aa2246740/pstack-dsh)）。调用层用 [HARNESS.md](./HARNESS.md) 里的 DSH 工具名。玩法和原则不是本仓库写的。

The 23 playbooks and 23 principles are [poteto](https://x.com/poteto)'s, from [official pstack](https://github.com/cursor/plugins/tree/main/pstack). This repository is the DeepSeek Harness port ([aa2246740/pstack-dsh](https://github.com/aa2246740/pstack-dsh)). Harness calls use DSH tools named in [HARNESS.md](./HARNESS.md). This port did not author those playbooks or principles.

## 安装 / Install

```bash
dsh plugin add github:aa2246740/pstack-dsh
```

本地目录也可以：

A local checkout also works:

```bash
dsh plugin add ./pstack-dsh
```

工具对照见 [HARNESS.md](./HARNESS.md)。工作台是 [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit)，用来 `check` / `verify-boot`。不要用它当 DSH 发行版。

Tool mapping is in [HARNESS.md](./HARNESS.md). [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit) is the out-of-process workbench for `check` / `verify-boot`. It is not a DSH fork.

## 开始用 / Get started

两步。

Two steps.

1. 要做事、要严谨，直接用 [`/poteto-mode`](./skills/poteto-mode/SKILL.md)。不用先跑 setup。子 agent 默认继承当前对话的路由。
2. 只有想给某个角色换已登录的路由时，打开 **设置 → pstack**（导航「pstack 角色」/「pstack roles」）。页面写入 `$DSH_HOME/pstack-dsh.json`。[`/setup-pstack`](./skills/setup-pstack/SKILL.md) 只是指向那一页的指针。

1. Use [`/poteto-mode`](./skills/poteto-mode/SKILL.md) for work that needs rigor. No setup required. Children inherit this conversation's route.
2. To pin a logged-in route per role, open **Settings → pstack** (nav label **pstack 角色** / **pstack roles**). The page writes `$DSH_HOME/pstack-dsh.json`. [`/setup-pstack`](./skills/setup-pstack/SKILL.md) is an optional pointer to that page.

角色模型列表会随 DSH 的登录、退出登录和模型目录变更通知更新，也可点击「刷新模型列表」。刷新只更新候选项，不覆盖尚未保存的角色和 effort；当前选择若失去登录会标为「暂不可用」。新加入 dsh-oauth-login 的 `pi-*` 路由以及 dsh-antigravity-oauth 的 `agy-*` 路由只要已登录且已注册，就会自动纳入，无需在 pstack 里再维护一份提供商名单。

Model choices follow DSH login/logout and catalog notifications. **Refresh models** also updates the choices without replacing unsaved role/effort edits. A selected route that becomes unavailable stays visibly marked. Newly registered, signed-in `pi-*` and `agy-*` routes are discovered without a second provider allowlist.

The locally authenticated `cursor` provider is also discovered when
[dsh-cursor-passthrough](https://github.com/mingzhong15/dsh-cursor-passthrough)
is installed and exposes live models. This lets a DSH parent assign a pstack
role to a Cursor subscription model without storing Cursor credentials in DSH.

安装并启用 [dsh-cursor-passthrough](https://github.com/mingzhong15/dsh-cursor-passthrough)
后，pstack 也会发现由本机 Cursor CLI 登录的 `cursor` 提供商。这样 DSH 父对话可以把指定角色分配给 Cursor 订阅模型，无需在 DSH 中保存 Cursor 凭据。

For mixed routing, keep the parent conversation on a native DSH provider and
assign Cursor models to selected roles in **Settings → pstack**. `pstack_spawn`
then routes those children through Cursor. If the parent itself uses Cursor
passthrough, it runs through Cursor ACP and cannot call DSH-only tools such as
`pstack_spawn`; use Cursor's own subagents in that case.

混合路由时，请让父对话使用 DSH 原生提供商，再在 **设置 → pstack** 中把部分角色分配给 Cursor 模型。若父对话本身使用 Cursor passthrough，该轮会通过 Cursor ACP 执行，无法调用 `pstack_spawn` 等 DSH 专用工具；此时请使用 Cursor 自带的子代理。

第一次用可以看 [pstack 指南](./docs/guide/README.md)。

New here? The [pstack guide](./docs/guide/README.md) walks through a first real task.

其余技能是按需的。`/poteto-mode` 会在步骤需要时自己去调。

The other skills are situational. The mode skill uses them when a step needs them.

## 上游 0.15 同步

技能内容同步至 `cursor/plugins` 的 pstack 0.15.0，提交 `71ed0d1076fec562c1b74ee353121a8d00f75382`。保留 DSH 工具和角色路由。

设置页的「Poteto 0.15 推荐」仅供参考，不会替换用户已保存的模型或 effort。`how-critics` 不再显示或启动代理，旧配置仍可读写并保留。不包含 Cursor 专用的 make-bot-ui。

The Poteto 0.15 recommendations are display-only. Existing model and effort assignments remain unchanged. The retired `how-critics` setting stays readable for compatibility but is hidden and never starts an agent. Cursor-only make-bot-ui is not included.

## 默认模型与 effort / Defaults

装完就能用，不必先打开设置，也不必跑 `/setup-pstack`。

A fresh install is usable without Settings → pstack and without `/setup-pstack`.

**模型 / Model.** 不要发送 `model`，除非 live catalog 里已经有这一条。没有 overlay 就继承父对话。不要编造 Cursor 面板 slug（`grok-4.6-fast-xhigh`、`gpt-5.6-sol-max`、`claude-fable-5-thinking-max`、`claude-opus-5-thinking-xhigh`）。

Do not send `model` unless that pair was detected live. Missing overlay inherits the parent. Do not invent Cursor panel slugs.

**effort.** 只提供该路由 `resolveModelInfo().reasoning.efforts` 列出的 id。没有 effort 字段就省略。skill 从不在 spawn 上发送 `reasoning_effort` 或 `thinking`。官方 `subagent` schema 没有这些字段。角色 effort 写在 overlay 里，由 `agent/request` 落到 `LlmCallConfig.reasoningEffort`。

Effort is only the ids that route actually accepts. If the route has none, omit it. Skills never send `reasoning_effort` or `thinking` on spawn. Official `subagent` has no such field. Role effort lives in the overlay and is applied on `agent/request`.

**设置 / Settings.** 配置页是官方 Settings 里的 `settings.section`（id `pstack`，order 16）。只列出已登录路由；effort 只列出该路由 live `resolveModelInfo().reasoning.efforts`。空列表就是继承父对话。保存写同一份 overlay，不是第二份配置。

The editor is the official Settings `settings.section` (id `pstack`, order 16). It lists logged-in routes only. Effort options are that route's live `resolveModelInfo().reasoning.efforts`. An empty list means inherit the parent. Save writes the same overlay, not a second file.

设置页只列出已经登录的 API key 路由，以及 dsh-oauth-login / dsh-antigravity-oauth 里已经签过名、并且适配器已注册的路由。空目录就是继承父对话。

## 推荐依赖 / Recommended peer

订阅与服务登录（ChatGPT / Claude / Grok / Copilot / OpenRouter / Kimi / Google Antigravity）要出现在 **设置 → pstack** 列表里，可按需安装 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 或 dsh-antigravity-oauth。不是硬依赖。只用 API key 的用户可以不装。本插件不读写 `~/.pi`、`~/.codex`、`~/.claude`、grok CLI 登录文件。

Subscription logins show up on **Settings → pstack** after you install [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) or dsh-antigravity-oauth. They are not required. API-key-only users work without them. This plugin does not read or write official CLI auth files.

```bash
dsh plugin add github:aa2246740/dsh-oauth-login
```

## 这不是 Cursor 插件 / Not the Cursor plugin

这里的角色映射在 **设置 → pstack**。官方 Cursor `/setup-pstack` 会写 `~/.cursor/rules`，并用 Cursor 的模型名。不要在 DSH 上跑那份。

Role mapping in this repo is **Settings → pstack**. Official Cursor `/setup-pstack` writes `~/.cursor/rules` and uses Cursor slugs. Do not run it here.

## 工具 / Tools

本插件注册：

This plugin registers:

| 工具 / Tool | 作用 / Role |
|---|---|
| `pstack_spawn` | 按角色起 DSH 子 agent。不要传 model / effort。 |
| `pstack_catalog` | 只列出已登录的 live 路由。 |
| `pstack_overlay_read` / `pstack_overlay_write` | 读写 `$DSH_HOME/pstack-dsh.json`。 |
| Settings → pstack | 官方设置页。保存同一份 overlay。 |

技能入口：`/poteto-mode`，以及 bundled 的 playbook / principle skills。[`/setup-pstack`](./skills/setup-pstack/SKILL.md) 指向设置页。

Slash entry: `/poteto-mode`, plus the bundled playbook and principle skills. [`/setup-pstack`](./skills/setup-pstack/SKILL.md) points at the Settings page.

## 开发 / Develop

```bash
npm install
npm test
npx dshx check pstack-dsh --harness /path/to/deepseek-harness
npx dshx verify-boot pstack-dsh --port 43123
```

不要对用户正在用的 DSH Host 发 `--force`，也不要杀它。`verify-boot` 只允许隔离冷启动。对照 [TEST-PLAN.md](./TEST-PLAN.md)。

Do not `--force` or kill a user's live DSH Host. `verify-boot` is isolated cold boot only. See [TEST-PLAN.md](./TEST-PLAN.md).

## 许可 / License

MIT。玩法与原则：Lauren Tan。DSH 移植打包：aa2246740。见 [LICENSE](./LICENSE)。

MIT. Playbooks and principles: Lauren Tan. DSH port packaging: aa2246740. See [LICENSE](./LICENSE).
