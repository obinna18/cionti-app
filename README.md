# Cionti 🌍
## Community Of Talent In One Network

A full-stack, map-first platform for connecting skilled people locally in Nigeria.

---

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS — hostable on GitHub Pages (zero cost)
- **Maps:** Leaflet.js + OpenStreetMap + MarkerCluster (free, no API key)
- **Backend:** Firebase (Auth, Firestore, Storage, Cloud Messaging)
- **Payments:** Paystack escrow system
- **Location:** HTML5 Geolocation + Nominatim reverse geocoding (free)

---

## Deploy in 10 Minutes

### 1. Firebase Setup
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Create Project → name it `cionti`
3. Add Web App → copy config values
4. Paste config into `firebase-config.js`
5. Enable in Firebase Console:
   - **Authentication** → Sign-in methods → Enable: Email/Password, Google, Phone
   - **Firestore Database** → Create database → Start in test mode
   - **Storage** → Get started → Start in test mode
   - **Cloud Messaging** → Copy your VAPID key → paste in `js/app.js` line ~392

### 2. Paystack Setup
1. Go to [https://dashboard.paystack.com](https://dashboard.paystack.com)
2. Register/login → Settings → API Keys
3. Copy your **Public Key** (use test key first: `pk_test_...`)
4. Paste into `js/app.js` at `S.paystackKey` (line ~27)
5. For live payments change to `pk_live_...`

### 3. Firestore Rules
In Firebase Console → Firestore → Rules tab → paste the rules from `firebase-config.js` comments → Publish

### 4. Firestore Indexes (create when prompted)
Firebase will prompt you in browser console if compound indexes are needed. Click the link it provides.

### 5. GitHub Pages Deploy
```bash
git init
git add .
git commit -m "Cionti v1.0 — Community Of Talent In One Network"
git remote add origin https://github.com/YOUR_USERNAME/cionti.git
git push -u origin main
```
Then: GitHub → Repo Settings → Pages → Source: main branch → / (root) → Save

**Live at:** `https://YOUR_USERNAME.github.io/cionti`

### 6. Firebase Auth Domain (Important!)
In Firebase Console → Authentication → Settings → Authorized domains → Add:
`YOUR_USERNAME.github.io`

---

## Features

| Feature | Status |
|---------|--------|
| Email/Password auth | ✅ |
| Google OAuth | ✅ |
| Phone SMS OTP (Firebase) | ✅ |
| Map view with clustering | ✅ |
| List view with filters | ✅ |
| Radius search slider | ✅ |
| Haversine distance sorting | ✅ |
| Post/edit/delete skills | ✅ |
| View provider profile | ✅ |
| Send service requests | ✅ |
| Accept/decline requests | ✅ |
| Real-time chat | ✅ |
| Image sharing in chat | ✅ |
| Star ratings & reviews | ✅ |
| Trust Score algorithm | ✅ |
| Referral system | ✅ |
| Paystack escrow payment | ✅ |
| Wallet & earnings | ✅ |
| Push notifications (FCM) | ✅ |
| Profile photo upload | ✅ |
| Portfolio image per skill | ✅ |
| Auto location detection | ✅ |
| Notification center | ✅ |
| Settings panel | ✅ |
| PWA installable | ✅ |

---

## Data Model

```
users/{uid}
  fullName, email, phone, userType
  bio, city, state, lat, lng
  profileImageUrl, isAvailable
  averageRating, totalRatings, completedJobs
  referralCount, trustScore
  walletBalance, escrowBalance
  fcmToken, setupComplete

skills/{id}
  userId, title, category, description
  priceType, price, serviceType, tags
  portfolioImageUrl, city, state, lat, lng
  isActive, viewCount, createdAt

requests/{id}
  seekerId, seekerName, providerId, providerName
  skillId, skillTitle, message, status
  payment: { status, amount, paystackRef }
  reviewed, createdAt

chats/{chatId}
  participants: [uid1, uid2]
  lastMessage, lastMessageTime
  unreadCount: { uid: count }
  messages/{msgId}
    senderId, text, imageUrl, type, timestamp, read

reviews/{id}
  reviewerId, revieweeId, requestId
  rating, comment, createdAt

referrals/{id}
  referrerId, referredId, context, createdAt

notifications/{id}
  toUid, fromUid, type, message, read, createdAt

transactions/{id}
  uid, type, amount, requestId, paystackRef
  status, createdAt
```

---

## Trust Score Formula
```
Trust Score (0-100) =
  Rating × 30  (max 30)    — quality of work
  Jobs × 2     (max 30)    — experience
  Referrals × 5 (max 20)   — community vouching
  Profile completeness × 20 — professionalism
```

---

## Roadmap

**v1.1 (next)**
- Social login: Apple Sign-In
- Portfolio gallery (multiple images per skill)
- Location verification badge
- Skill endorsements

**v1.2**
- Bidding system (providers bid on seeker posts)
- Video intro (30s max)
- Community boards per city
- Seeker posts ("I need a plumber in Effurun")

**v2.0 (June 2027 launch)**
- Native Android app (Android Studio)
- Multilingual: English + Pidgin
- Referral earnings program
- Verified professional badges
- In-app calls

---

*Built for Nigeria. Built for everyone — from the artisan to the architect.*
*Cionti — Community Of Talent In One Network*
