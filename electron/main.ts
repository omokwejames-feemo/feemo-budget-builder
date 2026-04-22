import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { writeFile as writeFileAsync, readFile as readFileAsync, unlink } from 'fs/promises'
import { createServer } from 'http'
import { google } from 'googleapis'

// ── Auto-updater setup ────────────────────────────────────────────────────────

autoUpdater.autoDownload = false
// Keep false so Squirrel.Mac does NOT start during downloadUpdate().
// With true, Squirrel starts during the download and the "Restart & Apply"
// button appears before Squirrel finishes — quitAndInstall() then silently
// waits forever. With false, quitAndInstall() triggers Squirrel at click-time
// via the already-running localhost proxy (fast, < 1 s), then Squirrel
// calls nativeUpdater.quitAndInstall() itself once the zip is processed.
autoUpdater.autoInstallOnAppQuit = false

autoUpdater.on('update-available', (info) => {
  const body = typeof info.releaseNotes === 'string'
    ? info.releaseNotes
    : Array.isArray(info.releaseNotes)
      ? info.releaseNotes.map(n => n.note || '').join('\n')
      : ''
  mainWindow?.webContents.send('update-available', { version: info.version, body })
})

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('download-progress', {
    percent: Math.round(progress.percent),
    downloaded: progress.transferred,
    total: progress.total,
  })
})

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded')
})

autoUpdater.on('error', (err) => {
  mainWindow?.webContents.send('update-error', err.message)
})
const DRIVE_TOKEN_PATH = join(app.getPath('userData'), 'gdrive-token.json')
const DRIVE_CREDS_PATH = join(app.getPath('userData'), 'gdrive-creds.json')

let mainWindow: BrowserWindow | null = null
// File path queued before the window is ready (macOS open-file event or argv)
let startupFilePath: string | null = null

// Capture macOS open-file events fired before or after window creation
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (filePath.endsWith('.feemo')) {
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('open-file', filePath)
    } else {
      startupFilePath = filePath
    }
  }
})

// On Windows / Linux the file path arrives as a command-line argument
function getArgvFilePath(): string | null {
  const args = process.argv.slice(app.isPackaged ? 1 : 2)
  const feemoArg = args.find(a => a.endsWith('.feemo'))
  return feemoArg ?? null
}

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
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
    title: 'Feemo Budget Manager',
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })

  // Once the renderer is ready, send any queued file path
  mainWindow.webContents.on('did-finish-load', () => {
    const filePath = startupFilePath ?? getArgvFilePath()
    if (filePath) {
      mainWindow?.webContents.send('open-file', filePath)
      startupFilePath = null
    }
  })
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

ipcMain.handle('read-file-by-path', async (_event, filePath: string) => {
  try {
    const data = await readFileAsync(filePath, 'utf-8')
    return { success: true, filePath, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ── Update IPC ────────────────────────────────────────────────────────────────

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('check-for-updates', async () => {
  const current = app.getVersion()
  if (!app.isPackaged) {
    return { success: true, current, latest: current, hasUpdate: false, body: '' }
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result) return { success: true, current, latest: current, hasUpdate: false, body: '' }
    const latest = result.updateInfo.version
    const hasUpdate = compareVersions(latest, current) > 0
    const body = typeof result.updateInfo.releaseNotes === 'string'
      ? result.updateInfo.releaseNotes
      : Array.isArray(result.updateInfo.releaseNotes)
        ? result.updateInfo.releaseNotes.map(n => n.note || '').join('\n')
        : ''
    return { success: true, current, latest, hasUpdate, body }
  } catch (err) {
    return { success: false, error: String(err), current, latest: current, hasUpdate: false, body: '' }
  }
})

ipcMain.handle('download-update', async () => {
  // Retry up to 3 times — GitHub redirects to CDN can trigger ERR_NETWORK_CHANGED
  // in Electron's Chromium net module on the first attempt.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (err) {
      const msg = String(err)
      const isNetworkGlitch = /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|net::ERR/i.test(msg)
      if (attempt < 3 && isNetworkGlitch) {
        await new Promise(resolve => setTimeout(resolve, 1500 * attempt))
        continue
      }
      return { success: false, error: msg }
    }
  }
  return { success: false, error: 'Download failed after retries.' }
})

ipcMain.handle('install-update', () => {
  // Defer past the IPC response so the renderer receives the reply before quit.
  setImmediate(() => {
    // quitAndInstall() triggers Squirrel.Mac to fetch the zip from the already-
    // running localhost proxy, process it, then call nativeUpdater.quitAndInstall()
    // which quits + relaunches.  Because autoInstallOnAppQuit=false, Squirrel has
    // NOT run yet, so the proxy zip is ready and the call succeeds immediately.
    try {
      autoUpdater.quitAndInstall(true, true)
    } catch {}

    // Safety net: if Squirrel fails on this system (e.g. SIP, wrong location)
    // and the app is still alive after 15 s, force close it.  15 s is enough
    // for Squirrel to download ~100 MB via localhost; in practice < 2 s.
    // If quitAndInstall already killed the process this timer never fires.
    setTimeout(() => {
      app.relaunch()
      app.quit()
    }, 15000)
  })
})

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url)
})

