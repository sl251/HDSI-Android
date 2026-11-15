# Preview 9 M5 验收摘要（原 result-m5.txt 精简版）

> 归档说明：原根目录大体积原始日志已从主树清理，本文件保留精简验收摘要与验证结论；如需完整日志可按命令本地复验或查阅清理前 Git 历史。

HDS-Android Preview 9 M5 验收报告
生成时间：2026-10-17T01:37:21 Asia/Shanghai
分支：codex/p9-m5
基线 HEAD：7928e7a3aa0a6570f0459881e4e6a562ba12e44f

1. 交付结论
实现与四道验收门禁已完成：类型检查/JavaScript、默认多进程 Chromium UI、Robolectric、上游基线无新增失败。上游原始套件本身仍有既有失败，详见第 4 节，不把原套件退出码 1 写成全绿。
未能创建 Git 提交：git add 退出 128，.git/index.lock 无法创建（Read-only file system）。未尝试绕过沙箱或修改 Git 目录权限；源码与新增文件保留在工作区，均未暂存。任务书和本报告不提交；原有未跟踪 codex-task-m4.md、result-m4.txt、result.txt 保留。
预期 commit message：feat: Preview 9 M5 — 角色自主语音与音色工作台

2. 改动清单与动机
A 上游最小补丁：types.ts 增加可选 voice 能力/决策/出站提示；narrator.ts 在普通与 lite 提示中按能力注入克制意愿协议，关闭时 voiceInstruction 严格为空串。service.ts 仅在 mobile-local 读取 App 能力并透传合法意愿，等待最终决策；QQ 仍调用原发送方法。上游没有 TTS、音频 IO 或 API key。
B 设置与绑定：VoiceSettings 按当前角色保存默认关闭的开关、音色与意愿阈值；空绑定回退全局音色。配置由 Android 原子保存，宿主实时读取；无需为语音设置重启。入口置于空间 → B 智能 → 角色语音与音色，工作台为子层。
C 本地后处理：runtime/voice.ts 从实际最终回复剥离思考/媒体标记后经随机端口鉴权回环桥请求 Android；角色人设派生风格。MimoTtsClient 固定官方端点、api-key 头、user 风格/assistant 正文、wav 格式，按 builtin/design/reference 选择三模型。密钥复用 Keystore AES-GCM，用户设置填写，Mimo 密钥不进 PRoot 或命令行。连接/读取/看门狗超时 + 宿主 30 秒超时保证失败返回普通文字。
音频存于 noBackupFilesDir/hds/voice，文件以 SHA-256 ID 索引。mobile_message.audio 新增 JSON 列；旧表自动迁移，缺失/{} 归一化为空，保留原文字、images 和状态。历史接口输出 ISO 时间，修复 Date 对象经 Date.parse 丢失毫秒的直接 RPC 兼容问题。
D 用量护栏：日限默认 50000 token，冷却默认每 5 条文字回复最多一条成功语音；均可设 0 关闭，阈值默认 .7。Android 全局锁覆盖聊天/试听的预记账、网络与结算；状态持久化、按设备自然日重置 token，用量达限后停止两条路径并只提示一次。超时/缺 usage 保留保守预记账，成功按 usage.total_tokens 或 prompt_tokens+completion_tokens 结算。最后一次实际回执可以使累计量超过限额，此后不再发请求；它不是服务端账单硬扣款上限。
E 音色工作台：MediaRecorder + 麦克风授权；SAF 导入 WAV/MP3；MediaExtractor/MediaCodec 将压缩音频转 PCM WAV。支持参考音频/描述音色的试听、命名保存、改名、删除、角色绑定与全局默认；试听走同一 TTS 管线计入用量。删除音色仅清理绑定，保留历史 WAV。
F 前端：同条消息显示播放/暂停、实际 WAV 时长（秒向上取整）与可展开文字稿。关闭角色开关时聊天展示文字；离开页面取消未返回的播放结果，避免隐藏页面突然播放。普通括号文字保留，语音/图片/贴纸标记被剥离。
测试与文档：新增 tests/m5.test.ts、tests/m5-ui.mjs、VoiceStoreTest.kt；UI 命令先构建真实宿主并串行运行旧场景与 M5 场景。旧 UI 仅增加失败取证与可选低资源启动参数，原断言/等待检查逐行保留；上游测试文件、M4 和定时联系测试无改动。docs/MOBILE-PATCHES.md 与 docs/evidence/m5/ 记录边界与视觉证据。无新增 npm 或 Gradle 依赖。

