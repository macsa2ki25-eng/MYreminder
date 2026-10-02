'use strict';

const { execFile } = require('child_process');

// 「複製」表示のプロジェクタは Electron からは1画面に見えるので、
// Windows のモニター情報（WMI）で、つながっているモニターの数を数える。
const WMI_COMMAND =
  '@(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorBasicDisplayParams -ErrorAction SilentlyContinue | Where-Object { $_.Active }).Count';

function activeMonitorCount() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WMI_COMMAND],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        const n = parseInt(String(stdout).trim(), 10);
        resolve(Number.isFinite(n) ? n : null);
      },
    );
  });
}

async function inspectDisplays(screen) {
  const electronCount = screen.getAllDisplays().length;
  const wmiCount = await activeMonitorCount();
  return { electronCount, wmiCount, projecting: electronCount > 1 || (wmiCount !== null && wmiCount > 1) };
}

/** 目隠しモードにするか。mode: 'auto' | 'always' | 'off' */
async function shouldHide(mode, screen) {
  if (mode === 'always') return true;
  if (mode === 'off') return false;
  if (screen.getAllDisplays().length > 1) return true;
  return (await inspectDisplays(screen)).projecting;
}

module.exports = { shouldHide, inspectDisplays };
