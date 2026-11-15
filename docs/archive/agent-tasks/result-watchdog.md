# QQ SelfOffline 看门狗结果

基线：`main` / `37c092d`。改动保留工作树，未安装依赖、未提交。

## 实现要点

- 在现有 QQRuntime 轮询、控制队列、generation 和停止逻辑上扩展。原有入口是 `QQLogin/CheckLoginStatus.isOffline`；现在显式离线、已确认登录后的登录丢失、SelfOffline / KickedOffLine 日志、QQ/Xvfb 异常退出或启动错误，以及持续状态接口故障，统一进入 `handleOffline(reason, source)`。
- 状态迁移：`idle → cleaning → backoff → restarting → quick-login → idle`；无可用缓存、快速登录拒绝/错误/30 秒超时则进入 `waiting-qr`。重启连续失败达到 5 次，或清理失败，则进入 `gave-up`，提示人工介入。
- QQ/Electron 和 Xvfb 均以独立进程组启动，保存本 runtime 派生的 ChildProcess/PID/PGID，即使组长退出也保留记录。清理向整个组发送 SIGTERM，最多等待 1.5 秒宽限，再发送 SIGKILL；等待主进程退出并检查 `/proc` 中本组可执行成员已消失后才允许重启。已退出的僵尸不再持有文件锁。不会按进程名杀进程，也不向承载 HDS 的外层 PRoot 进程组发送信号。
- 消息适配器关闭与系统进程清理同时推进；适配器关闭限时 2 秒，防止关闭卡住导致进程无法回收。清理或适配器关闭失败时停止自动恢复，不创建第二套进程/消息通道。
- 重启后由现有状态轮询确认管理 API 就绪，再从 UI 同源的 `QQLogin/GetQuickLoginListNew` 查询 `isQuickLogin` 账号，通过 `SetQuickLogin` 自动登录。优先且仅选择刚离线的账号；本 runtime 尚无账号身份时才选首个可用缓存，避免意外切换账号。失败调用 `RefreshQRcode` 并继续生成、展示扫码二维码。
- 两次自动启动尝试至少间隔 30 秒；最多 5 次。短暂上线不清零，连续确认登录 60 秒后才重置失败计数。首次加载保留原有 120 秒宽限；正常运行时连续 3 次状态接口失败才触发恢复。
- 复用 `qq.status` 的 `phase/progress/error` 通道：清理、退避、重启、快速登录均显示“自动恢复中”，放弃时明确提示需人工介入。恢复中沿用现有 UI 已识别的 `starting` 阶段；扫码回退使用 `qr`，放弃使用 `failed`。新增可选的 `recovery` 结构暴露状态、次数、下次重启时间与原因。`runtime/host.ts` 已将 `qq.*` 原样委派给 QQRuntime，App 每 2 秒读取并展示 progress/error，因此无需修改 host 或 UI。
- 手动停止/关闭立即取消定时恢复并使排队恢复、旧轮询、旧 HTTP 认证响应失效，防止停止后复活或旧凭据覆盖新凭据。恢复中的手动重登/刷新请求会得到可见的等待提示。

## 文件

- `runtime/qq.ts`：统一离线入口、进程组清理、恢复状态机、缓存快速登录与扫码回退、退避/熔断、状态输出和异步失效保护。
- `packages/contracts/index.ts`：新增 QQRecovery 类型和向后兼容的可选 QQStatus.recovery。
- `tests/qq-watchdog.test.ts`：10 项专项测试，运行构建后的实际 QQRuntime；只替代外部 QQ 启动/API 边界，并另外启动真实 Linux 子进程验证信号清理。
- `result-watchdog.md`：本结果与证据。

## 验证

最终源码的 `npm run build:host && npx tsc --noEmit` 已通过，退出码 0；TypeScript 成功时无输出。关键构建输出：

```text
Compiled actual HDS rc57 and mobile host from sources
```

专项命令：`node --import tsx --test tests/qq-watchdog.test.ts`，退出码 0。完整日志：`/tmp/hds-watchdog-unit-final.log`。

```text
✔ watchdog: offline → cleanup → 30s backoff → restart → cached login → stable online
✔ watchdog: repeated crashes retain backoff and give up after five launches, cleaning the last process
✔ watchdog: quick-login rejection, error status, timeout and absent same-account cache return to a real QR
✔ watchdog: split SelfOffline logs, status login loss, process error and exit share one cleanup entry
✔ watchdog: stop cancels backoff and close invalidates an in-flight status response
✔ watchdog: startup grace, repeated status timeouts and cleanup failures cannot create a crash loop
✔ watchdog: late HTTP responses cannot overwrite a restarted process credential
✔ watchdog: a stuck adapter still cleans processes and stops recovery within a bound
✔ process cleanup kills a TERM-resistant descendant after its launcher exits, preserving unrelated processes
✔ process cleanup is bounded for failed spawns and escalates an uncooperative live launcher
ℹ tests 10
ℹ pass 10
ℹ fail 0
```

全量最终回归：`npm run test`，退出码 0。原有 94 项全部通过，新增 10 项，共 104/104；无跳过、取消或失败。完整日志：`/tmp/hds-watchdog-tests-final.log`。

```text
✔ real OneBot adapter and HDS enforce whitelist, persist inbox and send literal text once (17267.725195ms)
ℹ tests 104
ℹ suites 0
ℹ pass 104
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 199042.297785
```

`git diff --check` 通过。最终分支仍为 `main`，HEAD 仍为 `37c092d`；upstream/vendor、android/ 无版本化差异。构建脚本按仓库既有流程重新生成的产物/配置未带来这些目录的 Git 差异。

验证边界：Linux 真实进程组和本地 API/OneBot fixture；未进行 Android 真机或真实 QQ 账号扫码测试。upstream/vendor 和 android 原生层无改动。
