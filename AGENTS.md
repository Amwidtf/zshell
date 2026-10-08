# AGENTS.md — ZCode Workspace Agent Guide

面向 AI 编码代理与新贡献者的仓库工作指南。先读 [README.md](./README.md) 了解项目定位。

## 仓库布局

- `packages/core-shell` — **零框架依赖**的纯 TS 核心逻辑（配对解析 / endpoint 选择 / 状态机 / 机器注册表 / 应用锁 / 加密原语）。配 vitest 测试。
- `packages/patch-bundle` — 注入官方页面的行为补丁 JS（导出为字符串）。
- `apps/mobile` — React Native 0.82 应用（Android 先行，规划 RNOH 鸿蒙 / iOS）。
- `patches/` — npm `patchedDependencies` 补丁（勿删）。
- `docs/` — 项目文档（架构 / 构建 / 发版 / 合规 + 法律文本）。
- `CHANGELOG.md` — 更新日志，Release 说明的数据源。
- `.tmp/` — **私有调研区，永不提交**（已被 .gitignore 排除）。

## 常用命令

```bash
npm install                                  # 根目录安装（workspaces + npm patch 生效）
npx vitest run                               # core-shell 单元测试（当前 57 用例）
cd apps/mobile/android && ./gradlew assembleDebug   # Android 调试包
cd apps/mobile && npm start                  # Metro（开发时 JS 热载）
```

MuMu 模拟器调试（本机约定端口 16512）：

```bash
adb connect 127.0.0.1:16512
adb -s 127.0.0.1:16512 reverse tcp:8081 tcp:8081
adb -s 127.0.0.1:16512 install -r <apk路径>
adb -s 127.0.0.1:16512 shell am start -n com.zshell/.MainActivity
```

## 硬约束（违反会导致构建损坏或合规风险）

1. **core-shell 保持零依赖、严格 TS 子集**：不 import react-native、不使用 `any`、类型显式。这是未来鸿蒙 ArkTS 原生壳直用核心的前提。
2. **patch-bundle 自防护**：每个补丁必须 try/catch 全包裹 + 重入标志（`__zshellPatchApplied`）+ 环境探针（环境已正常则自动停用）。只允许针对**精确字符串**打补丁，禁止大范围覆盖。
3. **monorepo 路径**：依赖提升到根 `node_modules`。`apps/mobile/android/settings.gradle`（gradle-plugin 提升路径解析）与 `app/build.gradle` 的 `react{}` 三路径（`../../../../node_modules/...`，相对 android/app 解析）勿改回模板默认。
4. **npm patch**：`patches/rn-gradle-plugin-drop-foojay.patch` 修复 RN 0.82.1 自带 foojay-resolver 0.5.0 与 Gradle 9 的不兼容。重装依赖后用 `grep foojay node_modules/@react-native/gradle-plugin/settings.gradle.kts` 验证补丁生效（应无结果）。
5. **新增原生依赖前评估两件事**：① Windows 260 字符路径限制（codegen 源路径长的库会在 `.cxx` 构建报 `Filename longer than 260 characters`，先例：react-native-safe-area-context 已因此移除）；② RNOH 适配表覆盖度（鸿蒙路线的前提）。
6. **公开仓库合规**：代码/文档/提交信息中不得出现内部调研路径（`.tmp/...`）、反编译符号名、逆向过程叙述。协议行为用"observed"等中性描述。
7. **凭据红线**：任何日志、剪贴板、遥测不得接触 `credentials.hash`；存储只经 `SecureKvStore` 端口。
8. **平台能力只经端口**：生物识别、安全存储等通过 `core-shell/ports.ts` 接口 + 应用侧适配器注入，便于三端替换实现。

## 构建环境备忘（本机）

- 阿里云镜像 init 脚本：`~/.gradle/init.d/zshell-mirrors.gradle`（Maven Central 国内超时的解法）
- JDK 17/21 注册：`~/.gradle/gradle.properties` 的 `org.gradle.java.installations.paths`
- Gradle 分发已用腾讯镜像（`gradle-wrapper.properties`）
- Android SDK：`D:\DevelopUtils\Android\SDK`（`android/local.properties`，勿提交）

## 代码风格

- 主题 token 统一取自 `apps/mobile/src/theme.ts`，禁止散落硬编码色值
- 屏幕组件单文件置于 `src/screens/`；简单导航用 App.tsx 内栈状态，引入 react-navigation 前先讨论
- 测试随代码同提交；`packages/*/test/*.test.ts` 由根 vitest 收集
- 提交信息：中文、祈使句概述 + 空行 + 详情（参照 `git log`）

## 发布检查单（每次发版）

- [ ] `npx vitest run` 全绿
- [ ] `./gradlew assembleDebug`（以及需要的 release 变体）成功
- [ ] 版本号三处同步：根 `package.json`、`apps/mobile/package.json`、`android/app/build.gradle`（versionName/versionCode）、`src/version.ts`
- [ ] 免责声明 / 隐私政策内容仍与实际行为一致（docs/PRIVACY.md 中的权限与第三方清单），
      且与 `apps/mobile/src/legal.ts`（应用内展示版）同步；实质性变更时提升
      `LEGAL_DOC_VERSION` 触发重新征求同意
- [ ] CHANGELOG.md 已添加对应版本段落（CI 发版说明自动取自该段落）
- [ ] MuMu 或真机冒烟：配对 → 控制台 → 收藏 → 锁屏
