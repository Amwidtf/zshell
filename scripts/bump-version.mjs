#!/usr/bin/env node
// 发版版本号统一同步脚本（零依赖，只用 Node 内置模块）。
//
// 用法：
//   node scripts/bump-version.mjs <x.y.z[-prerelease[.N]]> [versionCode]   显式指定版本
//   node scripts/bump-version.mjs pre [versionCode]                        预发布计数 +1
//
// 一次写入（发版检查单第 3 条，勿再手改）：
//   package.json / apps/mobile/package.json            version
//   apps/mobile/android/app/build.gradle               versionName + versionCode（缺省 +1）
//   apps/mobile/src/version.ts                         APP_VERSION + APP_VERSION_CODE
//   package-lock.json                                  头部（前 1200 字节）的 workspace 版本，
//                                                       依赖条目的同名版本字段不受影响

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PATHS = {
  rootPkg: 'package.json',
  mobilePkg: 'apps/mobile/package.json',
  gradle: 'apps/mobile/android/app/build.gradle',
  versionTs: 'apps/mobile/src/version.ts',
  lock: 'package-lock.json',
};

// semver.org 官方正则去掉 build metadata 段（仓库版本号不使用 +build）
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;

// package-lock 头部处理窗口：workspace 根条目的两个 version 都落在这个范围内，
// 任何 node_modules 依赖条目都远在其后
const LOCK_HEAD_LIMIT = 1200;

const USAGE = [
  '用法：',
  '  node scripts/bump-version.mjs <版本号> [versionCode]    显式指定版本，如 0.1.0、0.1.0-beta.2',
  '  node scripts/bump-version.mjs pre [versionCode]        预发布计数 +1（0.1.0-beta.1 → 0.1.0-beta.2；',
  '                                                         当前无预发布后缀时升级为 <x.y.z>-alpha.1）',
  '',
  '版本号须为合法 Semver，可含预发布段（alpha/beta/rc.N 等）。',
  'versionCode 缺省为当前值 +1；显式指定时必须为大于当前值的整数。',
].join('\n');

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function read(rel) {
  return readFileSync(resolve(ROOT, PATHS[rel]), 'utf8');
}

function write(rel, text) {
  writeFileSync(resolve(ROOT, PATHS[rel]), text, 'utf8');
}

// 预发布计数 +1；当前无预发布后缀则进入 <x.y.z>-alpha.1。
// 末段非纯数字（如 0.1.0-beta）时补 .1。
export function nextPreVersion(current) {
  const dash = current.indexOf('-');
  if (dash === -1) return `${current}-alpha.1`;
  const core = current.slice(0, dash);
  const ids = current.slice(dash + 1).split('.');
  const last = ids[ids.length - 1];
  if (/^\d+$/.test(last)) ids[ids.length - 1] = String(Number(last) + 1);
  else ids.push('1');
  return `${core}-${ids.join('.')}`;
}

// 替换第一个匹配；未命中直接报错退出，绝不静默漏写
function replaceFirst(text, label, re, build) {
  const m = re.exec(text);
  if (!m) die(`写入失败：${label} 中未找到目标（${re}）`);
  return text.replace(re, () => build(m));
}