3. Diff 摘要
本批源码/文档/证据清单（共 32 个文件）：
- android/app/src/main/AndroidManifest.xml (52 lines)
- android/app/src/main/java/io/hdsinterlude/android/HdsRuntime.kt (453 lines)
- android/app/src/main/java/io/hdsinterlude/android/HdsRuntimePlugin.kt (302 lines)
- android/app/src/main/java/io/hdsinterlude/android/HdsStore.kt (188 lines)
- android/app/src/main/java/io/hdsinterlude/android/MimoTtsClient.kt (37 lines)
- android/app/src/main/java/io/hdsinterlude/android/VoiceBridge.kt (38 lines)
- android/app/src/main/java/io/hdsinterlude/android/VoiceRecorder.kt (29 lines)
- android/app/src/main/java/io/hdsinterlude/android/VoiceStore.kt (137 lines)
- android/app/src/main/java/io/hdsinterlude/android/WavAudio.kt (73 lines)
- android/app/src/test/java/io/hdsinterlude/android/VoiceStoreTest.kt (183 lines)
- apps/mobile-ui/Voice.tsx (89 lines)
- apps/mobile-ui/MessageContent.tsx (11 lines)
- apps/mobile-ui/main.tsx (545 lines)
- apps/mobile-ui/style.css (119 lines)
- packages/contracts/index.ts (165 lines)
- packages/contracts/voice.ts (15 lines)
- runtime/host.ts (301 lines)
- runtime/voice.ts (26 lines)
- upstream/hds-interlude/src/types.ts (1268 lines)
- upstream/hds-interlude/src/narrator.ts (2674 lines)
- upstream/hds-interlude/src/service.ts (13135 lines)
- tests/m5.test.ts (125 lines)
- tests/m5-ui.mjs (197 lines)
- tests/story-ui.mjs (716 lines)
- package.json (41 lines)
- docs/MOBILE-PATCHES.md (30 lines)
- docs/evidence/m5/README.md (29 lines)
- docs/evidence/m5/voice-chat-320.png (105716 bytes)
- docs/evidence/m5/voice-chat-390.png (119316 bytes)
- docs/evidence/m5/voice-chat-740.png (171507 bytes)
- docs/evidence/m5/workbench-390.png (35323 bytes)
- docs/evidence/m5/workbench-library-390.png (26295 bytes)

Git tracked diff --stat（新文件另见上述清单）：
android/app/src/main/AndroidManifest.xml           |  1 +
 .../java/io/hdsinterlude/android/HdsRuntime.kt     | 15 ++++++++---
 .../io/hdsinterlude/android/HdsRuntimePlugin.kt    | 30 +++++++++++++++++++++-
 .../main/java/io/hdsinterlude/android/HdsStore.kt  |  7 +++++
 apps/mobile-ui/MessageContent.tsx                  |  4 +--
 apps/mobile-ui/main.tsx                            | 10 +++++---
 apps/mobile-ui/style.css                           | 11 ++++++++
 docs/MOBILE-PATCHES.md                             |  7 +++++
 package.json                                       |  2 +-
 packages/contracts/index.ts                        | 19 +++++++++++---
 runtime/host.ts                                    | 19 +++++++++-----
 tests/story-ui.mjs                                 | 19 ++++++++++++--
 upstream/hds-interlude/src/narrator.ts             |  9 +++++++
 upstream/hds-interlude/src/service.ts              | 22 +++++++++++++---
 upstream/hds-interlude/src/types.ts                |  5 ++++
 15 files changed, 154 insertions(+), 26 deletions(-)

