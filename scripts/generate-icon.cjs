// Generates feemo-icon-1024.png using only Node.js builtins (no external deps)
const fs   = require('fs')
const path = require('path')
const zlib = require('zlib')

// ─── CRC32 ────────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const body = Buffer.concat([t, data])
  const out = Buffer.alloc(4 + 4 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  t.copy(out, 4); data.copy(out, 8)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

// ─── PNG writer ───────────────────────────────────────────────────────────────
function writePNG(filePath, W, H, pixels /* Uint8Array RGBA */) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0

  const stride = 1 + W * 4
  const raw = Buffer.alloc(H * stride)
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0          // filter: None
    pixels.copy(raw, y * stride + 1, y * W * 4, (y + 1) * W * 4)
  }
  const compressed = zlib.deflateSync(raw, { level: 6 })

  const buf = Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(filePath, buf)
}

// ─── Drawing primitives ───────────────────────────────────────────────────────
function blend(pixels, W, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= W) return
  const i = (y * W + x) * 4
  const sa = a / 255, da = 1 - sa
  pixels[i]   = (r * sa + pixels[i]   * da) | 0
  pixels[i+1] = (g * sa + pixels[i+1] * da) | 0
  pixels[i+2] = (b * sa + pixels[i+2] * da) | 0
  pixels[i+3] = Math.min(255, pixels[i+3] + a * (1 - pixels[i+3] / 255)) | 0
}

function fillRect(p, W, x, y, w, h, r, g, b) {
  for (let py = Math.max(0,y); py < Math.min(W, y+h); py++)
    for (let px = Math.max(0,x); px < Math.min(W, x+w); px++)
      blend(p, W, px, py, r, g, b, 255)
}

function fillRoundedRect(p, W, x, y, w, h, rad, r, g, b) {
  // body strips
  fillRect(p, W, x+rad, y,    w-2*rad, h,       r, g, b)
  fillRect(p, W, x,     y+rad, rad,    h-2*rad, r, g, b)
  fillRect(p, W, x+w-rad, y+rad, rad, h-2*rad, r, g, b)
  // four corners
  const corners = [[x+rad,y+rad],[x+w-rad,y+rad],[x+rad,y+h-rad],[x+w-rad,y+h-rad]]
  for (const [cx,cy] of corners) {
    for (let py = cy-rad-1; py <= cy+rad+1; py++) {
      for (let px = cx-rad-1; px <= cx+rad+1; px++) {
        const dist = Math.sqrt((px-cx)**2 + (py-cy)**2)
        if (dist <= rad-0.5) blend(p, W, px, py, r, g, b, 255)
        else if (dist < rad+0.5) blend(p, W, px, py, r, g, b, ((rad+0.5-dist)*255)|0)
      }
    }
  }
}

// ─── Icon design ──────────────────────────────────────────────────────────────
const W = 1024
const pixels = Buffer.alloc(W * W * 4, 0)

// Brand colours
const [nR,nG,nB] = [0x1B, 0x2A, 0x4A]   // navy
const [gR,gG,gB] = [0xF5, 0xA6, 0x23]   // gold
const [wR,wG,wB] = [0xFF, 0xFF, 0xFF]   // white
const [dR,dG,dB] = [0x14, 0x1E, 0x36]   // deep navy (shadow)

// 1. Navy background
fillRect(pixels, W, 0, 0, W, W, nR, nG, nB)

// 2. Deep shadow blob (offset slightly down-right for depth)
fillRoundedRect(pixels, W, 96, 108, 844, 844, 144, dR, dG, dB)

// 3. Gold plate (main icon body)
fillRoundedRect(pixels, W, 80, 80, 864, 864, 144, gR, gG, gB)

// 4. The "F" letterform — white, bold
// Vertically centred in the plate; shifted left of centre for optical weight
const lx = 195          // left of vertical stroke
const lw = 112          // stroke width
const lt = 230          // top of F
const lb = lt + 560     // bottom of F (= 790)
const th = 100          // bar height
const midY = 468        // middle bar top

// Vertical stroke
fillRect(pixels, W, lx, lt, lw, lb-lt, wR, wG, wB)
// Top horizontal bar
fillRect(pixels, W, lx, lt, 450, th, wR, wG, wB)
// Middle horizontal bar
fillRect(pixels, W, lx, midY, 350, th, wR, wG, wB)

// 5. Rising bar chart — bottom-right quadrant, navy on gold
//    Three bars that don't overlap the F letterform
const bx = 600, by = 790    // baseline x/y
const barW = 62, barGap = 20
const barMaxH = 240
const bars = [0.42, 0.68, 1.0]

for (let b = 0; b < 3; b++) {
  const bh = (barMaxH * bars[b]) | 0
  const bxPos = bx + b * (barW + barGap)
  // dark background track
  fillRect(pixels, W, bxPos, by - barMaxH, barW, barMaxH, dR, dG, dB)
  // white fill = the "bar value"
  fillRect(pixels, W, bxPos, by - bh, barW, bh, wR, wG, wB)
}

// ─── Output ───────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'public')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
const outPath = path.join(outDir, 'icon-1024.png')
writePNG(outPath, W, W, pixels)
console.log('✓  icon-1024.png →', outPath)
