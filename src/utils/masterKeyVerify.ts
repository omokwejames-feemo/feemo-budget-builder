// Master key verification — hash only, no plain-text key ever stored here
const _mk = ['1adfa8633a067294c1036fb168c48de3', '626256afae07ab0c23bdf4fad5549f91']

async function digest(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function isMasterKey(input: string): Promise<boolean> {
  const h = await digest(input.trim())
  return h === _mk.join('')
}
