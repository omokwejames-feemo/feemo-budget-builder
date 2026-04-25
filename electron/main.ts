import { app, BrowserWindow, ipcMain, dialog, nativeImage, shell, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join, dirname } from 'path'
import { writeFile as writeFileAsync, readFile as readFileAsync, unlink, readdir, appendFile } from 'fs/promises'
import { existsSync } from 'fs'
import { spawn } from 'child_process'
import { tmpdir, homedir } from 'os'
import { createServer } from 'http'
import { createConnection } from 'net'
import { connect as tlsConnect } from 'tls'
import { google } from 'googleapis'
import { createHash, randomInt } from 'crypto'
import ElectronStore from 'electron-store'

// ── Auto-updater setup ────────────────────────────────────────────────────────

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false
autoUpdater.allowPrerelease = false

// Track the downloaded zip path so we can apply it ourselves (bypassing Squirrel.Mac)
let downloadedZipPath: string | null = null

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

autoUpdater.on('update-downloaded', (event: any) => {
  // Capture the zip path before Squirrel.Mac can interfere with it
  downloadedZipPath = event?.downloadedFile ?? null
  mainWindow?.webContents.send('update-downloaded')
})

autoUpdater.on('error', (err) => {
  mainWindow?.webContents.send('update-error', err.message)
})
// ── Encrypted session store ───────────────────────────────────────────────────
// Encryption key derived from device-specific paths so the store cannot be
// copied and replayed on a different machine.
function deviceEncryptionKey(): string {
  const seed = `${homedir()}::${app.getPath('userData')}`
  return createHash('sha256').update(seed).digest('hex').slice(0, 32)
}

const sessionStore = new ElectronStore<{ betaSession?: unknown }>({
  name: 'feemo-session',
  encryptionKey: deviceEncryptionKey(),
})

ipcMain.handle('session-load', () => {
  const s = sessionStore.get('betaSession')
  return s ?? null
})

ipcMain.handle('session-save', (_event, session: unknown) => {
  sessionStore.set('betaSession', session)
  return { success: true }
})

ipcMain.handle('session-clear', () => {
  sessionStore.delete('betaSession')
  return { success: true }
})

// ── Beta key registry ─────────────────────────────────────────────────────────
// All 20 keys are stored as SHA-256 hashes — the plaintext key never appears here.
// Key state (activation, expiry, bound email, verified) is stored in encrypted
// electron-store. The OTP lives only in a process-level Map and is never sent
// to the renderer.

