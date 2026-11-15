# 任务书：修复三个导入/启动 bug（Codex 委派）

仓库：/root/hermes-workspace/hds-android（main，HEAD 应为 e7d772c 之后）
验收基线：npm run test 全绿（当前 110 项）+ npx tsc --noEmit 干净。改动最小化，不要顺手重构。

## Bug 1：导出的 YAML 无法导回（round-trip 断裂）

**根因（已复现）**：导出与导入门槛不对称。
- `apps/mobile-ui/character-export.ts` 的 `buildPresetPayload` 导出时只要求角色名存在，characterProfile 为空照样导出；
- `packages/persona-format/index.ts:31` 的 `parsePersona` 导入时要求 characterName 和 characterProfile **都非空**，否则抛"HDS 人设需要 characterName 和 characterProfile；纯状态机文件暂不能单独导入"。

复现（已验证）：
```ts
const setting = { characterName: '星禾', character: { name: '星禾', profile: '' }, world: '小镇' }
createCharacterExport('yaml', setting, { sections: {} })  // 导出成功
parsePersona(...)  // 导回抛错 ROUNDTRIP-FAIL
```

**修复方向**：
1. 导出端：`buildPresetPayload` 对 characterProfile 做候选链兜底（character.profile / setting.description / setting.personality 等已有候选就取；全部为空时兜底写一句占位，如"（此角色未填写人设档案）"），保证 name 存在则 round-trip 必成功；
2. 导入端：`parsePersona` 放宽为——characterName 存在即可导入，characterProfile 缺失时兜底占位；**仅当 characterName 和 characterProfile 都缺失时**才保留"纯状态机文件不能导入"的拒绝（这条防线语义是"文件里没有角色信息"，必须保留）；
3. 加 round-trip 回归测试：空 profile 角色导出 YAML/JSON 后 parsePersona 必须成功。

## Bug 2：导入码"检查"被过度门禁

**现象**：故事"正在休息中"（runtime state 非 healthy）时，"用导入码同步"模态里检查按钮禁用，提示"请先选择角色并唤醒故事，再检查导入码"。

**根因**：`apps/mobile-ui/main.tsx:418` 的门禁把 `runtimeRef.current?.state !== 'healthy'` 对**检查（预览）**也生效了。但技术上预览只需要 typ0 网络拉取 + 当前生活配置 diff（`inspectPreset` → `fetchShare` + `mobilePreset`），不依赖故事运行时；只有**应用**（写入 storyPatch 到当前故事）才需要故事唤醒。

**修复方向**：
- 检查（apply=false）：只要 `selected` 存在即可（`!healthy` 不再拦检查）；
- 应用（apply=true）：保持必须 healthy + selected；
- 615 行的提示文案改为区分两种情况：未选角色→提示选角色；已选角色但故事休息→提示"可以先检查预览，应用前需要唤醒故事"；
- 注意 428-430 行 apply 时的 storyRevision/current 校验逻辑必须原样保留——预览时记录的 revision 可能在唤醒后才取到，确认预览→唤醒→应用的流程校验不会误报（如果预览时 storyRevision 取的是休息态的值，唤醒后 revision 变化会触发"当前故事已变化请重新检查"，这个行为可以接受，但要把 441 行预览缓存里 storyRevision 的取值时机核对清楚，写进测试）。

## Bug 3：MuMu 模拟器（x86 转译环境）启动失败

**现象**：启动报"HDS 启动失败:本机探测进程无法停止，已取消继续启动"。

**根因**：`android/app/src/main/java/io/hdsinterlude/android/HdsRuntime.kt:381` 的 `probeGuest`：探测进程 `destroy()` + `destroyForcibly()` 后 2 秒内没死就直接放弃启动。问题两层：
1. Java `destroyForcibly` 只杀直接子进程，proot 的 guest 子进程树杀不到。x86 模拟器（MuMu 用二进制转译跑 arm64 guest）下子进程行为异常，卡死概率高；
2. 探测无法停止就 fail-fast 太激进——探测的本意是"提前发现环境问题"，杀不死说明环境怪但不代表主启动必然失败。

**修复方向**（Kotlin 侧）：
1. 杀进程组兜底：探测进程用独立进程组 spawn（`ProcessBuilder` 无直接 API，可用 `Os.setpgid(child.pid, child.pid)`；注意这是 Android API 21+ 可用的 `android.system.Os`），销毁时先 `Os.kill(-pid, SIGKILL)` 杀整个组，再走原 destroy 链；杀组失败要 catch ErrnoException（进程已死是 ESRCH，正常）；
2. 探测无法停止时不再直接取消启动：降级为警告——把"无法停止"写进探测输出/诊断信息，返回 ProbeResult 时带上 degraded 标记，让主启动继续走（主启动链有自己的超时和 stopNow 处理）。保留真正的 spawn 失败（HDS_GUEST_PROBE_FAILED stage=spawn）仍然 fail-fast；
3. `ProotLaunchTest.kt` 补一个单测：模拟/断言 kill 进程组的逻辑（遵循现有测试风格）。

注意：无法在本地真机验证 MuMu 行为，以逻辑正确性 + 单测为准，改动要保守——凡拿不准的行为变化用 degraded 警告而不是静默跳过。

## 交付物
1. 上述修复代码 + 测试；
2. `result-import-fixes.md`：每个 bug 的根因、改动文件清单、测试结果（npm run test 数字）、你认为风险最大的点；
3. 不改版本号、不构建、不 commit（我来验收提交）。