4. 四道验证命令与退出码
① npm run typecheck：退出 0；npm test：退出 0，72 tests / 72 pass / 0 fail；最终 npm run android:sync：退出 0（含再次 typecheck、生产 build、Capacitor 同步）。日志 typecheck-last.log / npm-test-last.log / android-sync-final.log。
② 独立启动 npm run dev -- --port 5185 --strictPort 后执行：HDS_BROWSER=/root/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome HDS_UI_URL=http://127.0.0.1:5185 npm run test:ui；最终默认多进程 Chromium 退出 0。含原场景与真实 HDS → LocalBot → SQLite → 浏览器语音主路径、真实 WAV 播放、文字稿、关闭无音频 UI、失败降级、读取期间离开页面、工作台 CRUD。日志 ui-default-final.log。
③ JAVA_HOME=/tmp/hds-p0b-toolchain/jdk-21.0.12.1+1 ANDROID_HOME=/tmp/hds-p0b-toolchain/sdk ANDROID_USER_HOME=/tmp/hds-p0b-toolchain/android-user GRADLE_USER_HOME=/tmp/hds-p0b-toolchain/gradle android/gradlew -p android --no-daemon --max-workers=1 -I /tmp/hds-p0b-toolchain/test-memory.gradle -Dorg.gradle.jvmargs=-Xmx384m -Pkotlin.compiler.execution.strategy=in-process testReleaseUnitTest：退出 0。
原生 XML 汇总：{"tests": 78, "failures": 0, "errors": 0, "skipped": 1}；77 pass / 1 skipped / 0 failure。M5 VoiceStoreTest 10/10，无跳过。旧 extractsActualPreviewOneArchiveWhenProvided 因未提供 HDS_LEGACY_ROOTFS 历史实物输入而跳过，未移除/改写原测试。详见 native-results.json 和 gradle-final.log。
④ 在 upstream/hds-interlude 与 git archive HEAD 提取的 /tmp/hds-m5-baseline/upstream/hds-interlude 分别执行 node --import tsx --test --test-reporter=tap test/*.test.ts。两次原套件退出码均为 1；随后逐项对比失败名称和测试/通过/失败/跳过总数，比较门禁退出 0。原输出 upstream-current.log / upstream-head.log；结果 upstream-compare.log：
$ python3 /tmp/m5-compare-upstream.py
HEAD: {"failures": ["runtime and plugin exports share one version constant", "fix\\#10 flush failure schedules a narrative retry when nothing committed", "promise settles after all bubbles are confirmed, never after first or failed delivery", "reschedule is idempotent even if the script settlement marker was lost", "new spoken promise is registered only after full delivery and after old resolution", "release-facing files share the runtime version", "outbox recovery respects pending split ownership instead of competing with its sender"], "counts": {"tests": "838", "pass": "827", "fail": "7", "skipped": "4"}}
M5: {"failures": ["runtime and plugin exports share one version constant", "fix\\#10 flush failure schedules a narrative retry when nothing committed", "promise settles after all bubbles are confirmed, never after first or failed delivery", "reschedule is idempotent even if the script settlement marker was lost", "new spoken promise is registered only after full delivery and after old resolution", "release-facing files share the runtime version", "outbox recovery respects pending split ownership instead of competing with its sender"], "counts": {"tests": "838", "pass": "827", "fail": "7", "skipped": "4"}}
PASS: original upstream assertions preserved; identical failure names and totals.

Exit code: 0
另外：原断言保留检查退出 0（116 assert / 83 waitFor / 41 waitForFunction），git diff --check 退出 0。

5. 视觉走查与边界
已逐张查看语音聊天 320/390/740px、工作台 320/390px、390px 音色库及关闭后聊天截图。窄屏文字稿自然换行，播放按钮/时长清楚，工作台可滚动到音色库；三种宽度均自动断言无水平溢出。正文与语音同一消息，关闭后无播放 UI。精选图及 SHA-256 见 docs/evidence/m5/README.md。
浏览器使用真实引擎、数据库、React 和 PCM WAV 播放；模型和 Android 桥为夹具。录音/MP3 解码等原生测试使用 Robolectric shadow，TTS 使用真实 HTTP mock 端点；不等于 Android 真机采音、设备 codec、Keystore 硬件或付费 Mimo 实测。没有使用参考脚本中的真实 KEY，也没有付费 API 调用。
本地音频不随音色删除或故事切换清除。语音库为全局独立存储，既有故事导出不额外打包全局语音库；跨设备只有文字稿的历史仍可读，缺失音频播放失败时可展开文字。

6. 异常与重试（保留失败，不用失败轮次冒充通过）
- 初期 UI 类型检查发现 native 变量先使用后声明，已修正；typecheck-ui.log 记录原始 TS2448/TS2454。该轮 shell 最后 cat 覆盖了命令退出码，未单独保存 tsc 码，不能据工具码 0 判为通过；最终使用保留真实子进程退出码的 runner。
- 新 M5 测试首次用动态 ESM 导入 CJS Koishi 失败；按仓库既有 createRequire 模式修正，未改原断言。
- 全量首轮完整结果 70/72，捕获发送钩子绕过及历史 Date 丢毫秒：改为通过原 send 方法 options 透传意愿，历史统一 ISO；定向 16/16 与后续两轮全量 72/72 均通过。
- 新工作台测试中异步受控开关改为 click 后等待实际保存，创建方式选择器补明确 aria-label；没有放宽任何原测试断言。
- npm-test.log、m5-ui-retry2.log、独立 Vite session 被运行环境终止，工具返回 143，没有完整总结，未算通过。随后改用带进度的受管会话；Vite 与 UI runner 同生命周期启动/清理。
- UI 曾出现预览服务已结束导致 ERR_CONNECTION_REFUSED；以及磁盘可用 0、浏览器重载空白/Target crashed。只清理本轮中断留下的 3 个 /tmp 临时目录，未清角色/聊天或删除工具链。低资源模式曾完整通过；观测到空间恢复约 1.3 GiB 后，最终用默认多进程完整通过。保留 ui-m3-diagnostic*.log、ui-m3-low-disk.log、ui-final-green.log、ui-default-final.log，不混淆它们。
- Gradle 输出既有 SDK metrics 的 /root/.android 只读提示、flatDir 提示、StoryArchive 空值警告及 image decoder unimplemented 输出，最终测试退出 0；没有为消除提示改动原代码断言。
- 旧基线提取临时目录在对照前已不存在，首次基线命令退出 127（upstream-head-missing.log）。重新用 git archive HEAD 提取，只读复用同一 node_modules，再运行实际基线套件并逐项比较。
- git add 退出 128（只读 .git），因此未执行 commit，未绕过权限。此项是本次交付的环境限制，预期提交信息列于第 1 节。

