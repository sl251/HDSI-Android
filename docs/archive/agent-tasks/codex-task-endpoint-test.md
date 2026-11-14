# 任务书：修复 rc57 端点修复引入的 1 个测试失败（Codex 委派）

## 背景
仓库：/root/hermes-workspace/hds-android（分支 main，最新 commit 37c092d）
上一轮修复了移动端出站投递缺陷（mobile-local 端点行劫持 QQ 群/主动消息），改动了 `scripts/mobile-hds-rc57.patch` 的两个 hunk：
1. reconcile 派生端点行时跳过 `story.platform === 'mobile-local'` 的 story-role 行（本地投递走 session 直连，从不查注册表）
2. `addStoryEndpoint` 注册 QQ 端点时，同时停用同 story 的存量 mobile-local story-role 行（清老库脏数据）

修复后 `npm run build:host` ✅、`npx tsc --noEmit` ✅，但 `npm run test` 从 94/94 变成 93/94，失败 1 个。

## 任务
1. 运行 `npm run test`，找出失败的那个用例（已知日志可用：`cat /tmp/test-fail-detect.txt`，若无则自己跑）
2. 判断失败性质：
   - **测试断言过时**（测试在断言"mobile-local 端点行存在/被派生"，与修复语义冲突）→ 更新测试断言以匹配新语义：注册表中 mobile-local story-role 行不应存在/不应被派生
   - **修复实现有 bug**（例如跳过逻辑误伤 onebot 行、disable 逻辑误停用端点）→ 修 `scripts/mobile-hds-rc57.patch` 中对应 hunk，保持其他 hunk 不动
3. 修复后完整验证：`npm run build:host && npx tsc --noEmit && npm run test` 必须全绿（94/94）
4. **不要 git commit**，把改动留在工作树
5. 把失败用例名、根因、修法、验证结果写入 `/root/hermes-workspace/hds-android/result-endpoint-fix-test.md`

## 纪律
- 只允许修改：`scripts/mobile-hds-rc57.patch`、`tests/` 下相关文件、`scripts/mobile-hds-rc56-tests.patch`（如需）
- 不装依赖、不动 runtime/apps/packages/upstream 源码（vendor 树由 patch 脚本生成）
- 测试全绿前不停止；若失败用例与端点修复无关（如 flaky），在结果文件说明证据