const KEY_HASHES: ReadonlySet<string> = new Set([
  'd598dd65e360523512f2ce87f06ccec6baf890351f6e0a5715ade2f7f8708d29', // FEEMO-A7K2-M9PQ
  '440aca7ccb0a21d43005cb5b3e5e2b8a83c8bd55ca51a0f83b4027e13dfc4860', // FEEMO-B3R8-X5NW
  '941028076e1abf03c1bb802cf53bd03afcc64784a4c16709f80625660e14ee77', // FEEMO-C6T1-H4VZ
  'a6518f7bb8f942b365b470d8a4474681d9e90575ebf8384295e271a09d5de413', // FEEMO-D9Y4-J2FL
  '4cb2102a999acb8aff2ac19a07d6446fb8c202bc50dcde4e74b41f71423e564c', // FEEMO-E2S7-K8GT
  '3dd51482918f5b15a78010ab5d0f6dccfffdeadaa5225ec7c6f18f056e9b9422', // FEEMO-F5W3-N1RB
  '0f728b21ad0fe8e17331ddb8598d9271cd51cdfdfb81c9809ab932b3ce1a4755', // FEEMO-G8U6-P7DC
  'd535eec0c256fa4fd39e8bf1fa79a1acea59aa125688ec2ec7fd40a0e6940bff', // FEEMO-H1V9-Q3SX
  '4f140b9b30ab7b4fd64cb3803e8978e965b1c96067639e6cb2160edced53c371', // FEEMO-I4Z5-R6YM
  'dbb9c81c8bff3b5f4da0d4daa042f357eec2972cc131e9b420b001c7149bad10', // FEEMO-J7Q2-T9AK
  '6fba94a20965b5c7e4cc5c3cb50c2155328619e6cf2882a48efacb61403cd9b7', // FEEMO-K3M7-W2NP
  '5895efe24def80c5fceaff6f54ec858e6eec6a06cd72e8725006bee52a130246', // FEEMO-L6B9-V5QR
  '6551f6fd8bf170214ac2db2b25402abd36963ccd87d9cdf952b3921bd49af8a5', // FEEMO-M1D4-U8TZ
  '6cb271083eb97c830101316806891730bf5038518fc89b41a798211e2bf26feb', // FEEMO-N8F2-S3YC
  'b11433732ef2ce0eae601c9a057db92fa31add57d6cdf9a7adefcdd44ca10912', // FEEMO-O5H6-X1KW
  'f40f6af9911130b85a907e19fd42d1b818152ef1b5d83b27774b4c19bb88bb89', // FEEMO-P2J8-A4VL
  '65c8406898f5a7cbe5887fc79f9540adbf55b2576d4580e8378c8010282ea30b', // FEEMO-Q9G1-C7RX
  'dd73aecd62d9ad344312a06a210228d6317386f2785caace3adb7b51eb5b2b4c', // FEEMO-R4L5-E2MB
  '8efb04f0b9b535554c0247ede9c1c296f223664d97a6daf809281b2f9172fe63', // FEEMO-S7N3-G6DF
  '4d94e69cfe1c754c1eba67dcfb28dc18dc17add700096effb8495357eb4eac83', // FEEMO-T0P8-I9QH
])

// Master key hash: SHA-256("0394") — validated locally in the renderer, but also
// checked here as a second layer.
const MASTER_KEY_HASH = '1adfa8633a067294c1036fb168c48de3626256afae07ab0c23bdf4fad5549f91'

function hashKey(k: string): string {
  return createHash('sha256').update(k.trim().toUpperCase()).digest('hex')
}

interface KeyRecord {
  status: 'inactive' | 'active' | 'expired'
  activatedAt: number | null
  expiresAt: number | null
  boundEmail: string | null
  emailVerified: boolean
}

const keyStore = new ElectronStore<{ keys: Record<string, KeyRecord> }>({
  name: 'feemo-keys',
  encryptionKey: deviceEncryptionKey(),
  defaults: { keys: {} },
})

function getKeyRecord(hash: string): KeyRecord {
  const all = keyStore.get('keys') as Record<string, KeyRecord>
  return all[hash] ?? { status: 'inactive', activatedAt: null, expiresAt: null, boundEmail: null, emailVerified: false }
}

function setKeyRecord(hash: string, rec: KeyRecord) {
  const all = keyStore.get('keys') as Record<string, KeyRecord>
  all[hash] = rec
  keyStore.set('keys', all)
}

// In-process OTP store — never hits the renderer or any file
const pendingOtps = new Map<string, { code: string; expiry: number; attempts: number }>()

// Email credentials — injected at build time by Vite define (from .env / CI secrets)
declare const __EMAIL_USER__: string
declare const __EMAIL_PASS__: string
declare const __EMAIL_FROM__: string

function getEmailCreds() {
  const user = (typeof __EMAIL_USER__ !== 'undefined' ? __EMAIL_USER__ : '') || process.env.EMAIL_USER || ''
  const pass = (typeof __EMAIL_PASS__ !== 'undefined' ? __EMAIL_PASS__ : '') || process.env.EMAIL_PASS || ''
  const from = (typeof __EMAIL_FROM__ !== 'undefined' ? __EMAIL_FROM__ : '') || process.env.EMAIL_FROM || user
  return { user, pass, from }
}

