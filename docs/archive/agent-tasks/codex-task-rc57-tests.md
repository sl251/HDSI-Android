# 任务书：HDS-Android rc57 测试套件修复（Codex 委派）

## 背景
仓库：/root/hermes-workspace/hds-android（分支 main）
刚完成 vendor 重导入 HDS-Interlude 1.0.1-rc57 并移植移动端补丁（commit 已提交）。
`npm run build:host` ✅、`npx tsc --noEmit` ✅ 全绿。

## 你的目标
1. 运行 `npm run test`（= build:host + node --import tsx --test tests/*.test.ts）
2. 修复所有因 rc57 上游变更导致的测试漂移：
   - **只修测试文件（tests/）或补丁文件（scripts/mobile-hds-rc57.patch）**，不改 runtime/、apps/、packages/ 下被测代码——除非失败明确源于 vendor 源码里的移动端补丁缺行（此时改 patch 文件后必须重跑 `node scripts/patch-mobile-hds.mjs` + `npm run build:host` 验证重放成功）
   - tests/*.test.ts 是从 rc56 时代写的，断言的数值/文案若与 rc57 新行为冲突，以 rc57 上游新行为为准更新断言
   - scripts/mobile-hds-rc56-tests.patch 是对 upstream test 目录的补丁，若 rc57 的 upstream 测试变了需要同样重锚——先诊断漂移（参考 scripts/diagnose-patch-drift.mjs 的思路），把 tests patch 存为 scripts/mobile-hds-rc57-tests.patch 并改 patch-mobile-hds.mjs 读取它；rc56 版本文件保留
3. 运行 `npm run test:ui`（UI 冒烟脚本）同样处理漂移

## 纪律
- 改动以最小 diff 为原则，不顺手重构
- 每完成一个逻辑组跑一次 build:host 快速回归
- **不要 commit**，留工作树改动给主代理检查
- 磁盘紧张（约 5G），不要 npm install 新依赖
- 输出：把测试跑通后的完整结果（通过/失败计数、修改文件清单、每个失败的根因一句话）写到 /root/hermes-workspace/hds-android/result-rc57-tests.txt

## 验收
- `npm run test` 全部通过（或明确列出无法通过的真实上游缺陷并给出证据）
- `npm run test:ui` 通过
- result 文件存在且内容完整
