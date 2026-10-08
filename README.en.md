# ZShell

**English** | **[中文](./README.md)**

![android](https://github.com/Amwidtf/zshell/actions/workflows/android.yml/badge.svg)

An **unofficial third-party mobile client** for ZCode's "Web Remote Control" · Current version `v0.0.1-alpha.3` (Android)

ZShell puts the ZCode desktop remote-control console on your phone: pair by scanning the QR code (or pasting the link / recognizing a QR screenshot from your gallery), keep the pairing credentials in encrypted storage, and use the official console inside a hardened WebView — plus what the official web page can't do: **encrypted local credential storage, app lock (fingerprint / face / pattern / password), multi-machine management, and mobile experience patches**.

> ⚠️ **Disclaimer**: This project is not affiliated with, endorsed by, or authorized by ZCode / Zhipu AI in any way. You need your own ZCode desktop client with "Web Remote Control" enabled. See the [disclaimer](./docs/DISCLAIMER.md) (Chinese).

## Features

- **Three pairing entries**: camera scan / paste pairing URL / recognize a QR screenshot from the gallery (pure JS decoding, zero extra native deps)
- **Machine management**: custom naming, favorites pinned on top, manual ordering; re-pairing the same desktop merges records and rotates credentials
- **Encrypted storage**: pairing credentials (`sid` + `hash`) stored AES-encrypted, keys held by Android Keystore, never in plaintext
- **App lock**: fingerprint / face (system biometrics with dynamic availability detection), pattern, or password; PBKDF2 local verification; auto-relock on backgrounding
- **Behavior patch layer**: document-start injection with self-retiring probes — e.g. fixes the "Enter submits instead of newline" issue on some mobile browsers
- **Compliance built-in**: first-launch consent gate for the user agreement & privacy policy; in-app legal document center; zero data collection
- **UX details**: system back prefers in-page history; edge-to-edge adaptation; keyboard lifts input fields

## Architecture

```
zcode-shell/                     # npm workspaces monorepo
├── packages/
│   ├── core-shell/              # framework-free pure-TS core (strict TS subset,
│   │                            #   ArkTS-compatible): pairing / endpoints / state
│   │                            #   machine / app-lock / SHA-256+HMAC+PBKDF2+Base64
│   └── patch-bundle/            # behavior patches injected into the official page
└── apps/mobile/                 # React Native 0.82 app (new architecture, Android first)
```

Design principle: **single-source logic** — `core-shell` has zero framework dependencies and platform abilities are injected through ports, so the UI shell can change (RN today, ArkTS tomorrow) while logic stays shared. See [architecture doc](./docs/architecture.md) (Chinese).

## Getting Started

Requirements: Node ≥ 22 + npm ≥ 12, JDK 17–21, Android SDK (API 36). **Read the [build guide](./docs/build.md) first for known pitfalls** (monorepo paths / npm patch / Windows 260-char limit / CN mirrors).

```bash
npm install                          # install everything (incl. npm patch)
npx vitest run                       # core-shell unit tests
cd apps/mobile/android
./gradlew assembleRelease            # produces a standalone release APK
```

Published builds: [Releases](https://github.com/Amwidtf/zshell/releases) (built automatically on version tags).

## Platform Roadmap

| Platform | Status | Notes |
|---|---|---|
| Android | ✅ v0.0.1-alpha | RN 0.82 + new architecture (Fabric) |
| HarmonyOS NEXT | 📋 planned | Same RN project + RNOH (Huawei-maintained) |
| iOS | 📋 planned | iOS scaffold included; needs macOS / cloud Mac |

## Security & Privacy

- **Zero collection**: no backend, no telemetry, no third-party reporting — all data stays on-device in encrypted storage
- Pairing credentials are **long-lived secrets** (equivalent to a password); rotate them on the desktop periodically
- **Trust boundary**: remote sessions travel through the official relay; ZShell adds no extra exposure but cannot change relay-side visibility — evaluate for yourself when working on sensitive codebases

Full documents (Chinese): [privacy policy](./docs/PRIVACY.md), [security notes](./docs/SECURITY.md), [disclaimer](./docs/DISCLAIMER.md).

## Documentation

- [CHANGELOG.md](./CHANGELOG.md) — release history (source of release notes)
- [AGENTS.md](./AGENTS.md) — guide for AI agents & contributors (Chinese)
- [docs/](./docs) — architecture, build guide, release process, compliance (Chinese)

## Version

`v0.0.1-alpha.3` — alpha stage; APIs and storage formats may change. See [CHANGELOG.md](./CHANGELOG.md).

## License

[MIT](./LICENSE) © 2026 ZShell Contributors

Built on React Native and other open-source software (license list in the in-app "Open Source Licenses"); all third-party components serve local functionality only and do not affect the zero-collection commitment.
