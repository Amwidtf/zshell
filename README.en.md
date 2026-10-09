# ZShell

**English** | **[中文](./README.md)**

![version](https://img.shields.io/badge/version-0.0.1--alpha.3-blue)
![platform](https://img.shields.io/badge/platform-Android-3DDC84?logo=android&logoColor=white)
![react native](https://img.shields.io/badge/React%20Native-0.82-61DAFB?logo=react)
![license](https://img.shields.io/badge/license-MIT-green)

An unofficial, open-source, zero-collection mobile client for ZCode's "Web Remote Control".

Three ways to pair: scan the QR with the camera, paste the link, or pick a QR screenshot from your gallery (PNG/JPEG decoding happens entirely on-device; no native dependency was added for it). Credentials go into encrypted storage, and the official console runs inside a hardened WebView. The parts the official web page can't give you — credential management, app lock, multi-machine favorites, mobile experience patches — the shell provides.

> ⚠️ Unofficial project. Not affiliated with or endorsed by ZCode / Zhipu AI. You need your own ZCode desktop client with "Web Remote Control" enabled. Details in the [disclaimer](./docs/DISCLAIMER.md) (Chinese).

## Features

- **Machine management**: custom names, favorites pinned on top, manual ordering; re-pairing the same desktop merges the record and rotates credentials
- **Encrypted storage**: pairing credentials (`sid` + `hash`) AES-encrypted at rest, keys held by Android Keystore, never in plaintext
- **App lock**: fingerprint / face, pattern, and password can all be enabled at once — any one unlocks, so a single failed method never locks you out; auto-relock on returning from background; biometric availability detected per device
- **Behavior patches**: document-start injection with self-retiring probes — e.g. fixes "Enter submits instead of newline" on some mobile browsers
- **Compliance**: first-launch consent gate for the user agreement & privacy policy; a legal-document center in settings; zero data collection
- **Details**: system back prefers in-page history before app navigation; edge-to-edge adaptation (fullscreen and Android containers); keyboard lifts input fields

## Architecture

```
zshell/                            # npm workspaces monorepo
├── packages/
│   ├── core-shell/              # framework-free pure-TS core (strict TS subset,
│   │                            #   ArkTS-compatible): pairing / endpoints / state
│   │                            #   machine / registry / app lock / crypto
│   └── patch-bundle/            # behavior patches injected into the official page
└── apps/mobile/                 # React Native 0.82 app (new architecture, Android first)
```

One principle: **single-source logic**. core-shell depends on no framework and platform abilities are injected through ports (storage, biometrics each have one), so a future shell swap (RN to native ArkTS) carries the logic over unchanged. See the [architecture doc](./docs/architecture.md) (Chinese).

## Getting Started

Requirements: Node ≥ 22, npm ≥ 12, JDK 17–21, Android SDK (API 36). Read the [build guide](./docs/build.md) first — monorepo paths, the npm patch, the Windows 260-char limit, and CN mirrors are all documented pitfalls.

```bash
npm install                          # install everything (incl. npm patch)
npx vitest run                       # core-shell unit tests
cd apps/mobile/android
./gradlew assembleRelease            # standalone release APK
```

Published builds live in [Releases](https://github.com/Amwidtf/zshell/releases); tags build automatically.

## Platform Roadmap

| Platform | Status | Notes |
|---|---|---|
| Android | ✅ available | RN 0.82, new architecture (Fabric) |
| HarmonyOS NEXT | 📋 planned | Same project + RNOH |
| iOS | 📋 planned | Scaffold ready; needs macOS or a cloud Mac |

## Security & Privacy

Zero collection, full stop: no backend, no accounts, no telemetry — everything stays in on-device encrypted storage. Pairing credentials are long-lived secrets (as good as a password); rotate them on the desktop from time to time. One thing to know: remote sessions travel through the official relay. This app adds no extra exposure, but relay-side visibility is the official design's call — weigh it yourself before working on sensitive codebases.

Full documents (Chinese): [privacy policy](./docs/PRIVACY.md), [security notes](./docs/SECURITY.md), [disclaimer](./docs/DISCLAIMER.md).

## Documentation

- [CHANGELOG.md](./CHANGELOG.md) — release history; feeds Release notes
- [AGENTS.md](./AGENTS.md) — guide for AI agents & contributors (Chinese)
- [docs/](./docs) — architecture, build guide, release process, compliance (Chinese)

## How This Is Built

This project is an AI pairing effort: the ZCode coding agent (powered by the GLM model) wrote nearly all of the code and documentation, while the human maintainer supplies requirements, makes the technical calls, and accepts the results. The commit history is that collaboration's record.

## License

[MIT](./LICENSE) © 2026 ZShell Contributors

Built on React Native and other open-source software (license list in the in-app "Open Source Licenses"); all third-party components serve local functionality only and do not affect the zero-collection commitment.
