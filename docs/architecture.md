# 架构设计

> 本文描述 ZShell 的代码组织与核心设计决策。面向贡献者与 AI 代理，配合根目录 [AGENTS.md](../AGENTS.md) 使用。

## 总体结构

```
zcode-shell/                     # npm workspaces monorepo
├── packages/
│   ├── core-shell/              # 零框架依赖的纯 TS 核心
│   └── patch-bundle/            # 注入官方页面的行为补丁
├── apps/
│   └── mobile/                  # React Native 应用（Android 先行）
└── patches/                     # npm patchedDependencies 补丁
```

## 核心设计决策

### 1. core-shell 零框架依赖 + 严格 TS 子集

全部业务逻辑（配对 URL 解析、endpoint 双线选择、状态机、机器注册表、应用锁模型、
SHA-256/HMAC/PBKDF2/Base64）放在 `packages/core-shell`，**不 import 任何框架**，
并以严格 TS 子集编写（无 `any`、类型显式）。目的：ArkTS 是 TS 的严格化子集，
未来鸿蒙原生壳可直接复用同一份核心——**逻辑单源，多端生效**。

配套约束：平台能力一律通过端口接口注入（`src/ports.ts`）：

| 端口 | Android/iOS 实现（当前） | 鸿蒙实现（未来） |
|---|---|---|
| `SecureKvStore` | MMKV withEncryption（Keystore 托管密钥） | Asset Store Kit / preferences 加密 |
| `BiometricAuth` | react-native-biometrics | HarmonyOS UserAuth |

### 2. 壳路线：官方页面是产品主体

ZShell 的 WebView 加载官方 `/remote/v4` 控制台——中继连接、配对握手、会话桥全部由
官方页面自身完成。壳的增值全部在页面之外：加密凭据管理、多机管理、应用锁、
本地通知（规划）、移动端缺陷补丁。

### 3. patch-bundle 自防护纪律

注入官方页面的补丁（`injectedJavaScriptBeforeContentLoaded`，document-start 时机）
必须满足三条纪律，否则随官方改版碎裂：

1. **全包裹 try/catch + 重入标志**（`__zshellPatchApplied`）——补丁永不弄崩页面；
2. **环境探针自退役**——环境本身正常时补丁自动失效（如 matchMedia 已正确上报）；
3. **只针对精确字符串**——影响面收敛到单一检测点，不做大范围覆盖。

补丁以 JS 字符串形式导出（`packages/patch-bundle`），与宿主框架无关。

### 4. 自管理导航栈 + 系统返回优先级

App.tsx 用栈状态自管理导航（未引入 react-navigation，保持依赖精简）。系统返回键
（BackHandler）的优先级：**控制台页 → 网页自身历史（WebView goBack）→ 应用栈
逐级返回 → 根页面默认退出**。

### 5. 边到边适配策略

容器（卓易通）与 Android 15+ 会强制 edge-to-edge，且 `adjustResize` 随之失效。
统一解法在 MainActivity：把系统栏 + 刘海 + IME 的 inset 全部转为根视图内边距
（普通设备 insets 已被 decor 消费，天然无副作用），并把窗口背景设为应用深色，
避免让出的区域露出默认白底。

## 多平台路线

| 平台 | 状态 | 路径 |
|---|---|---|
| Android | ✅ 可用 | 当前 RN 0.82（新架构 Fabric） |
| HarmonyOS NEXT | 📋 规划 | 同一 RN 工程 + RNOH；若受阻则退「三端原生壳 + core-shell 直用」 |
| iOS | 📋 规划 | 工程含 iOS 脚手架；构建需 macOS / 云 Mac |

三端调研结论详见团队内部资料；对外决策记录：单代码库优先（RN+RNOH），
核心资产（core-shell / patch-bundle）无条件框架无关。
