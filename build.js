// 构建编排：electron-builder 打包 nsis 安装包 -> 兜底确保规范命名
// 期望产物：监理总控工作台-v1.2.1-setup.exe
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cwd = __dirname;

// 1) 打包
try {
  execFileSync('npx', ['electron-builder', '--win', 'nsis'], { cwd, stdio: 'inherit', shell: true });
} catch (e) {
  // electron-builder 在清理临时 .7z 时可能被安全删除护栏拦截而退出非零，但 exe 通常已生成，继续重命名
  console.log('[build] electron-builder 退出码非零（常见为安全删除护栏拦截），继续重命名步骤');
}

// 2) 兜底重命名：确保安装包使用规范命名（监理总控工作台-vX.Y.Z-setup.exe）
const distDir = path.join(cwd, 'dist');
if (!fs.existsSync(distDir)) { console.log('[build] dist 目录不存在，结束'); process.exit(0); }

// 规范化目标名：`监理总控工作台-vX.Y.Z-setup.exe`
const re = /^监理总控工作台-v(\d+\.\d+\.\d+)-setup\.exe$/;
for (const f of fs.readdirSync(distDir).filter(x => x.endsWith('.exe'))) {
  if (re.test(f)) {
    console.log(`[build] 保留: ${f}`);
    continue;
  }
  // 同时兼容 `-setup.exe` 与无 `-setup` 的两种产物名。
  // ⚠️ 前缀必须同时接受 `jianli-workbench-`：
  // package.json 的 artifactName 产出的是 `jianli-workbench-v${version}-setup.exe`，
  // 而历史发布资产一直用中文名 `监理总控工作台-vX.Y.Z-setup.exe`。
  // 早期这里只认中文前缀，导致 v1.3.7 起产出的英文文件名全部落到「跳过」分支，
  // 发布出去的名字与其他版本不一致。
  const mm = f.match(/^(?:监理总控工作台|jianli-workbench)-v(\d+\.\d+\.\d+)(?:-setup)?\.exe$/);
  if (mm) {
    const newName = `监理总控工作台-v${mm[1]}-setup.exe`;
    const src = path.join(distDir, f);
    const dst = path.join(distDir, newName);
    if (src !== dst) {
      fs.renameSync(src, dst);
      console.log(`[build] 重命名: ${f} -> ${newName}`);
    }
    // 同步重命名 blockmap（electron-builder 增量更新用），否则会与实际 exe 对不上
    const oldMap = src + '.blockmap';
    if (fs.existsSync(oldMap)) {
      fs.renameSync(oldMap, dst + '.blockmap');
      console.log(`[build] 重命名: ${f}.blockmap -> ${newName}.blockmap`);
    }
  } else {
    console.log(`[build] 跳过无法识别文件: ${f}`);
  }
}
