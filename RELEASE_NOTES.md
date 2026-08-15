## CodePilot v0.66.2

> 修复 macOS 安全存储授权与本地服务异常恢复问题，推荐所有 v0.66.0 用户升级。

### 修复问题

- **修复历史对话和文件树同时失效** — 本地服务异常退出后会暂停请求并进行有限次数的安全恢复；恢复成功后回到原页面，不再长期停留在 `Failed to fetch`、文件树加载失败或灰屏状态。
- **修复恢复过程可能启动重复进程** — 只有在确认旧进程所有权安全时才自动恢复；无法确认时会停止重试并提示退出应用，避免多个 Codex 进程同时操作同一份本地数据。
- **修复 macOS Safe Storage 反复授权** — 正式 macOS 安装包改用稳定的 Developer ID 身份并在上传前严格校验，降低升级后因签名身份变化而反复请求“CodePilot Safe Storage”权限的问题。
- **修复异常退出统计重复** — 同一次本地服务退出只生成一条匿名错误记录，避免稳定性数据被重复计算。

### 优化改进

- Codex 模型刷新增加超时取消、请求合并、冷却和空闲回收，降低卡住的后台进程长期占用资源的风险。
- 本地服务输出增加按字节计算的 32 MiB 上限，避免异常大响应持续占用内存。
- Electron 更新至 40.10.6，吸收同一主版本内的 Chromium 与 Electron 稳定性修复。
- 本地服务异常观测只发送稳定分类、退出码和内存数值，不上传诊断原文、命令行、环境变量、路径或服务输出。

### 已知限制

- 本地服务内存异常的精确分配根因尚未在开发环境复现；本版增加了资源边界、卡死回收和故障恢复，但不宣称已消除所有 OOM 来源。
- 从旧的临时签名版本首次升级到 Developer ID 版本时，macOS 可能仍要求授权一次；后续同一签名身份的版本不应重复请求。若钥匙串条目或访问控制列表已损坏，系统仍可能显示原生访问提示。
- 如果崩溃时仍有无法验证归属的 Codex 子进程，CodePilot 会停止自动恢复并要求退出应用；必要时请清理残留进程或重启电脑后再打开。

## 下载地址

### macOS
- [Apple Silicon (M1/M2/M3/M4)](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-arm64.dmg)
- [Intel](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-x64.dmg)

### Windows
- [Windows 安装包](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot.Setup.0.66.2.exe)

### Linux x64
- [AppImage](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-x86_64.AppImage)
- [deb](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-amd64.deb)
- [rpm](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-x86_64.rpm)

### Linux arm64
- [AppImage](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-arm64.AppImage)
- [deb](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-arm64.deb)
- [rpm](https://github.com/op7418/CodePilot/releases/download/v0.66.2/CodePilot-0.66.2-aarch64.rpm)

## 安装说明

**macOS**：下载 DMG → 拖入 Applications → 首次启动如遇安全提示，在系统设置 > 隐私与安全中点击“仍要打开”

**Windows**：下载 exe 安装包 → 双击安装

**Linux**：AppImage 添加可执行权限后直接运行；Debian/Ubuntu 安装 deb；Fedora/RHEL 系安装 rpm

## 系统要求

- macOS 12.0+ / Windows 10+ / Linux (glibc 2.35+)
- 需要配置 API 服务商或受支持的套餐凭据
- 推荐安装 Claude Code CLI 以获得完整功能