// ── PDF Export ────────────────────────────────────────────────────────────────

ipcMain.handle('print-to-pdf', async (_event, { html, defaultName }: { html: string; defaultName: string }) => {
  const { filePath, canceled } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
  })
  if (canceled || !filePath) return { success: false }

  const pdfWin = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } })
  try {
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true,
      margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    })
    await writeFileAsync(filePath, pdfBuffer)
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  } finally {
    pdfWin.destroy()
  }
})

// ── Google Drive ──────────────────────────────────────────────────────────────

function getOAuth2Client(clientId: string, clientSecret: string, redirectUri: string) {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

ipcMain.handle('gdrive-set-credentials', async (_event, { clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
  try {
    await writeFileAsync(DRIVE_CREDS_PATH, JSON.stringify({ clientId, clientSecret }, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('gdrive-get-credentials', async () => {
  try {
    const raw = await readFileAsync(DRIVE_CREDS_PATH, 'utf-8')
    return { success: true, ...JSON.parse(raw) }
  } catch {
    return { success: false }
  }
})

ipcMain.handle('gdrive-has-token', async () => {
  try {
    await readFileAsync(DRIVE_TOKEN_PATH, 'utf-8')
    return { hasToken: true }
  } catch {
    return { hasToken: false }
  }
})

ipcMain.handle('gdrive-disconnect', async () => {
  try { await unlink(DRIVE_TOKEN_PATH) } catch {}
  return { success: true }
})

ipcMain.handle('gdrive-authorize', async () => {
  let credsRaw = ''
  try { credsRaw = await readFileAsync(DRIVE_CREDS_PATH, 'utf-8') } catch {
    return { success: false, error: 'No Google credentials configured. Please enter your Client ID and Secret first.' }
  }
  const { clientId, clientSecret } = JSON.parse(credsRaw)

  // Start temporary loopback server
  const port = await new Promise<number>((resolve) => {
    const s = createServer()
    s.listen(0, '127.0.0.1', () => { resolve((s.address() as { port: number }).port); s.close() })
  })
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`
  const auth = getOAuth2Client(clientId, clientSecret, redirectUri)

  const authUrl = auth.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
  })

  // Start callback server
  const code = await new Promise<string | null>((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:${port}`)
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body style="font-family:sans-serif;padding:40px"><h2>✓ Authorised!</h2><p>You can close this tab and return to Feemo Budget Manager.</p></body></html>')
      server.close()
      resolve(code)
    })
    server.listen(port, '127.0.0.1')
    // Timeout after 5 minutes
    setTimeout(() => { server.close(); resolve(null) }, 300000)
  })

  shell.openExternal(authUrl)

  if (!code) return { success: false, error: 'Authorization timed out or was cancelled.' }

  try {
    const { tokens } = await auth.getToken(code)
    await writeFileAsync(DRIVE_TOKEN_PATH, JSON.stringify(tokens, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('gdrive-upload', async (_event, { data, fileName }: { data: string; fileName: string }) => {
  let credsRaw = '', tokenRaw = ''
  try {
    credsRaw = await readFileAsync(DRIVE_CREDS_PATH, 'utf-8')
    tokenRaw = await readFileAsync(DRIVE_TOKEN_PATH, 'utf-8')
  } catch {
    return { success: false, error: 'Not connected to Google Drive. Please authorise first.' }
  }

  const { clientId, clientSecret } = JSON.parse(credsRaw)
  const tokens = JSON.parse(tokenRaw)
  const auth = getOAuth2Client(clientId, clientSecret, '')
  auth.setCredentials(tokens)
  auth.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens }
    await writeFileAsync(DRIVE_TOKEN_PATH, JSON.stringify(merged, null, 2), 'utf-8')
  })

  const drive = google.drive({ version: 'v3', auth })
  const { Readable } = await import('stream')

  try {
    // Look for an existing Feemo folder or create one
    const folderRes = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='Feemo Budget Manager' and trashed=false",
      fields: 'files(id)',
    })
    let folderId: string
    if (folderRes.data.files && folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id!
    } else {
      const folder = await drive.files.create({
        requestBody: { name: 'Feemo Budget Manager', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
      })
      folderId = folder.data.id!
    }

    // Check if file with same name exists → update, otherwise create
    const existRes = await drive.files.list({
      q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
      fields: 'files(id)',
    })

    const stream = Readable.from([Buffer.from(data, 'utf-8')])
    const media = { mimeType: 'application/json', body: stream }

    if (existRes.data.files && existRes.data.files.length > 0) {
      await drive.files.update({ fileId: existRes.data.files[0].id!, media })
    } else {
      await drive.files.create({ requestBody: { name: fileName, parents: [folderId] }, media, fields: 'id' })
    }

    return { success: true, timestamp: new Date().toISOString() }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
