const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { execFile } = require('child_process');

const PORT = 51734;
const RENDERER_DIR = path.join(__dirname, 'renderer');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

let mainWindow = null;

// ---------- single-instance lock ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  function startServer() {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        let reqPath = decodeURIComponent(req.url.split('?')[0]);
        if (reqPath === '/') reqPath = '/index.html';
        const safePath = path.normalize(path.join(RENDERER_DIR, reqPath));
        if (!safePath.startsWith(RENDERER_DIR)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        fs.readFile(safePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          const ext = path.extname(safePath);
          res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
          res.end(data);
        });
      });
      server.once('error', reject);
      server.listen(PORT, '127.0.0.1', () => resolve(server));
    });
  }

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      backgroundColor: '#0b0d12',
      autoHideMenuBar: true,
      title: 'OpenClaw Work',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    mainWindow.loadURL(`http://127.0.0.1:${PORT}/index.html`);
  }

  ipcMain.handle('fetch-gateway-token', () => {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const cmd = isWin ? 'openclaw.cmd' : 'openclaw';
      execFile(cmd, ['gateway', 'auth-token', '--show'], { shell: isWin }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message || 'Falha ao executar openclaw'));
          return;
        }
        const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const tokenLine = [...lines].reverse().find((l) => /^[a-f0-9]{20,}$/i.test(l));
        if (!tokenLine) {
          reject(new Error('Token não encontrado na saída do comando.'));
          return;
        }
        resolve(tokenLine);
      });
    });
  });

  app.whenReady().then(async () => {
    try {
      await startServer();
      createWindow();
    } catch (e) {
      const msg = e && e.code === 'EADDRINUSE'
        ? `A porta ${PORT} já está em uso — provavelmente já existe uma janela do OpenClaw Work aberta (ou um processo antigo não foi finalizado). Feche todas as janelas/processos "OpenClaw Work" no Gerenciador de Tarefas e abra o app de novo.`
        : `Não foi possível iniciar o servidor interno: ${e.message}`;
      dialog.showErrorBox('OpenClaw Work', msg);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
