# Firebase Cloud Functions — Deployment Guide

## 1. Firebase project setup
1. Go to console.firebase.google.com
2. Create a new project (e.g. `feemo-beta`)
3. Enable Firestore Database (start in production mode)
4. Create a Web app and copy the config values into `.env` in the app root

## 2. Environment file
Create `/Users/jamesomokwe/Documents/feemo-budget-builder/.env` with:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Gmail app password
1. Enable 2FA on the Gmail account you will use for sending
2. Go to myaccount.google.com → Security → App Passwords
3. Generate a password for "Mail"

## 4. Deploy functions
```bash
cd functions
npm install
firebase login
firebase use --add   # select your project
firebase functions:config:set \
  email.user="yourapp@gmail.com" \
  email.pass="your-app-password" \
  email.from="Feemovision <yourapp@gmail.com>"
npm run deploy
```

## 5. Firestore — pre-populate beta keys
In the Firebase console, go to Firestore → betaKeys collection.
Create one document per key using the key string as the document ID:
```json
{
  "key": "FEEMO-A7K2-M9PQ",
  "status": "inactive",
  "activatedAt": null,
  "expiresAt": null,
  "boundEmail": null,
  "emailVerified": false
}
```
Repeat for all 20 keys.

## 6. Firestore security rules
In the Firebase console → Firestore → Rules, paste:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```
All access goes through Cloud Functions (Admin SDK bypasses rules).
