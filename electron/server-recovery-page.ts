export type ServerRecoveryPageState = 'recovering' | 'blocked' | 'failed';

export interface ServerRecoveryPageOptions {
  locale?: string;
  state: ServerRecoveryPageState;
  attempt?: number;
  reasonCode?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Build a self-contained error surface that does not depend on Next.js. */
export function buildServerRecoveryHtml(options: ServerRecoveryPageOptions): string {
  const zh = (options.locale ?? '').toLowerCase().startsWith('zh');
  const copy = zh
    ? {
        title: options.state === 'recovering' ? 'CodePilot 正在恢复' : 'CodePilot 需要你的操作',
        recovering: '内部服务意外退出，正在安全模式下恢复。当前任务可能已中断。',
        blocked: '无法确认旧的 Codex 进程是否已完全退出。为避免重复进程或数据损坏，自动恢复已停止；请点击「退出应用」，清理残留的 Codex 进程（不确定时重启电脑），然后再手动重新打开应用。',
        failed: '内部服务连续恢复失败，已停止自动重试。',
        retry: '再试一次',
        restart: '重启应用',
        quit: '退出应用',
        copy: '复制诊断摘要',
        copied: '诊断摘要已复制',
        attempt: '恢复尝试',
      }
    : {
        title: options.state === 'recovering' ? 'CodePilot is recovering' : 'CodePilot needs your help',
        recovering: 'The internal service exited unexpectedly. Recovery is running in safe mode. The current task may have been interrupted.',
        blocked: 'CodePilot cannot prove that the old Codex process tree has exited. Automatic recovery stopped to avoid duplicate owners. Quit the app, clean up any remaining Codex process (or restart the computer if unsure), then reopen CodePilot manually.',
        failed: 'The internal service failed repeatedly, so automatic retries have stopped.',
        retry: 'Try again',
        restart: 'Restart app',
        quit: 'Quit app',
        copy: 'Copy diagnostics',
        copied: 'Diagnostics copied',
        attempt: 'Recovery attempt',
      };
  const detail = copy[options.state];
  const attempt = options.attempt && options.attempt > 0
    ? `<p class="meta">${copy.attempt} ${options.attempt}/3</p>`
    : '';
  const reasonCode = options.reasonCode
    ? `<p class="code">${escapeHtml(options.reasonCode)}</p>`
    : '';
  const retryButton = options.state !== 'failed'
    ? ''
    : `<button id="retry" class="secondary">${copy.retry}</button>`;
  // The blocked state means the descendant registry cannot prove single
  // ownership, and the registry does not survive a relaunch. A one-click
  // relaunch would boot a fresh Main with an empty registry that may spawn a
  // second Codex app-server over the same CODEX_HOME while the old tree is
  // still alive — exactly the state this page exists to prevent. Blocked
  // therefore offers plain quit only; the user cleans up (or reboots) and
  // reopens the app manually.
  const primaryButton = options.state === 'blocked'
    ? `<button id="quit">${copy.quit}</button>`
    : `<button id="restart">${copy.restart}</button>`;

  return `<!DOCTYPE html>
<html lang="${zh ? 'zh-CN' : 'en'}">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *{box-sizing:border-box}body{margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#eee;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-app-region:drag}.card{width:min(520px,calc(100vw - 48px));padding:32px;border:1px solid #333;border-radius:16px;background:#1a1a1a;box-shadow:0 16px 60px #0008}.badge{display:inline-block;margin-bottom:18px;padding:5px 9px;border-radius:999px;background:#2b2112;color:#f4b860;font-size:12px}h1{margin:0 0 12px;font-size:24px}p{margin:0 0 12px;line-height:1.6;color:#bbb}.meta,.code{font-size:12px;color:#777}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px;-webkit-app-region:no-drag}button{border:0;border-radius:9px;padding:10px 14px;background:#f1f1f1;color:#111;font-weight:600;cursor:pointer}.secondary{background:#303030;color:#eee}.status{min-height:20px;margin-top:12px;font-size:12px;color:#8dc891;-webkit-app-region:no-drag}
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Recovery safe mode</div>
    <h1>${copy.title}</h1>
    <p>${detail}</p>
    ${attempt}${reasonCode}
    <div class="actions">${retryButton}${primaryButton}<button id="copy" class="secondary">${copy.copy}</button></div>
    <div id="status" class="status" role="status"></div>
  </main>
  <script>
    const api = window.electronAPI && window.electronAPI.serverRecovery;
    const status = document.getElementById('status');
    ${options.state === 'blocked'
      ? "document.getElementById('quit').addEventListener('click', () => api && api.quitApp());"
      : "document.getElementById('restart').addEventListener('click', () => api && api.restartApp());"}
    document.getElementById('retry')?.addEventListener('click', () => api && api.retry());
    document.getElementById('copy').addEventListener('click', async () => {
      if (api && await api.copyDiagnostics()) status.textContent = ${JSON.stringify(copy.copied)};
    });
  </script>
</body>
</html>`;
}

export function buildServerRecoveryDataUrl(options: ServerRecoveryPageOptions): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(buildServerRecoveryHtml(options))}`;
}
