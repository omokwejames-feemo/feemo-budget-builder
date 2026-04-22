// Access verification — do not store the raw key here
const _av = ['03ac674216f3e15c761ee1a5e255f067', '953623c8b388b4459e13f978d7c846f4']

async function digest(input: string): Promise<string> {
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(input))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyAccessKey(input: string): Promise<boolean> {
  const h = await digest(input.trim())
  return h === _av.join('')
}
