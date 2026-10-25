# 运行时类型检查

`npm run typecheck` 检查 UI、共享契约与 `runtime/`。`npm run typecheck:runtime` 可单独检查运行时，构建会执行两者。运行时配置在 `tsconfig.runtime.json`，不含生成产物。

引擎源码通过直接导入参与编译，因此 TypeScript 同时检查 `upstream/`。引入检查时上游有 133 条已有诊断，主要涉及 Koishi/Satori 接口、Schema 默认值与可选字段。`scripts/upstream-typecheck-baseline.json` 记录每一条的文件、位置、错误码与内容。检查脚本要求集合完全一致，既不忽略新增错误，也不默默保留失效记录；应用自己的错误不能加入这个基线。

升级上游后，先审查类型诊断并修复应用侧问题，再运行：

```sh
node scripts/typecheck-runtime.mjs --update-upstream-baseline
npm run typecheck
```

更新只能在本地且应用运行时零错误时进行；CI 拒绝生成基线。提交时必须一起审查基线差异，解释新增问题或已修复问题。不要用更新基线来替代修复应用回归。

`host.ts` 在配置解析处隔离了上游 Schema 的输入类型问题：真实 Schema 负责校验和填充默认值，局部声明允许输入尚未填全的配置。移动表结构和本机 Bot 则使用明确的 Koishi 类型。运行时行为仍须由真实宿主、数据库及平台测试验证。
