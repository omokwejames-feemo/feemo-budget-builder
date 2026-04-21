import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import { join } from 'path'
import { writeFile, readFile, createWriteStream } from 'fs'
import { writeFile as writeFileAsync, readFile as readFileAsync } from 'fs/promises'
import { get as httpsGet } from 'https'
import { tmpdir, homedir } from 'os'

const GITHUB_REPO = 'omokwejames-feemo/feemo-budget-builder'

let mainWindow: BrowserWindow | null = null

// ── Version helpers ───────────────────────────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, { headers: { 'User-Agent': 'Feemo-Budget-Builder' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume()
        fetchJson(res.headers.location!).then(resolve).catch(reject)
        return
      }
      let body = ''
      res.on('data', (chunk: Buffer) => { body += chunk.toString() })
      res.on('end', () => {
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')) })
  })
}

// Download a binary file with redirect following and progress events
function downloadFile(url: string, destPath: string, onProgress: (pct: number, dl: number, total: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)

    const doGet = (currentUrl: string) => {
      httpsGet(currentUrl, { headers: { 'User-Agent': 'Feemo-Budget-Builder' } }, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          res.resume()
          doGet(res.headers.location)
          return
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0
        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          onProgress(total > 0 ? Math.round((downloaded / total) * 100) : 0, downloaded, total)
        })
        res.pipe(file)
        file.on('finish', () => resolve())
        res.on('error', (err) => { file.destroy(); reject(err) })
      }).on('error', (err) => { file.destroy(); reject(err) })
    }

    doGet(url)
  })
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const iconPath = join(app.getAppPath(), 'public', 'icon.icns')
  const icon = nativeImage.createFromPath(iconPath)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f0f',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Feemo Budget Builder',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── File IPC ──────────────────────────────────────────────────────────────────

ipcMain.handle('save-file', async (_event, { buffer, defaultName }: { buffer: number[], defaultName: string }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  })
  if (canceled || !filePath) return { success: false }
  await writeFileAsync(filePath, Buffer.from(buffer))
  return { success: true, filePath }
})

ipcMain.handle('save-project', async (_event, { data, filePath }: { data: string; filePath: string }) => {
  await writeFileAsync(filePath, data, 'utf-8')
  return { success: true, filePath }
})

ipcMain.handle('save-project-to', async (_event, { data, defaultName }: { data: string; defaultName: string }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Feemo Project', extensions: ['feemo'] }],
  })
  if (canceled || !filePath) return { success: false }
  await writeFileAsync(filePath, data, 'utf-8')
  return { success: true, filePath }
})

ipcMain.handle('open-project', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    filters: [{ name: 'Feemo Project', extensions: ['feemo'] }],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return { success: false }
  const data = await readFileAsync(filePaths[0], 'utf-8')
  return { success: true, filePath: filePaths[0], data }
})

// ── Update IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('check-for-updates', async () => {
  const current = app.getVersion()
  const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

  try {
    const json = await fetchJson(apiUrl) as Record<string, unknown>
    const latest = (json.tag_name as string)?.replace(/^v/, '') ?? current
    const releasePageUrl = (json.html_url as string) ?? `https://github.com/${GITHUB_REPO}/releases/latest`
    const hasUpdate = compareVersions(latest, current) > 0

    // Pick the right installer asset for this platform / arch
    type Asset = { name: string; browser_download_url: string; size: number }
    const assets = (json.assets as Asset[]) ?? []
    const isMac = process.platform === 'darwin'
    const isArm = process.arch === 'arm64'

    let assetUrl = releasePageUrl
    let assetSize = 0

    if (isMac) {
      const armDmg = assets.find(a => a.name.toLowerCase().includes('arm64') && a.name.endsWith('.dmg'))
      const x64Dmg = assets.find(a => !a.name.toLowerCase().includes('arm64') && a.name.endsWith('.dmg'))
      const chosen = isArm ? (armDmg ?? x64Dmg) : (x64Dmg ?? armDmg)
      if (chosen) { assetUrl = chosen.browser_download_url; assetSize = chosen.size }
    } else {
      const exe = assets.find(a => a.name.endsWith('.exe'))
      if (exe) { assetUrl = exe.browser_download_url; assetSize = exe.size }
    }

    return { success: true, current, latest, hasUpdate, releasePageUrl, assetUrl, assetSize }
  } catch (err) {
    return {
      success: false, error: String(err), current, latest: current,
      hasUpdate: false, releasePageUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
      assetUrl: '', assetSize: 0,
    }
  }
})

ipcMain.handle('download-and-open-update', async (_event, { assetUrl, fileName }: { assetUrl: string; fileName: string }) => {
  // Save to ~/Downloads so it's obvious and accessible to the user
  const destDir = process.platform === 'darwin'
    ? join(homedir(), 'Downloads')
    : tmpdir()
  const destPath = join(destDir, fileName)

  try {
    await downloadFile(assetUrl, destPath, (pct, dl, total) => {
      mainWindow?.webContents.send('download-progress', { percent: pct, downloaded: dl, total })
    })

    // Hand off to the OS — macOS opens the DMG in Finder, Windows runs the NSIS exe
    const errMsg = await shell.openPath(destPath)
    if (errMsg) return { success: false, error: errMsg }

    return { success: true, path: destPath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