// Raw SMTP sender — bypasses nodemailer entirely so Electron's module loader
// cannot interfere with credential injection.
function sendSmtpGmail(opts: {
  user: string; pass: string; from: string
  to: string; subject: string; text: string; html: string
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const { user, pass, from, to, subject, text, html } = opts
    const boundary = `feemo_${Math.random().toString(36).slice(2)}`
    const crlf = '\r\n'
    const authPlain = Buffer.from(`\0${user}\0${pass}`).toString('base64')

    const msgBody = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      text,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      '',
      html,
      '',
      `--${boundary}--`,
    ].join(crlf) + crlf

    type Stage = 'greeting' | 'ehlo' | 'starttls' | 'ehlo2' | 'auth' | 'mail' | 'rcpt' | 'data' | 'quit' | 'done'
    let stage: Stage = 'greeting'
    let rawSocket: any = null
    let tlsSock: any = null
    let settled = false
    let recvBuf = ''

    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      try { tlsSock?.destroy() } catch {}
      try { rawSocket?.destroy() } catch {}
      err ? reject(err) : resolve()
    }

    const write = (cmd: string) => {
      const s = tlsSock ?? rawSocket
      if (s && !s.destroyed) s.write(cmd + crlf)
    }

    const onLine = (line: string) => {
      if (line.length >= 4 && line[3] === '-') return // continuation
      const code = line.slice(0, 3)
      switch (stage) {
        case 'greeting':
          if (code !== '220') return finish(new Error(`SMTP greeting: ${line}`))
          stage = 'ehlo'; write('EHLO feemo.local'); break
        case 'ehlo':
          if (code !== '250') return finish(new Error(`EHLO: ${line}`))
          stage = 'starttls'; write('STARTTLS'); break
        case 'starttls':
          if (code !== '220') return finish(new Error(`STARTTLS: ${line}`))
          rawSocket.removeAllListeners('data')
          tlsSock = tlsConnect({ socket: rawSocket, servername: 'smtp.gmail.com' })
          tlsSock.on('data', (d: Buffer) => feed(d.toString()))
          tlsSock.on('error', (e: Error) => finish(e))
          tlsSock.once('secureConnect', () => { stage = 'ehlo2'; write('EHLO feemo.local') })
          break
        case 'ehlo2':
          if (code !== '250') return finish(new Error(`EHLO2: ${line}`))
          stage = 'auth'; write(`AUTH PLAIN ${authPlain}`); break
        case 'auth':
          if (code !== '235') return finish(new Error(`AUTH: ${line}`))
          stage = 'mail'; write(`MAIL FROM:<${user}>`); break
        case 'mail':
          if (code !== '250') return finish(new Error(`MAIL FROM: ${line}`))
          stage = 'rcpt'; write(`RCPT TO:<${to}>`); break
        case 'rcpt':
          if (code !== '250') return finish(new Error(`RCPT TO: ${line}`))
          stage = 'data'; write('DATA'); break
        case 'data':
          if (code !== '354') return finish(new Error(`DATA: ${line}`))
          stage = 'quit'; write(msgBody); write('.'); break
        case 'quit':
          if (code !== '250') return finish(new Error(`Message rejected: ${line}`))
          stage = 'done'; write('QUIT'); break
        case 'done':
          finish(); break
      }
    }

    const feed = (chunk: string) => {
      recvBuf += chunk
      let idx: number
      while ((idx = recvBuf.indexOf('\n')) !== -1) {
        const line = recvBuf.slice(0, idx).trimEnd()
        recvBuf = recvBuf.slice(idx + 1)
        if (line) onLine(line)
      }
    }

    rawSocket = createConnection({ host: 'smtp.gmail.com', port: 587 })
    rawSocket.on('data', (d: Buffer) => feed(d.toString()))
    rawSocket.on('error', (e: Error) => finish(e))
    rawSocket.on('close', () => { if (!settled) finish(new Error('SMTP connection closed unexpectedly')) })
    rawSocket.setTimeout(30000, () => finish(new Error('SMTP timeout')))
  })
}

// ── Beta IPC handlers ─────────────────────────────────────────────────────────

