# 导入与启动修复验收报告

基线：`main`，HEAD `e7d772c`。未改应用版本号，未构建 APK/发布包，未 commit。原有未跟踪文件 `codex-task-import-fixes.md` 保留。

## Bug 1：空档案无法导回

根因：导出只要求姓名，HDS 导入却要求姓名和档案同时非空。

改动：

- `apps/mobile-ui/character-export.ts`：保留已有档案/描述候选链，再取角色或设定的 personality；仍为空则导出 `（此角色未填写人设档案）`。
- `packages/persona-format/index.ts`：只有姓名和档案同时为空才拒绝；仅有姓名时补档案，仅有档案时补 `未命名角色`。既有类型、长度、安全检查保留。
- `tests/character-export.test.ts`、`tests/persona-format.test.ts`：覆盖空档案 YAML/JSON 往返、描述/性格候选、缺失或空白档案、仅有档案，以及无角色信息的状态机拒绝。

风险：占位档案会成为导入后实际保存的人设文本；没有原始档案时无法恢复更丰富的描述。

## Bug 2：休息时不能检查导入码

根因：按钮、处理函数入口和异步返回校验都要求 healthy。此外，实际 `preset.sync` 走本机核心 RPC，核心停止后会报“请先启动 HDS”；只放宽按钮仍无法完成预览。

改动：

- `apps/mobile-ui/main.tsx`：检查只要求已选角色（保留 native、设置就绪、非忙碌等条件）；应用继续要求 healthy。区分未选角色与已选角色但休息的提示。原有 `storyRevision` / `current` 应用前校验原样保留。
- `apps/mobile-ui/preset-preview.ts`：通过原生 `CapacitorHttp` 独立拉取，复用上游 fetchShare 的响应验证、清洗和人设转换，按已发货的移动端 schema 筛选字段并计算差异、SHA-256 指纹。无需启动核心，也不写人设或设置。应用仍由核心重新拉取、验证指纹与字段类型/范围，再写入。
- `apps/mobile-ui/build-share-sanitizer.mjs`、`share-sanitizer.js`、`share-sanitizer.d.ts`：扩展现有生成入口，导出上游 fetchShare 和 storyDefaultsToSettingPatch；未修改上游源码。
- `tests/import-code.test.ts`：验证有效预设的前端/核心差异与指纹一致、所有已发货默认字段、仅人设/无变化预设、网络与响应错误。
- `tests/import-code-ui.mjs`、`package.json`：真实 App 的回归接入 `test:ui`，覆盖未选角色禁用、休息时检查、休息时禁止应用、唤醒后应用、故事变化后拒绝旧预览、请求期间故事变化后拒绝结果。

revision 核对：`profileRevision.current` 在网络请求前读取，异步返回后验证未变，再将这个值缓存为 `storyRevision`。单纯唤醒不递增它，所以休息时检查后唤醒可以应用；切换故事会递增，旧预览必须重新检查。UI 测试覆盖上述两条路径及请求进行中的切换。

风险：前端检查负责清洗和差异预览，完整配置类型/范围验证仍在应用时由核心执行；非法字段值可能在应用时才报错。前端筛选依赖已发货 schema，测试对比了核心结果，后续 schema 变更应继续运行这些回归。

## Bug 3：探测进程无法停止导致 MuMu 启动取消

根因：直接销毁 PRoot 进程不能可靠清理 guest 后代；清理超时又被当成必须取消整个主启动的条件。

改动：

- `android/app/src/main/java/io/hdsinterlude/android/ProotLaunch.kt`：增加独立组启动参数、组标记解析、仅对合法组 ID 发出负 PID 信号的辅助函数，以及 `ProbeResult.degraded`。无法清理时继续当前追踪模式，避免再留下第二个探测进程；真正 `stage=spawn` 失败仍立即拒绝。
- `android/app/src/main/java/io/hdsinterlude/android/HdsRuntime.kt`：探测用 `/system/bin/setsid` + shell 建立独立进程组，组内 shell 先输出组长 PID，再 exec PRoot。销毁先 `Os.kill(-pgid, SIGKILL)`，随后保留原 destroy/destroyForcibly 链；捕获 ErrnoException，ESRCH 正常忽略，其他错误写警告。没有 setsid 或没有可信组标记时只做直接清理并明确警告，不发送不安全的组信号。输出仍限制为 4096 字符。
- 无法停止时返回空 exitCode、`degraded=true` 并写明原因；启动日志和 launch 诊断区分降级与通过，继续由主启动的 90 秒超时、健康检查和原 stopNow 处理。不会对活进程调用 exitValue，也避免主动关闭仍被阻塞读取的流。
- `android/app/src/test/java/io/hdsinterlude/android/ProotLaunchTest.kt`：覆盖负组 PID 信号、无效 PID 防护、参数保留、真实 Unix setsid 组长标记、降级继续与 spawn 失败拒绝；既有 ENOSYS 模式重试保持通过。

API 调整依据：当前 compileSdk 35 的公开 API 不支持任务书建议的 Os.setpgid / Process.pid 用法，因此采用 setsid。参考 [Android Os 公共接口](https://developer.android.com/reference/android/system/Os)、[Process.pid API](https://developer.android.com/reference/java/lang/Process#pid())、[AOSP setsid 实现](https://android.googlesource.com/platform/external/toybox/+/refs/heads/main/toys/other/setsid.c)。

**最大风险**：未在 MuMu/真实 Android 上验证 setsid、转译 guest 和杀组行为。极端情况下探测仍可能残留；现在会明确降级并尝试主启动，主启动也可能按自身超时失败。这是有诊断信息的继续尝试，不代表模拟器兼容性已经实测通过。

## 验证结果

- `npm run test`：**115/115 通过**，失败/跳过均为 0（原 110 项 + 新增 5 项）。日志：`/tmp/hds-import-fixes-npm-test.log`。
- `npx tsc --noEmit`：退出 0，无输出。日志：`/tmp/hds-import-fixes-tsc.log`。
- `node tests/import-code-ui.mjs`：真实 App UI 回归通过。日志：`/tmp/hds-import-fixes-ui-final.log`。
- `ProotLaunchTest`：**7/7 通过**，使用临时 JRE/Kotlin 编译器与 JUnit 直接运行纯 JVM 单测，包含真实 Unix 进程组验证。日志：`/tmp/hds-import-fixes-kotlin-passed.log`。未运行 Android Gradle 构建或完整 Android 测试套件。
- `git diff --check`：通过。

临时测试工具仅放在 `/tmp/hds-import-fixes-tools`；没有新增项目依赖。`npm run test` 自带的 build:host 及测试用内存打包已执行，没有执行产品 build、android:sync 或 APK 打包。
