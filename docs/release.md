# 发版流程

## 版本规范

- 语义化版本，Alpha 阶段：`0.0.1-alpha.N`
- 版本号**四处同步**（发版检查单第 3 条）：
  1. 根 `package.json`
  2. `apps/mobile/package.json`
  3. `apps/mobile/android/app/build.gradle`（versionName + versionCode 递增）
  4. `apps/mobile/src/version.ts`（关于页展示）

## 发布步骤

```bash
# 1. 完成发版检查单（AGENTS.md）：测试全绿、构建成功、法律文本同步
npx vitest run
cd apps/mobile/android && ./gradlew assembleRelease

# 2. 更新 CHANGELOG.md：新增「## [版本号] - 日期」段落（新增/变更/修复分类）

# 3. 提交并打标签
git add -A && git commit -m "<版本号>：<摘要>"
git tag v<版本号>
git push origin main --tags
```

## CI 自动发版

push `v*` 标签后 Actions 自动：测试 → 构建 release APK → **从 CHANGELOG.md 提取
该版本段落作为 Release 说明** → 发布 GitHub Release（附 APK）。

手机下载入口：仓库 Releases 页（公开仓库免登录直链下载）。

## Release 说明规范

- 标题 = 标签名（如 `v0.0.1-alpha.3`）
- 正文 = CHANGELOG 对应版本段落（CI 自动提取，不手写）
- 面向用户的表述：写「解决了什么问题」而非「改了哪个文件」
- 破坏性变更（存储格式、配对方式变化）必须置顶加粗说明

## 回滚

- 代码回滚：revert 提交后按正常流程发新版本（不发递减版本号）
- 仅需撤 Release：GitHub 网页删除 Release 与标签（APK 产物随之失效）
