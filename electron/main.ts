import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'
import { get as httpsGet } from 'https'

const GITHUB_REPO = 'omokwejames-feemo/feemo-budget-builder'

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

function createWindow() {
  const iconPath = join(app.getAppPath(), 'public', 'icon.icns')
  const icon = nativeImage.createFromPath(iconPath)

  const win = new BrowserWindow({
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
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('save-file', async (_event, { buffer, defaultName }: { buffer: number[], defaultName: string }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
  })
  if (canceled || !filePath) return { success: false }
  await writeFile(filePath, Buffer.from(buffer))
  return { success: true, filePath }
})

ipcMain.handle('save-project', async (_event, { data, filePath }: { data: string; filePath: string }) => {
  await writeFile(filePath, data, 'utf-8')
  return { success: true, filePath }
})

ipcMain.handle('save-project-to', async (_event, { data, defaultName }: { data: string; defaultName: string }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'Feemo Project', extensions: ['feemo'] }],
  })
  if (canceled || !filePath) return { success: false }
  await writeFile(filePath, data, 'utf-8')
  return { success: true, filePath }
})

ipcMain.handle('open-project', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    filters: [{ name: 'Feemo Project', extensions: ['feemo'] }],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return { success: false }
  const data = await readFile(filePaths[0], 'utf-8')
  return { success: true, filePath: filePaths[0], data }
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('check-for-updates', async () => {
  const current = app.getVersion()
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

  let latest = current
  let downloadUrl = `https://github.com/${GITHUB_REPO}/releases/latest`

  try {
    const json = await fetchJson(url) as Record<string, unknown>
    if (json.tag_name && typeof json.tag_name === 'string') {
      latest = json.tag_name.replace(/^v/, '')
    }
    if (json.html_url && typeof json.html_url === 'string') {
      downloadUrl = json.html_url
    }
  } catch (err) {
    return { success: false, error: String(err), current, latest: current, hasUpdate: false, downloadUrl }
  }

  const hasUpdate = compareVersions(latest, current) > 0
  return { success: true, current, latest, hasUpdate, downloadUrl }
})

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
