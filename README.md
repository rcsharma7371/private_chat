# Talk — Private 2-Person E2EE Chat & Call App

Talk is a production-quality, privacy-first, end-to-end encrypted (E2EE) 1-to-1 communication platform. Exactly two people can communicate through encrypted text chat and real-time voice/video calls using a shared room link and access code.

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Features](#2-features)
- [3. Security & Cryptographic Specifications](#3-security--cryptographic-specifications)
- [4. How to Run the Project](#4-how-to-run-the-project)
  - [Prerequisites](#prerequisites)
  - [Local Development Setup](#local-development-setup)
  - [Testing Between Two Devices (Phone + Laptop via Ngrok)](#testing-between-two-devices-phone--laptop-via-ngrok)
  - [Running the Test Suites](#running-the-test-suites)
  - [Docker Deployment](#docker-deployment)
- [5. MongoDB Atlas Setup](#5-mongodb-atlas-setup)
- [6. Threat Model & Security Boundaries](#6-threat-model--security-boundaries)

---

## 1. Architecture Overview

### Tech Stack

- **Frontend (`apps/web`)**:
  - React 18, TypeScript, Vite, Tailwind CSS, Zustand (state management), Lucide Icons.
  - Web Crypto API (`SubtleCrypto`) for client-side encryption.
  - `argon2-browser` (WASM) for client-side password stretching.
  - `socket.io-client` for real-time signaling and messaging relays.
  - Native WebRTC (`RTCPeerConnection`) with STUN/TURN fallback.
  - IndexedDB (via `idb`) for storing non-extractable device `CryptoKey`s and session keys.
- **Backend (`apps/server`)**:
  - Node.js, Express, TypeScript, Socket.IO.
  - Prisma ORM + MongoDB Atlas (or local replica set) with ACID multi-document transactions.
  - `argon2` for server-side verifier hashing.
  - `node-cron` for automated 30-day room crypto-shredding and TTL cleanups.
- **Shared Package (`packages/shared`)**:
  - Shared TypeScript types, Zod validation schemas, and cryptographic constants.

### Monorepo Structure

```text
talk/
├── packages/
│   └── shared/                 # Shared TypeScript types, Zod schemas, constants
├── apps/
│   ├── server/                 # Node.js + Express + Socket.IO + Prisma backend
│   │   ├── prisma/             # MongoDB schema & native index migrations
│   │   └── src/
│   │       ├── db.ts           # MongoDB connection & local replica set auto-fallback
│   │       ├── routes/         # REST endpoints (rooms, turn, health)
│   │       ├── sockets/        # Realtime messaging and encrypted WebRTC signaling
│   │       └── services/       # Room state, authentication, and cron cleanups
│   └── web/                    # React 18 + Vite frontend
│       └── src/
│           ├── crypto/         # Web Crypto, Argon2id WASM, IndexedDB storage
│           ├── state/          # Zustand stores (room, chat, call)
│           ├── services/       # REST API client, Socket.IO, WebRTC service
│           └── components/     # Room gate, Chat room, Call modal, Security drawer
├── coturn/                     # Optional Coturn TURN server configuration
├── docker-compose.yml          # Containerized setup for Coturn, Server, and Web
├── .env.example                # Environment variable template
└── README.md
```

---

## 2. Features

### Room Lifecycle & Access Control
- **State A (AVAILABLE)**: Create a fresh private room with a custom or random slug (`/r/:slug`). Rooms can be created directly with an access code or as link-only invitations.
- **State B (AWAITING_CODE)**: Shareable link-only room. The first participant to claim the link sets the access code, atomically transitioning the room to State C.
- **State C (PROTECTED)**: Both participant slots require the access code to join.
- **Brute-Force Lockout**: 5 failed access code attempts result in an exponential lockout to protect against dictionary attacks.
- **Strict 2-Person Boundary**: Exactly two slots (Slot 0 and Slot 1) are permitted. Any 3rd person attempting to enter is rejected with **HTTP 403 Forbidden**.
- **Device-Bound Slots**: When a participant joins, their device public key is registered in their slot. Re-joining later requires both the access code and the same device key, preventing slot hijacking.

### End-to-End Encrypted Chat
- **Client-Side AES-256-GCM**: Messages are encrypted directly on the client using Web Crypto API before leaving the browser. The server only receives and stores ciphertext bytes.
- **Monotonic Counters**: Every message increment counter is authenticated in the GCM Additional Authenticated Data (`AAD`), preventing replay and out-of-order injection attacks.
- **Disappearing / Ephemeral Messages**: Configurable message destruction timer (Off, 30s, 5m, 1h, 24h). Expired messages are automatically deleted from server storage via native MongoDB TTL indexes and purged from client stores.
- **Ephemeral Typing Indicators**: Peer typing events are relayed in real-time without database persistence.
- **Clipboard Leak Protection**: Copying decrypted message text displays an in-app security notice warning that the text has left the encrypted sandbox.

### Voice & Video Calling
- **DTLS-SRTP Media Encryption**: High-definition voice and video calls stream directly peer-to-peer or via encrypted TURN relays.
- **Encrypted Signaling**: WebRTC SDP offers, answers, and ICE candidates are encrypted client-side with AES-256-GCM before transmission over Socket.IO. The server cannot inspect call metadata or SDP profiles.
- **Cellular & Symmetric NAT Traversal**: Configured with Google STUN and Metered OpenRelay TURN servers on ports 80 and 443 (UDP and TCP fallback), enabling seamless calling across mobile cellular data (4G/5G CGNAT) and strict firewalls.
- **"Hide My IP" (Relay Only) Mode**: When enabled in the Security Drawer, forces `iceTransportPolicy: 'relay'`, preventing the peer from discovering your public IP address.
- **Resilient Media Fallbacks**: Automatically falls back to audio-only if video cameras are busy or restricted, and allows **receive-only mode** so you can still hear/see your peer even if your local media device is unavailable.
- **Autoplay Handling**: Handles mobile browser autoplay policies with an interactive tap-to-resume banner.

### Identity & Privacy Safeguards
- **Short Authentication String (SAS)**: Deterministic 6-digit number and emoji fingerprint computed from sorted public keys and the shared secret. Users compare this fingerprint out-of-band to guarantee protection against active Man-in-the-Middle (MITM) attacks.
- **Panic Burn Button**: One-click nuclear option in the Security Drawer permanently wipes the room, deletes all ciphertext messages from the database, shreds keys from IndexedDB, and terminates the session on both devices.
- **30-Day Auto-Purge**: Background cron job permanently deletes inactive rooms after 30 days and removes unclaimed links after 24 hours.
- **Hard Refresh Survival**: Persists room metadata in `localStorage` and non-extractable `CryptoKeyPair`s in `IndexedDB`, allowing seamless page reloads without re-entering passwords.
- **Mobile Responsive Design**: Full support for iOS and Android devices, including dynamic `100dvh` viewport heights, notch and home-indicator safe-area insets, touch-friendly copy buttons, and iOS Safari input zoom prevention.

---

## 3. Security & Cryptographic Specifications

```text
[User Code Input] ──> Argon2id (WASM, Client) ──> authVerifier (Sent to Server)
                                               ──> authKey (Kept in Client Memory)

[ECDH Exchange]   ──> Ephemeral P-256 Key Pair ──> HKDF Derivation:
                                                    ├─ messageKey   (AES-256-GCM)
                                                    ├─ signalingKey (AES-256-GCM)
                                                    ├─ sasSeed      (Safety Number)
                                                    └─ chainKey     (Forward Secrecy)

[Confirmation]    ──> HMAC-SHA256(authKey, slotIndex + ":" + ecdhPubKey)
                      (Guarantees zero MITM key substitution)
```

1. **Client-Side Code Stretching (Argon2id WASM)**:
   - Plaintext access codes are never transmitted to the server.
   - The browser stretches the code using `argon2-browser` (WASM) into:
     - `authVerifier`: Sent to the server, which hashes it with server-side `argon2id` before saving.
     - `authKey`: Kept exclusively in client memory to calculate code-bound HMAC confirmations.
2. **Code-Bound Peer Key Confirmation (MITM Defense)**:
   - Ephemeral session keys are established via ECDH (P-256).
   - Each participant sends an HMAC confirmation tag: `HMAC-SHA256(authKey, slotIndex + ":" + ecdhPubKey)`.
   - Even if an adversarial server attempts to substitute public keys in transit, the handshake fails because the server does not know `authKey`.
3. **Message Encryption (AES-256-GCM)**:
   - Unique random 96-bit IV per message.
   - Additional Authenticated Data (`AAD`): `${roomId}:${counter}`.
   - Replay protection enforced via strictly monotonic sequence counters.
4. **Non-Extractable Device Keys**:
   - Device identity keys are generated using ECDSA P-256 with `extractable: false` and stored in IndexedDB. Private keys cannot be exported or extracted by malicious scripts.
5. **Zero-Knowledge Server Storage**:
   - The server database only stores encrypted ciphertext, cryptographic initialization vectors, and Argon2 hashes. It has no mathematical means to read messages.

---

## 4. How to Run the Project

### Prerequisites

- **Node.js**: `v20.x` or higher
- **npm**: `v10.x` or higher
- **MongoDB**: MongoDB Atlas connection URI or local MongoDB instance (runs automatically with an in-memory replica set fallback for local development).

---

### Local Development Setup

1. **Clone the repository and install dependencies**:
   ```bash
   git clone <repo-url>
   cd talk
   npm install
   ```

2. **Configure Environment Variables**:
   Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
   *(The default `.env` is pre-configured for local development out of the box).*

3. **Build the packages**:
   ```bash
   npm run build
   ```

4. **Start the development servers**:
   ```bash
   npm run dev
   ```
   Or run the backend and frontend in separate terminal windows:
   ```bash
   # Terminal 1: Backend API & Sockets (port 4000)
   npm run dev:server

   # Terminal 2: Frontend Web App (port 5173)
   npm run dev:web
   ```

5. **Open the application**:
   - Navigate to `http://localhost:5173` in your browser.
   - Click **"Create Private Room"** to start a new encrypted space.

> **Note on Local MongoDB:** Prisma multi-document transactions require MongoDB to run as a replica set. In development mode (`NODE_ENV=development`), if your local MongoDB instance is standalone without `--replSet`, Talk **automatically initializes a local in-memory replica set fallback**, applying migrations and running seamlessly with zero manual database configuration!

---

### Testing Between Two Devices (Phone + Laptop via Ngrok)

To test encrypted messaging and WebRTC voice/video calling between two separate physical devices (e.g. laptop on Wi-Fi and phone on mobile 4G/5G data):

1. **Start the local dev servers**:
   ```bash
   npm run dev
   ```

2. **Expose the frontend via Ngrok**:
   ```bash
   ngrok http 5173
   ```
   *(Ngrok will provide an HTTPS URL like `https://xxxx-xxx-xxx.ngrok-free.dev`).*

3. **Allow Ngrok in Vite config** *(already configured)*:
   Vite is set up with `server.allowedHosts: true` and proxies `/api` and `/socket.io` to the backend on port 4000.

4. **Join the Room**:
   - **Device 1 (Laptop)**: Open `http://localhost:5173`, create a room, and set an access code.
   - **Device 2 (Phone)**: Open the **HTTPS** Ngrok URL (e.g. `https://xxxx-xxx-xxx.ngrok-free.dev/r/<room-slug>`), enter the access code, and join.
   *(Make sure to use `https://` on mobile so camera/mic permissions are granted by the browser).*

5. **Verify Real-Time Calling & Refresh**:
   - **Messages**: Type and send messages in real-time.
   - **Calls**: Tap the **Voice** or **Video** call button. Tap **Answer** on the other device — media will connect through the integrated TURN relay.
   - **Hard Refresh**: Refresh the page on either device — the session credentials and encryption keys will automatically restore without prompting for codes.

---

### Running the Test Suites

Talk includes automated unit and integration tests covering cryptographic operations, room lifecycle states, multi-document transaction concurrency, and brute-force defenses.

```bash
# Run all tests across the monorepo
npm run test

# Run frontend Web Crypto & Argon2 unit tests
npm run test --workspace=@talk/web

# Run backend room security & lifecycle integration tests
npm run test --workspace=@talk/server
```

**Test Coverage Highlights:**
- `crypto.test.ts`: Argon2id stretching, ECDSA key generation, ECDH secret derivation, AES-256-GCM encryption/decryption, SAS fingerprint generation, and replay attack counter validation.
- `roomApi.test.ts`: State A/B/C transitions, atomic first-claimer race condition protection, 5-attempt brute-force lockout, 2-person enforcement (3rd participant rejection with 403), device-key re-join validation, and cron cleanup routines.

---

### Docker Deployment

To deploy Talk using Docker Compose (including a dedicated Coturn STUN/TURN server):

```bash
docker compose up -d --build
```

- **Frontend Client**: `http://localhost:5173`
- **Backend API & Sockets**: `http://localhost:4000`
- **Coturn STUN/TURN Server**: Port `3478` (UDP/TCP)

---

## 5. MongoDB Atlas Setup

If deploying to a managed MongoDB Atlas cluster:

1. **Create an Atlas Cluster**:
   - Log into [MongoDB Atlas](https://cloud.mongodb.com/) and create a free tier (M0) or dedicated cluster. All Atlas tiers run as replica sets, satisfying the transaction requirement.
2. **Create a Database User**:
   - Under **Database Access**, create a user with `readWrite` permissions on your database (e.g., `talk_production`).
3. **Configure Network Access**:
   - Under **Network Access**, add the IP address of your application server (or `0.0.0.0/0` during staging).
4. **Set `DATABASE_URL`**:
   - Copy the MongoDB connection string and set it in your `.env` file:
     ```env
     DATABASE_URL="mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/talk_production?retryWrites=true&w=majority"
     ```

---

## 6. Threat Model & Security Boundaries

### What Talk Protects Against

- **Compromised Server / Database**: If the server database is dumped, attackers only obtain ciphertext blobs and Argon2 hashes. Plaintext messages and media cannot be decrypted without the client-held keys.
- **Man-in-the-Middle (MITM) Attacks**: Code-bound HMAC confirmation prevents a rogue server or proxy from substituting public keys during key exchange.
- **Eavesdropping & Wiretapping**: WebRTC media is encrypted with DTLS-SRTP, and signaling data is encrypted with AES-256-GCM.
- **Room Hijacking**: Third parties attempting to enter an active room are blocked by the 2-person rule and atomic database constraints.
- **Replay Attacks**: Duplicate or replayed messages are rejected by monotonic counters and authenticated GCM tags.
- **IP Address Harvesting**: The "Hide My IP" option routes WebRTC traffic through TURN relays, concealing private network information.

### Honest Limitations & Edge Cases

1. **Screen Capture & Physical Recording**: End-to-end encryption protects transmission and server storage. It cannot prevent a peer from taking a screenshot or photographing their physical screen.
2. **Compromised Operating Systems**: If an endpoint has malware, spyware, or keyloggers installed at the OS level, cryptographic security at the application level cannot guarantee protection.
3. **Weak Passphrases**: If users pick very short or predictable access codes (e.g. `1234`), they remain vulnerable to offline dictionary attacks. Users are encouraged to generate strong passphrases using the built-in generator.
4. **Cloud Backups**: While database snapshots by hosting providers may retain deleted ciphertext, the corresponding cryptographic keys are crypto-shredded and destroyed on user devices, rendering backed-up ciphertext permanently unreadable.