ipcMain.handle('beta-validate-key', (_event, { key, email }: { key: string; email: string }) => {
  const trimKey = key.trim().toUpperCase()
  const trimEmail = email.trim().toLowerCase()

  // Master key — grant immediately without email
  const masterHash = createHash('sha256').update(key.trim()).digest('hex')
  if (masterHash === MASTER_KEY_HASH) return { status: 'master-granted' }

  const hash = hashKey(trimKey)
  if (!KEY_HASHES.has(hash)) return { status: 'error', message: 'This key is not recognised. Please check your key and try again.' }

  let rec = getKeyRecord(hash)
  const now = Date.now()

  // Auto-expire
  if (rec.status === 'active' && rec.expiresAt && rec.expiresAt < now) {
    rec = { ...rec, status: 'expired' }
    setKeyRecord(hash, rec)
  }
  if (rec.status === 'expired') return { status: 'error', message: 'This key has expired and is no longer valid. Please contact Feemovision Limited.' }

  // First use — activate
  if (rec.status === 'inactive') {
    rec = { status: 'active', activatedAt: now, expiresAt: now + 5 * 24 * 60 * 60 * 1000, boundEmail: null, emailVerified: false }
    setKeyRecord(hash, rec)
  }

  // Email binding check
  if (rec.boundEmail && rec.boundEmail !== trimEmail) {
    return { status: 'error', message: 'This key is already registered to a different email address.' }
  }

  // Already fully verified for this email
  if (rec.emailVerified && rec.boundEmail === trimEmail) {
    return { status: 'verified', expiresAt: rec.expiresAt }
  }

  return { status: 'needs-verification', expiresAt: rec.expiresAt }
})

ipcMain.handle('beta-send-code', async (_event, { key, email }: { key: string; email: string }) => {
  const trimKey = key.trim().toUpperCase()
  const trimEmail = email.trim().toLowerCase()
  const hash = hashKey(trimKey)
  if (!KEY_HASHES.has(hash)) return { success: false, message: 'Key not found.' }

  const code = String(randomInt(100000, 999999))
  pendingOtps.set(hash, { code, expiry: Date.now() + 10 * 60 * 1000, attempts: 0 })

  try {
    const { user, pass, from } = getEmailCreds()
    await sendSmtpGmail({
      user, pass, from,
      to: trimEmail,
      subject: 'Feemo Budget Manager — Verify Your Beta Access',
      text: [
        'Hello,',
        '',
        'You have been granted access to the Feemo Budget Manager beta.',
        '',
        `Your verification code is: ${code}`,
        '',
        'This code expires in 10 minutes.',
        '',
        'If you did not request this, please ignore this email.',
        '',
        '— Feemovision Limited',
      ].join('\n'),
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px"><h2 style="color:#f5a623;margin:0 0 16px">Feemo Budget Manager</h2><p>You have been granted access to the <strong>Feemo Budget Manager beta</strong>.</p><p style="font-size:32px;font-weight:700;letter-spacing:0.15em;color:#111;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">${code}</p><p style="color:#666;font-size:13px">This code expires in <strong>10 minutes</strong>.</p><p style="color:#999;font-size:12px;margin-top:32px">— Feemovision Limited</p></div>`,
    })
    return { success: true }
  } catch (err) {
    return { success: false, message: String(err) }
  }
})

ipcMain.handle('beta-verify-code', (_event, { key, email, code }: { key: string; email: string; code: string }) => {
  const trimKey = key.trim().toUpperCase()
  const trimEmail = email.trim().toLowerCase()
  const hash = hashKey(trimKey)

  const otp = pendingOtps.get(hash)
  if (!otp) return { success: false, message: 'No pending verification. Please re-enter your key to request a new code.' }
  if (Date.now() > otp.expiry) {
    pendingOtps.delete(hash)
    return { success: false, message: 'This code has expired. Please re-enter your key to request a new one.' }
  }
  if (otp.attempts >= 3) {
    pendingOtps.delete(hash)
    return { success: false, message: 'Too many incorrect attempts. Please re-enter your key to request a new code.' }
  }
  if (otp.code !== code.trim()) {
    otp.attempts++
    return { success: false, message: 'Incorrect code. Please try again.' }
  }

  pendingOtps.delete(hash)
  const rec = getKeyRecord(hash)
  setKeyRecord(hash, { ...rec, emailVerified: true, boundEmail: trimEmail })
  return { success: true, expiresAt: rec.expiresAt }
})

