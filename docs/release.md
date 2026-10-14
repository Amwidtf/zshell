# 发版流程

## 版本规范

- 语义化版本；预发布阶段用 `0.y.z-{alpha,beta,rc}.N`，正式版去掉后缀
- 版本号**一律用脚本同步，勿手改**（发版检查单第 3 条）：

  ```bash
  node scripts/bump-version.mjs pre               # 预发布计数 +1（0.1.0-beta.1 → 0.1.0-beta.2；无后缀则进入 -alpha.1）
  node scripts/bump-version.mjs 0.1.0             # 显式指定版本
  node scripts/bump-version.mjs 0.1.0-beta.2 11   # 显式指定版本与 versionCode
  ```

  脚本一次写入：根 `package.json`、`apps/mobile/package.json`、
  `android/app/build.gradle`（versionName + versionCode，缺省 +1）、`src/version.ts`，
  并顺带同步 `package-lock.json` 头部两处 workspace 版本。
  输入经 Semver 校验，versionCode 必须大于当前值，非法输入直接失败退出。

## 发布步骤

```bash
# 1. 完成发版检查单（AGENTS.md）：测试全绿、构建成功、法律文本同步
npx vitest run
cd apps/mobile/android && ./gradlew assembleRelease

# 2. 版本号：脚本统一同步（见上「版本规范」）
node scripts/bump-version.mjs pre

# 3. 更新 CHANGELOG.md：新增「## [版本号] - 日期」段落（新增/变更/修复分类）

# 4. 提交并打标签
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
