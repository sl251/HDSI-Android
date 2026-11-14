# Preview 9 M5 浏览器走查

2026-10-17，仓库真实 React 界面 + 实际 HDS rc51 / LocalBot / SQLite，Chromium `/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`。

测试入口：`npm run test:ui`，包括原 `tests/story-ui.mjs` 和新增 `tests/m5-ui.mjs`。Vite 独立启动在 `127.0.0.1:5185`，退出时清理本轮服务。

本机初始磁盘可用空间为 0、内存约 1 GiB，默认多进程 Chromium 在旧 M3 重载场景出现空白页 / Target crashed；低资源参数曾通过完整回归。随后观测到磁盘恢复约 1.3 GiB 可用空间，最终再次以默认多进程模式通过完整套件；原根目录 `result-m5.txt` 中的原始日志 `ui-default-final.log` 已经在仓库整理中移除大体积原始输出，精简验收摘要与可复验命令见 [result-m5-summary.md](../../archive/agent-tasks/result-m5-summary.md)。未更改或删除既有断言（原 116 条 assert、83 条 waitFor、41 条 waitForFunction 均逐行保留）。可选 `HDS_BROWSER_LOW_RESOURCES=1` 仅用于受限 CI，默认不启用。

## 场景与实际观察

- 角色语音默认关闭，关闭时聊天没有播放、时长或文字稿按钮。
- 从“空间 → B 智能 → 角色语音与音色”开启当前角色，工作台完成描述音色试听/保存、音频导入、录音开始/结束、命名、改名、绑定及删除回退。
- 浏览器发送消息后，由真实 HDS 决策返回 `voice.willingness=.95`，本地后处理将最终正文与 audioId 写入同一条 SQLite 消息。播放按钮实际播放合法 PCM WAV；文字稿展开前隐藏、展开后与回复正文一致。
- 音频读取时离开聊天页，待返回的音频不会在新页面突然播放；回到聊天后仍可正常播放。
- TTS 模拟端点返回 503，下一条回复保留完整文字且没有音频；关闭开关后历史语音也显示为文字，后续模型请求不含语音能力指令。
- 320 / 390 / 740 px 均自动检查无水平溢出。逐张查看了这里的语音气泡截图：播放与时长分布清楚，320 px 文字稿自然换行，740 px 气泡随布局扩展。工作台内容在弹窗内部滚动，顶部和音色库均可访问。
- `voice-disabled.png` 保留在 artifacts/m5（完整页截屏会包含固定输入区与导航，不作为导出版式）。已目视检查该图中所有角色回复均为文字，没有音频按钮。

## 边界

模型服务和 Android 原生桥为测试夹具；HDS、消息入库、React DOM、浏览器播放和用户操作是真实执行。夹具的录音/SAF/TTS 不等于真机麦克风、设备编解码器或付费 Mimo 实测。原生 MediaRecorder、MP3 解码、WAV 存储、三种模型请求和用量护栏另由 Robolectric/mock HTTP 验证。没有使用真实 API key。

## 图片摘要

- `voice-chat-320.png` — SHA-256 `f37c83b165a54f806815f6b3dce32946562d3ab4e543033e661735d034bcbde7`
- `voice-chat-390.png` — SHA-256 `5e9182d345ec10ed10e8bd56c54d9d45fbfcbca1d39afc40748b1d2fa8e124a2`
- `voice-chat-740.png` — SHA-256 `58ff77d7e44c68225bcf185a4408a46098a59067250c854460216a153e5fc58e`
- `workbench-390.png` — SHA-256 `5d7e1de853b9c9adfe9bb2833329ab92ee7c2bc751b8508179abfb6f09f0833b`
- `workbench-library-390.png` — SHA-256 `7a3f68bc22daa276ce7db9925325c2a50f746d31ca44288f6786770c9941cfac`
