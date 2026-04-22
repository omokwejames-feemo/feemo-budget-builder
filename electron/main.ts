import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell } from 'electron'
import { join } from 'path'
import { writeFile, readFile, createWriteStream } from 'fs'
import { writeFile as writeFileAsync, readFile as readFileAsync, unlink } from 'fs/promises'
import { get as httpsGet } from 'https'
import { tmpdir, homedir } from 'os'
import { createServer } from 'http'
import { google } from 'googleapis'

const GITHUB_REPO = 'omokwejames-feemo/feemo-budget-builder'
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

    const body = (json.body as string) ?? ''
    return { success: true, current, latest, hasUpdate, releasePageUrl, assetUrl, assetSize, body }
  } catch (err) {
    return {
      success: false, error: String(err), current, latest: current,
      hasUpdate: false, releasePageUrl: `https://github.com/${GITHUB_REPO}/releases/latest`,
      assetUrl: '', assetSize: 0, body: '',
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
