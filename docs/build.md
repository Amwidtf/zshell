# 构建与开发指南

## 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node | ≥ 22（推荐 24） | npm 12 需要 Node ≥ 22（`engines` 已声明） |
| npm | ≥ 12 | `patchedDependencies` 需要（Node 20 自带的 npm 10 不支持） |
| JDK | 17–21 | gradle-plugin 子工程 toolchain 17；本机在 `~/.gradle/gradle.properties` 注册 |
| Android SDK | API 36 + Build-Tools 36.0.0 | NDK 27.1（缺失时自动下载） |

## 常用命令

```bash
npm install                                  # 根目录：全部 workspace + npm patch
npx vitest run                               # core-shell 单元测试
cd apps/mobile/android && ./gradlew assembleDebug     # 调试包
cd apps/mobile/android && ./gradlew assembleRelease   # 发布包（JS 已内置，可独立运行）
cd apps/mobile && npm start                  # Metro（仅调试包需要）
```

模拟器调试（本机 MuMu 约定端口 16512）：

```bash
adb connect 127.0.0.1:16512
adb -s 127.0.0.1:16512 reverse tcp:8081 tcp:8081     # 调试包需要
adb -s 127.0.0.1:16512 install -r <apk>
adb -s 127.0.0.1:16512 shell am start -n com.zshell/.MainActivity
```

## 已知坑与解法（务必先读）

### monorepo 提升路径
依赖全部提升到根 `node_modules`，RN 模板的 `../node_modules` 相对路径假设失效。
相关配置**不要改回模板默认**：
- `android/settings.gradle`：gradle-plugin 提升路径解析
- `android/app/build.gradle` 的 `react{}`：reactNativeDir / codegenDir / cliFile
  （相对 `android/app` 解析，四级 `../` 到仓库根）与 **hermesc 全平台显式路径**
  （插件自动解析在提升布局下于 Windows 与 Linux 均失效）

### npm 补丁（foojay）
RN 0.82.1 自带 foojay-resolver 0.5.0 与 Gradle 9 不兼容（`IBM_SEMERU` 已移除），
通过根 `package.json` 的 `patchedDependencies` 移除。重装依赖后自检：

```bash
grep foojay node_modules/@react-native/gradle-plugin/settings.gradle.kts   # 应无结果
```
（CI 中此自检失败会直接终止构建。）

### Windows 260 字符路径限制
`.cxx` 构建对象路径在深目录 + 重 codegen 依赖下会超限
（`Filename longer than 260 characters`，先例：react-native-safe-area-context）。
**新增原生依赖前评估其 codegen 产物路径长度**；`core.longpaths=true` 只救 git，救不了 ninja。

### 国内网络
- Maven 镜像：`~/.gradle/init.d/zshell-mirrors.gradle`（阿里云优先、官方兜底；
  机器相关，不进仓库——新机器按 AGENTS.md 重建）
- Gradle 分发：`gradle-wrapper.properties` 已用腾讯镜像
- npm：仓库 lock 文件统一使用官方注册表地址（CI 与贡献者兼容）；
  本机可用 npmmirror，但**不要**把镜像地址提交进 lock

## CI（GitHub Actions）

`.github/workflows/android.yml`：push main → 测试 + 构建 + 产物；push `v*` 标签 →
再创建带 APK 的 Release（说明取自 CHANGELOG 对应版本段落）。公开仓库 Actions
免费不限时长。

## 代码规范速查

- 主题 token 一律取自 `apps/mobile/src/theme.ts`
- 屏幕组件单文件置于 `src/screens/`；导航用 App.tsx 栈状态
- core-shell 新增逻辑必须带 vitest 用例（含向量/边界）
- 法律文本双源：仓库 `docs/*.md` 与 `src/legal.ts` 同步（见发版检查单）
