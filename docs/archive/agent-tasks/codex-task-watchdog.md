# 任务书：QQ SelfOffline 看门狗（Codex 委派）

## 背景与症状
仓库：/root/hermes-workspace/hds-android（分支 main，commit 37c092d，rc57 基线测试 94/94 全绿）

移动端 App 在 PRoot (Termux 环境) 内跑 NapCat。已知问题（上游 NapCatQQ#2071）：
- NapCat 会静默离线（`[SelfOffline] 账号状态变更为离线（未收到 KickedOffLine 通知）`），此时 NapCat/Electron 子进程并未退出，成为假活进程
- 用户再点重登时超时报 `The operation was aborted due to timeout.`，且 NapCat 报 `当前账号(2705880671)已登录,无法重复登录`——旧进程残留把重登锁死
- 现在只能手动"停止 QQ"再刷新二维码，体验差

策略：不阻止掉线（做不到），做**看门狗自动恢复**。

## 任务
在 `runtime/qq.ts`（QQRuntime）实现看门狗，可能需要 `runtime/host.ts` 配合：

1. **离线信号统一**：QQRuntime 已能收到 SelfOffline/离线状态变更（先读现有代码确认信号入口）。把所有离线路径汇聚到一个 `handleOffline(reason)` 状态机
2. **僵尸清理**：离线后重启前，先彻底回收本 runtime 派生的 NapCat/PRoot 进程树（进程组/pid 记录在 spawn 时保存；用 SIGTERM→短暂等待→SIGKILL），确保没有假活进程占用登录态
3. **自动快速重登**：清理完成后自动重启 NapCat；若有已登录过的账号缓存（读现有"已登录过的账号"数据来源），自动尝试该账号快速登录；失败则回到二维码界面等扫码
4. **重启退避**：最小重启间隔（建议 30s）+ 连续失败上限（建议 5 次，超出后停止自动重启、界面提示需人工介入），防止崩溃循环烧 CPU/流量
5. **UI 状态可见**：重启/清理过程中通过现有 dispatch/状态通道把"自动恢复中"状态给到 App 界面（读 runtime/host.ts 的状态广播方式，保持一致）

## 验收标准（必须全部满足）
- `npm run build:host && npx tsc --noEmit` 通过
- `npm run test` 94/94 全绿（新增看门狗状态机单测：离线→清理→重启→退避→放弃，至少覆盖这5个迁移）
- 不改 upstream/ vendor 树；runtime 改动保持移动补丁纪律（runtime/ 不属于 vendor，直接改）
- **不要 git commit**，改动留工作树
- 结果写入 `result-watchdog.md`：实现要点、改了哪些文件、测试证据（贴关键输出行）

## 纪律
- 只允许修改：`runtime/qq.ts`、`runtime/host.ts`、`tests/`、（如需）`packages/contracts/`
- 不装依赖、不 commit、不动 android/ 原生层（HdsService 保活框架已稳固，不要碰）
- 若发现现有代码已有部分看门狗逻辑，在其上扩展而不是重写