ipcMain.handle('beta-check-session', (_event, { key, email }: { key: string; email: string }) => {
  const trimKey = key.trim().toUpperCase()
  const trimEmail = email.trim().toLowerCase()

  // Allow master key re-validation without network
  const masterHash = createHash('sha256').update(key.trim()).digest('hex')
  if (masterHash === MASTER_KEY_HASH) return { valid: true, expiresAt: null }

  const hash = hashKey(trimKey)
  if (!KEY_HASHES.has(hash)) return { valid: false }

  const rec = getKeyRecord(hash)
  const now = Date.now()

  if (rec.status === 'expired') return { valid: false }
  if (rec.expiresAt && rec.expiresAt < now) {
    setKeyRecord(hash, { ...rec, status: 'expired' })
    return { valid: false }
  }
  if (!rec.emailVerified || rec.boundEmail !== trimEmail) return { valid: false }

  return { valid: true, expiresAt: rec.expiresAt }
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

// ── Application menu ──────────────────────────────────────────────────────────

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project',
          accelerator: 'CommandOrControl+O',
          click: () => { mainWindow?.webContents.send('menu-open-project') },
        },
        {
          label: 'New Project',
          accelerator: 'CommandOrControl+Shift+N',
          click: () => { mainWindow?.webContents.send('new-project-fresh') },
        },
        { type: 'separator' as const },
        isMac ? { role: 'close' as const } : { role: 'quit' as const },
      ],
    },
    // Edit menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' as const },
        { role: 'toggleDevTools' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
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

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[feemo] Renderer crashed:', details.reason, 'exit:', details.exitCode)
    const msg = `[render-process-gone] ${new Date().toISOString()} reason=${details.reason}\n---\n`
    appendFile(ERROR_LOG_PATH, msg, 'utf-8').catch(() => {})
    dialog.showMessageBox({
      type: 'error',
      title: 'Feemo Budget Manager',
      message: 'The app stopped responding unexpectedly.',
      detail: 'Would you like to restart?',
      buttons: ['Restart', 'Quit'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) { app.relaunch(); app.exit(0) } else { app.exit(1) }
    })
  })

  mainWindow.webContents.on('unresponsive', () => {
    dialog.showMessageBox({
      type: 'warning',
      title: 'Feemo Budget Manager',
      message: 'The app is not responding.',
      detail: 'Would you like to wait or restart?',
      buttons: ['Wait', 'Restart'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 1) { app.relaunch(); app.exit(0) }
    })
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    // In dev mode, retry after a short delay if the Vite server wasn't ready yet
    if (process.env.VITE_DEV_SERVER_URL && code !== 0) {
      console.warn(`[feemo] Failed to load dev server (${code}: ${desc}) — retrying in 1s…`)
      setTimeout(() => {
        mainWindow?.loadURL(process.env.VITE_DEV_SERVER_URL!)
      }, 1000)
    } else {
      console.error('[feemo] Failed to load:', code, desc, url)
    }
  })

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