function main() {
  const [argVersion, argCode] = process.argv.slice(2);
  if (!argVersion) die(USAGE);

  const rootPkgText = read('rootPkg');
  let currentVersion;
  try {
    currentVersion = JSON.parse(rootPkgText).version;
  } catch {
    die('解析根 package.json 失败');
  }
  if (typeof currentVersion !== 'string' || !SEMVER_RE.test(currentVersion)) {
    die(`根 package.json 的当前版本不合法：${currentVersion}`);
  }

  let newVersion;
  if (argVersion === 'pre') {
    newVersion = nextPreVersion(currentVersion);
  } else if (SEMVER_RE.test(argVersion)) {
    newVersion = argVersion;
  } else {
    die(`非法版本号：${argVersion}\n\n${USAGE}`);
  }

  const gradleText = read('gradle');
  const codeMatch = /^(\s*versionCode\s+)(\d+)/m.exec(gradleText);
  if (!codeMatch) die('写入失败：build.gradle 中未找到 versionCode');
  const currentCode = Number(codeMatch[2]);

  let newCode;
  if (argCode === undefined) {
    newCode = currentCode + 1;
  } else if (/^\d+$/.test(argCode)) {
    newCode = Number(argCode);
  } else {
    die(`非法 versionCode：${argCode}\n\n${USAGE}`);
  }
  if (newCode <= currentCode) {
    die(`versionCode 必须大于当前值 ${currentCode}（收到 ${newCode}）`);
  }

  const mobilePkgText = read('mobilePkg');
  const versionTsText = read('versionTs');
  const nameMatch = /^(\s*versionName\s+)"([^"]*)"/m.exec(gradleText);
  const tsMatch = /APP_VERSION = '([^']+)'/.exec(versionTsText);

  // 以根 package.json 为基准做一致性提示；不一致时由本次写入统一
  const drift = [];
  try {
    const v = JSON.parse(mobilePkgText).version;
    if (v !== currentVersion) drift.push(`apps/mobile/package.json：${v}`);
  } catch {
    drift.push('apps/mobile/package.json：解析失败');
  }
  if (!nameMatch || nameMatch[2] !== currentVersion) {
    drift.push(`build.gradle versionName：${nameMatch ? nameMatch[2] : '未找到'}`);
  }
  if (!tsMatch || tsMatch[1] !== currentVersion) {
    drift.push(`src/version.ts：${tsMatch ? tsMatch[1] : '未找到'}`);
  }
  if (drift.length > 0) {
    console.warn(`警告：以下位置与根 package.json 的版本 ${currentVersion} 不一致，本次写入后统一：`);
    for (const d of drift) console.warn(`  - ${d}`);
  }

  // —— 校验全部通过，开始写入（package.json 的顶层 version 位于任何依赖块之前，
  //    首个 "version" 键即包自身版本）——
  write('rootPkg', replaceFirst(rootPkgText, 'package.json', /"version":\s*"[^"]*"/, () => `"version": "${newVersion}"`));
  write('mobilePkg', replaceFirst(mobilePkgText, 'apps/mobile/package.json', /"version":\s*"[^"]*"/, () => `"version": "${newVersion}"`));

  let gradleOut = replaceFirst(
    gradleText,
    'build.gradle versionName',
    /^(\s*versionName\s+)"[^"]*"/m,
    (m) => `${m[1]}"${newVersion}"`,
  );
  gradleOut = replaceFirst(gradleOut, 'build.gradle versionCode', /^(\s*versionCode\s+)\d+/m, (m) => `${m[1]}${newCode}`);
  write('gradle', gradleOut);

  let tsOut = replaceFirst(
    versionTsText,
    'src/version.ts APP_VERSION',
    /(export const APP_VERSION = ')[^']*(')/,
    (m) => `${m[1]}${newVersion}${m[2]}`,
  );
  tsOut = replaceFirst(tsOut, 'src/version.ts APP_VERSION_CODE', /(export const APP_VERSION_CODE = )\d+/, (m) => `${m[1]}${newCode}`);
  write('versionTs', tsOut);

  // package-lock.json：只处理头部窗口内的 "version" 键（即两处 workspace 条目）
  let lockNote = '未改动';
  try {
    const raw = read('lock');
    const head = raw.slice(0, LOCK_HEAD_LIMIT);
    let count = 0;
    const newHead = head.replace(/"version":\s*"[^"]*"/g, () => {
      count += 1;
      return `"version": "${newVersion}"`;
    });
    if (count > 0) {
      write('lock', newHead + raw.slice(LOCK_HEAD_LIMIT));
      lockNote = `头部 ${count} 处已同步`;
    } else {
      lockNote = '头部未找到版本条目，请人工确认';
    }
  } catch {
    lockNote = '不存在，已跳过';
  }

  console.log(`版本号 ${currentVersion} → ${newVersion}，versionCode ${currentCode} → ${newCode}`);
  console.log('已写入：');
  console.log('  package.json（version）');
  console.log('  apps/mobile/package.json（version）');
  console.log('  apps/mobile/android/app/build.gradle（versionName/versionCode）');
  console.log('  apps/mobile/src/version.ts（APP_VERSION/APP_VERSION_CODE）');
  console.log(`  package-lock.json（${lockNote}）`);
  if (newVersion !== currentVersion) {
    console.log(`\n后续：CHANGELOG.md 添加「## [${newVersion}] - 日期」段落，提交后打标签 v${newVersion}。`);
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
