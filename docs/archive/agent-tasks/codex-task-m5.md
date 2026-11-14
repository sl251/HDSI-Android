# HDS-Android Preview 9 — M5 角色自主发语音 + 音色工作台

> 派发前提：M4 已合 main。若 M4 实际落地与本任务书假设有出入（尤其 runtime/stickers.ts 的桥接形态、LocalBot 透传写法），以 M4 合入后的代码为准，吸收其模式后再动工。

## 背景与目标

M4 之后，角色已能自主发表情包。本批次实现 M5：**角色可以自主决定把某条回复以语音形式投递**。用户形态要求（管理员明确指定）：

1. 语音能力每角色可开关（默认关）；能力关闭时模型完全不知道语音概念。
2. 能力开放后模型也不会一直发语音——语音是"多一种选择"：决策 JSON 里加意愿字段 + 阈值门槛 + 冷却限制，与贴纸 localMedia 同一模式。
3. 语音始终是**最终文本的另一种投递形式**：文字稿保留、可展开；TTS 失败静默降级为普通文字消息。
4. **音色工作台本轮做**：录音/导入 → 试听 → 命名保存；每角色绑定一个音色，未绑定回退全局默认音色。

## Mimo TTS API 事实（主代理 2026-10-16 实测，全部跑通过）

- 端点 `POST https://api.xiaomimimo.com/v1/chat/completions`，header `api-key: <KEY>`（不是 Bearer），`Content-Type: application/json`。
- 消息结构：`user` 消息 = 风格指令（说话方式描述），`assistant` 消息 = 要念的正文。
- 三模型：
  - `mimo-v2.5-tts`：内置音色（如 `audio: {format:"wav", voice:"茉莉"}`）。
  - `mimo-v2.5-tts-voiceclone`：`audio: {format:"wav", voice:"<base64 wav 参考音频>"}` —— 实测 base64 参考音频直传 audio.voice 即可克隆，无需注册音色。
  - `mimo-v2.5-tts-voicedesign`：voice 为自然语言音色描述（工作台保存的就是这段描述文本）。
- 返回：`choices[0].message.audio.data` = base64 wav；`usage` 里含 token 计数（按 token 计费）。
- 实测脚本参考（形状勿改）：`/root/hermes-workspace/xiaoyu-voice/test/test1.py`、`test2.py`。KEY 在脚本里，运行时代用用户自己填的 key，不硬编码。

## 实现要求

### A. 上游补丁（最小化，照 M4 门禁补丁的先例与纪律）

- `ChatActionCapabilities`（`upstream/hds-interlude/src/types.ts` L652）加可选 `voice?: { enabled: boolean; threshold?: number }` 能力位。
- 决策 schema / narrator：回复决策增加可选 `voice: { willingness: 0.0–1.0 }`；能力未开放时**指令为空字符串**（不注入任何语音概念——与 M4 空库兜底同一纪律，必须测试锁死）。指令文案要求模型克制："仅在情绪强烈或氛围合适时使用；文字本身永远是主体"。
- 上游不调用 TTS、不碰音频传输——语音生成完全在 App 侧。

### B. 开关与角色绑定（App 层）

- 角色卡/设置：每角色"允许角色发语音"开关（默认关）+ 音色绑定选择器（工作台库内选择；未选回退全局默认音色）。
- 开关关闭时 capability 不注入；QQ 路径零改动。

### C. 语音生成（App 侧后处理）

- 角色回复决策 voice.willingness ≥ 阈值（默认 0.7）时，对**最终文本**调 Mimo TTS：风格指令从角色人设/性格派生（可模板拼接），模型按音色类型选（内置 / voicedesign 描述 / voiceclone 参考音频）。
- wav 存本地（扩展 StickerStore 同级存储，如 `noBackupFilesDir/hds/voice/`），消息记录挂 audioId；`mobile_message` 表加列或复用 images JSON 存储，需保持旧数据可读（迁移兼容）。
- TTS 失败/超时 → 静默降级为普通文字消息，聊天流不中断。

### D. 用量护栏（用户明确要求，验收硬条件）

- 全局设置项：语音日 token 上限（默认给保守值，如 50k/日），到达后当日自动停用语音并出一次性提示，不清数据、不影响文字回复。
- 每角色语音冷却：连续 N 条回复内最多 1 条语音（默认如 5），抑制刷屏。两项均可调/可关。

### E. 音色工作台（本轮必做）

- 入口在设置层（参照 M2 设置三层重组的层级规范）。
- 功能：录音（MediaRecorder）或 SAF 导入 wav/mp3 → 试听 → 命名保存。
- 保存形态两种：参考音频（存本地文件，发送时 base64 直传 voiceclone）或 voicedesign 描述文本（用户输入或从录音引导生成）。删除/改名支持。
- 试听走同一 TTS 管线（小样文本），消耗计入用量护栏。

### F. 前端

- 语音气泡：播放按钮 + 时长，可展开文字稿；文字稿与语音同体，不拆两条消息。
- 角色语音开关关闭时前端不出现任何语音 UI 冒头。

## 测试与验收（四道，全绿才算完成）

- `npm run typecheck`、`npm test` 全绿；新增 M5 单测：能力位注入/不注入、意愿阈值、冷却与日限算法、降级路径、旧消息数据兼容、标记剥离回归。
- UI 回归全绿：`HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome npm run test:ui`（语音气泡、展开文字稿、开关关闭无 UI、工作台基本流）。
- Gradle Robolectric：录音/导入、TTS 客户端（mock 端点）、用量记账、存储（工具链 `/tmp/hds-p0b-toolchain`，命令以 `.github/workflows` 与仓库历史为准）。
- 上游基线不破；不为过测改写原始断言；vendored 补丁最小化并在 `docs/MOBILE-PATCHES.md` 增补。
- M4 落地后补的真实 Playwright 场景用例模式（如任务书引用了 M4 的场景用例形态）需覆盖语音主路径 + 真实浏览器视觉走查记录进验收报告。

## 约束

- 不新增 npm 依赖；API key 不进命令行参数、不硬编码；用户 key 由用户在设置里填。
- 不动 QQ 集成代码路径的行为。
- 不清用户数据；语音存储不占 PRoot 根文件系统以外的敏感目录。

## 流程

- 分支 `codex/p9-m5`（基于合入 M4 的 main，由主代理创建后派发）。
- commit message：`feat: Preview 9 M5 — …`；本文件与 `result-m5.txt` 不 commit。
- 验收报告写 `result-m5.txt`：改动清单+动机、Diff 摘要、四道验证命令与退出码、原始输出、异常与重试说明。诚实报告，不编造输出。