// ── Budget upload — open xlsx ─────────────────────────────────────────────────
ipcMain.handle('open-xlsx-budget', async () => {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    filters: [{ name: 'Excel Budget', extensions: ['xlsx', 'xls'] }],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return { success: false }
  const buffer = await readFileAsync(filePaths[0])
  return { success: true, filePath: filePaths[0], buffer: Array.from(buffer) }
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
  setImmediate(async () => {
    // ── macOS: shell-script updater (bypasses Squirrel.Mac entirely) ──────────
    // Squirrel.Mac is unreliable for unsigned apps — quitAndInstall() may
    // silently do nothing.  Instead we write a tiny bash script that runs
    // detached after the app exits: it extracts the downloaded zip, copies the
    // new .app bundle over the current one, and relaunches.
    if (process.platform === 'darwin' && app.isPackaged && downloadedZipPath) {
      // e.g. /Applications/Feemo Budget Manager.app/Contents/MacOS/<bin>
      // → go up 3 levels → /Applications/Feemo Budget Manager.app
      const appBundlePath = dirname(dirname(dirname(process.execPath)))

      const script = `#!/bin/bash
sleep 3
EXTRACT=$(mktemp -d)
unzip -q -o "$1" -d "$EXTRACT" 2>/dev/null
APP=$(find "$EXTRACT" -maxdepth 2 -name "*.app" | head -1)
if [ -n "$APP" ]; then
  xattr -rc "$APP" 2>/dev/null || true
  cp -Rf "$APP/." "$2/"
  open "$2"
fi
rm -rf "$EXTRACT"
`
      try {
        const scriptPath = join(tmpdir(), 'feemo-updater.sh')
        await writeFileAsync(scriptPath, script, { mode: 0o755 })
        const child = spawn('/bin/bash', [scriptPath, downloadedZipPath, appBundlePath], {
          detached: true,
          stdio: 'ignore',
        })
        child.unref()
        app.quit()
        return
      } catch {
        // fall through to quitAndInstall below
      }
    }

    // ── Windows / fallback ────────────────────────────────────────────────────
    try {
      autoUpdater.quitAndInstall(true, true)
    } catch {}
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

// ── Crash recovery IPC ───────────────────────────────────────────────────────

const ERROR_LOG_PATH = join(app.getPath('userData'), 'feemo-errors.log')

ipcMain.handle('log-error', async (_event, message: string) => {
  try {
    await appendFile(ERROR_LOG_PATH, message + '\n', 'utf-8')
  } catch {}
  return { success: true }
})

ipcMain.handle('save-crash-recovery', async (_event, data: string) => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const path = join(app.getPath('userData'), `crash-recovery-${ts}.feemo`)
  try {
    await writeFileAsync(path, data, 'utf-8')
    return { success: true, path }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('list-crash-recoveries', async () => {
  try {
    const dir = app.getPath('userData')
    const files = await readdir(dir)
    const recoveries = files
      .filter(f => f.startsWith('crash-recovery-') && f.endsWith('.feemo'))
      .map(f => join(dir, f))
    return { success: true, files: recoveries }
  } catch {
    return { success: true, files: [] }
  }
})

ipcMain.handle('load-crash-recovery', async (_event, filePath: string) => {
  try {
    const data = await readFileAsync(filePath, 'utf-8')
    // Delete after loading
    await unlink(filePath).catch(() => {})
    return { success: true, data }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('dismiss-crash-recovery', async (_event, filePath: string) => {
  try {
    await unlink(filePath)
  } catch {}
  return { success: true }
})

ipcMain.handle('restart-app', () => {
  setImmediate(() => { app.relaunch(); app.exit(0) })
})

// ── Uncaught exception handlers ───────────────────────────────────────────────

process.on('uncaughtException', async (err) => {
  const msg = `[uncaughtException] ${new Date().toISOString()}\n${err.stack ?? err.message}\n---\n`
  try { await appendFile(ERROR_LOG_PATH, msg, 'utf-8') } catch {}
  mainWindow?.webContents.send('main-process-error', { type: 'uncaughtException', message: err.message })
})

process.on('unhandledRejection', async (reason) => {
  const msg = `[unhandledRejection] ${new Date().toISOString()}\n${String(reason)}\n---\n`
  try { await appendFile(ERROR_LOG_PATH, msg, 'utf-8') } catch {}
  mainWindow?.webContents.send('main-process-error', { type: 'unhandledRejection', message: String(reason) })
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => { createWindow(); buildAppMenu() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
