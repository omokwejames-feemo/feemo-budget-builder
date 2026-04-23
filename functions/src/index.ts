// Feemo Budget Manager — Beta Key Cloud Functions
// Deploy: cd functions && npm run deploy
//
// Required environment variables (set via: firebase functions:config:set or .env):
//   EMAIL_USER   — Gmail address used to send verification emails
//   EMAIL_PASS   — Gmail app password (not your account password)
//   EMAIL_FROM   — Display sender, e.g. "Feemovision <noreply@feemovision.com>"
//
// Firestore security rules must deny ALL direct client access to betaKeys collection.

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as nodemailer from 'nodemailer'
import * as crypto from 'crypto'

admin.initializeApp()
const db = admin.firestore()

function makeTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  })
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999))
}

// ── validateBetaKey ───────────────────────────────────────────────────────────
// Client calls this first. Returns the key's current status without exposing
// the verification code or any sensitive fields.
export const validateBetaKey = functions.https.onCall(async (data) => {
  const { key, email } = data as { key: string; email: string }

  if (!key || !email) throw new functions.https.HttpsError('invalid-argument', 'Key and email required.')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new functions.https.HttpsError('invalid-argument', 'Invalid email address.')

  const keyStr = key.trim().toUpperCase()
  const ref = db.collection('betaKeys').doc(keyStr)
  const snap = await ref.get()

  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'This key is not recognised. Please check your key and try again.')

  const kd = snap.data()!
  const now = admin.firestore.Timestamp.now()

  // Auto-expire if past expiresAt
  if (kd.status === 'active' && kd.expiresAt && kd.expiresAt.toMillis() < now.toMillis()) {
    await ref.update({ status: 'expired' })
    throw new functions.https.HttpsError('permission-denied', 'This key has expired and is no longer valid. Please contact Feemovision Limited.')
  }
  if (kd.status === 'expired') throw new functions.https.HttpsError('permission-denied', 'This key has expired and is no longer valid. Please contact Feemovision Limited.')

  // First use — activate the key
  if (kd.status === 'inactive') {
    const activatedAt = now
    const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 5 * 24 * 60 * 60 * 1000)
    await ref.update({ status: 'active', activatedAt, expiresAt })
  }

  // Check email binding
  if (kd.boundEmail && kd.boundEmail !== email.toLowerCase()) {
    throw new functions.https.HttpsError('permission-denied', 'This key is already registered to a different email address.')
  }

  // Already fully verified
  if (kd.emailVerified && kd.boundEmail === email.toLowerCase()) {
    return { status: 'verified', expiresAt: kd.expiresAt?.toMillis() ?? null }
  }

  return { status: 'needs-verification', expiresAt: kd.expiresAt?.toMillis() ?? null }
})

// ── sendVerificationCode ──────────────────────────────────────────────────────
// Generates a 6-digit OTP, stores it in Firestore (never returned to client),
// and emails it to the tester.
export const sendVerificationCode = functions.https.onCall(async (data) => {
  const { key, email } = data as { key: string; email: string }
  if (!key || !email) throw new functions.https.HttpsError('invalid-argument', 'Key and email required.')

  const keyStr = key.trim().toUpperCase()
  const ref = db.collection('betaKeys').doc(keyStr)
  const snap = await ref.get()
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Key not found.')

  const code = generateCode()
  const expiry = admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000)

  await ref.update({
    verificationCode: code,
    verificationCodeExpiry: expiry,
    verificationAttempts: 0,
  })

  const transport = makeTransport()
  await transport.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
    to: email,
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
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#f5a623;margin:0 0 16px">Feemo Budget Manager</h2>
        <p>You have been granted access to the <strong>Feemo Budget Manager beta</strong>.</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:0.15em;color:#111;background:#f5f5f5;padding:16px;border-radius:8px;text-align:center">${code}</p>
        <p style="color:#666;font-size:13px">This code expires in <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
        <p style="color:#999;font-size:12px;margin-top:32px">— Feemovision Limited</p>
      </div>
    `,
  })

  return { sent: true }
})

// ── verifyCode ────────────────────────────────────────────────────────────────
// Validates the OTP. The code is NEVER returned to the client — only a
// success/failure result is sent. Updates Firestore on success.
export const verifyCode = functions.https.onCall(async (data) => {
  const { key, email, code } = data as { key: string; email: string; code: string }
  if (!key || !email || !code) throw new functions.https.HttpsError('invalid-argument', 'Key, email and code required.')

  const keyStr = key.trim().toUpperCase()
  const ref = db.collection('betaKeys').doc(keyStr)
  const snap = await ref.get()
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Key not found.')

  const kd = snap.data()!
  const now = Date.now()

  if (!kd.verificationCode || !kd.verificationCodeExpiry) {
    throw new functions.https.HttpsError('failed-precondition', 'No pending verification. Please request a new code.')
  }
  if (kd.verificationCodeExpiry.toMillis() < now) {
    throw new functions.https.HttpsError('deadline-exceeded', 'This code has expired. Please re-enter your key to request a new one.')
  }

  const attempts: number = kd.verificationAttempts ?? 0
  if (attempts >= 3) {
    throw new functions.https.HttpsError('resource-exhausted', 'Too many incorrect attempts. Please re-enter your key to request a new code.')
  }

  if (kd.verificationCode !== code.trim()) {
    await ref.update({ verificationAttempts: attempts + 1 })
    throw new functions.https.HttpsError('invalid-argument', 'Incorrect code. Please try again.')
  }

  // Success — bind email and mark verified, clear OTP fields
  await ref.update({
    emailVerified: true,
    boundEmail: email.toLowerCase(),
    verificationCode: admin.firestore.FieldValue.delete(),
    verificationCodeExpiry: admin.firestore.FieldValue.delete(),
    verificationAttempts: admin.firestore.FieldValue.delete(),
  })

  const expiresAt = kd.expiresAt?.toMillis() ?? null
  return { verified: true, expiresAt }
})

// ── checkSession ──────────────────────────────────────────────────────────────
// Silent background re-validation on subsequent launches.
export const checkSession = functions.https.onCall(async (data) => {
  const { key, email } = data as { key: string; email: string }
  if (!key || !email) throw new functions.https.HttpsError('invalid-argument', 'Key and email required.')

  const keyStr = key.trim().toUpperCase()
  const ref = db.collection('betaKeys').doc(keyStr)
  const snap = await ref.get()
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Key not found.')

  const kd = snap.data()!
  const now = admin.firestore.Timestamp.now()

  if (kd.status === 'expired') throw new functions.https.HttpsError('permission-denied', 'expired')
  if (kd.expiresAt && kd.expiresAt.toMillis() < now.toMillis()) {
    await ref.update({ status: 'expired' })
    throw new functions.https.HttpsError('permission-denied', 'expired')
  }
  if (!kd.emailVerified) throw new functions.https.HttpsError('permission-denied', 'not-verified')
  if (kd.boundEmail !== email.toLowerCase()) throw new functions.https.HttpsError('permission-denied', 'email-mismatch')

  return { valid: true, expiresAt: kd.expiresAt?.toMillis() ?? null }
})
