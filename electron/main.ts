import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { writeFile, readFile } from 'fs/promises'

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

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
