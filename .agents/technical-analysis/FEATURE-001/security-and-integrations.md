# ZapNowQR Security & Integrations Architecture: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature ID:** `FEATURE-001` (ZapNow Retention & Growth Engine MVP)  
**Reference Document:** [.ai/technical-analysis/FEATURE-001/data-flow.md](data-flow.md)  
**Date:** 2026-09-28  
**Scope:** READ-ONLY Technical Security & Integration Analysis (Zero code modifications)

---

## 1. Authentication

### 1.1 Merchant Admin Authentication
* **Current Mechanism:** Handled by `authenticate` in `backend/src/middleware/auth.ts` and `requireMarketingAuth` in `backend/src/modules/marketing/middleware/marketingAuth.ts`.
* **Token Verification:**
  - Extracts JWT Bearer token from `Authorization: Bearer <token>`.
  - Verifies cryptographic signature using `process.env.JWT_SECRET` via `verifySignedSessionToken`.
  - Rejects unauthenticated requests with HTTP `401 UNAUTHORIZED`.
  - Rejects tokens with `tokenType !== 'admin'` with HTTP `401 INVALID_TOKEN`.
* **Security Assessment:** **ROBUST.** All marketing routes (`/marketing/*` and `/api/marketing/*`) enforce `router.use(requireMarketingAuth)` at the router level.

### 1.2 Customer Dining QR Authentication
* **Mechanism:** Handled via `verifyCustomerToken` and `softVerifyCustomerToken` in `backend/src/middleware/customerAuth.ts`.
* **Scope:** Customer sessions are bound to their verified phone number. Customer-facing endpoints (viewing menu, applying win-back discount, submitting feedback) cannot access admin or marketing APIs.

---

## 2. Authorization & RBAC

* **Role Verification:**
  - `AdminUser` model supports roles (`RESTAURANT_SUPERADMIN`, `RESTAURANT_ADMIN`, `RESTAURANT_MANAGER`, `STAFF`, `KITCHEN_STAFF`).
  - **MVP Policy:** Only `RESTAURANT_SUPERADMIN`, `RESTAURANT_ADMIN`, and `RESTAURANT_MANAGER` may:
    1. Trigger campaign dispatches (`POST /api/marketing/retention/campaigns/trigger`).
    2. Recharge the prepaid WhatsApp messaging wallet (`POST /api/marketing/wallet/topup/create-order`).
    3. Modify restaurant Google Place ID or review redirection settings.
  - Cashiers and kitchen staff (`STAFF`, `KITCHEN_STAFF`) are strictly prohibited from dispatching promotional campaigns or initiating wallet debits.

---

## 3. Merchant / Tenant Isolation

### 3.1 Strict Server-Side Context Derivation
* **Anti-IDOR Rule:** The backend must **NEVER** accept `restaurantId` from the client request body, query parameter, or custom header for authenticated merchant actions.
* **Derivation Path:**
  ```text
  JWT Token
     ↓
  verifySignedSessionToken()
     ↓
  decoded.restaurantId (or fallback: AdminUser.restaurantId in DB)
     ↓
  req.marketingContext = { restaurantId, userId, role }
  ```
* **Database Boundary:**
  - All Prisma queries for RFM customer cohorts, campaigns, wallet ledgers, and feedback must explicitly mandate:
    `where: { restaurantId: req.marketingContext.restaurantId }`.
  - The `Customer` model enforces `@@unique([phone, restaurantId])`, ensuring that diner records across different restaurants never collide or leak across tenants.

### 3.2 Real-time Tenant Isolation (Socket.IO)
* **Risk:** Global broadcasting via `io.emit()` (flagged in baseline audit) causes cross-merchant data leakage.
* **Isolation Rule for FEATURE-001:**
  - All realtime events (`service-recovery-alert`, `wallet-balance-updated`) must strictly emit to merchant-scoped rooms:
    ```typescript
    io.to(`restaurant:${restaurantId}`).emit('service-recovery-alert', payload);
    ```
  - Unauthenticated sockets or sockets belonging to Merchant A must never receive events from Merchant B.

---

## 4. OAuth & Token Handling

### 4.1 Token Storage Architecture
* **Table:** `ConnectedAccount` (`marketing_connected_accounts` in `backend/prisma/schema.prisma`).
* **Fields:** `encryptedAccessToken @db.Text`, `encryptedRefreshToken @db.Text`, `tokenExpiresAt DateTime?`, `scopes String[]`.
* **Vulnerability Identified:** The repository currently defines fields named `encryptedAccessToken`, but lacks a standardized AES-256-GCM cipher utility in `backend/src/utils/`.
* **Required Standard for Implementation:**
  - Tokens must be encrypted at rest using AES-256-GCM with a dedicated environment key (`process.env.TOKEN_ENCRYPTION_KEY`, 32 bytes hex).
  - Storage payload must be serialized as `iv:authTag:ciphertext`.
  - API responses must **STRICTLY EXCLUDE** these fields. `getConnectedAccounts` in `accountController.ts` already conforms by omitting `encryptedAccessToken` and `encryptedRefreshToken` from its `select` query.

### 4.2 Token Refresh & Expiration
* Meta WhatsApp Cloud API uses permanent System User Access Tokens for server-to-server operations, avoiding OAuth expiry churn.
* If user-delegated tokens are used in future phases, the background worker must check `tokenExpiresAt` and trigger refresh 7 days prior to expiration.

---

## 5. External API Permissions & Scopes

### 5.1 Meta WhatsApp Business Cloud API
* **Permissions Required:**
  - `whatsapp_business_messaging`: Send pre-approved templates and interactive messages.
  - `whatsapp_business_management`: Read template status and verify phone number quality tier.
* **Security Constraints:**
  - System tokens must have zero access to ad spend or user social profiles.
  - Rate limiting: Tier 1 accounts are limited to 1,000 business-initiated conversations per rolling 24 hours. The scheduler must enforce batch throttling.

### 5.2 Google Business Profile
* **MVP Zero-Token Approach (High Defensibility / Low Risk):**
  - The MVP avoids requiring full Google Business Profile OAuth or Partner Access approvals.
  - It utilizes the restaurant's public Google Place ID to construct the direct review deep-link:
    `https://search.google.com/local/writereview?placeid=${googlePlaceId}`.
  - This eliminates Google OAuth maintenance, refresh token expirations, and Google Cloud Partner quota restrictions for the MVP.

---

## 6. Webhook Security

### 6.1 Meta WhatsApp Delivery & Inbound Webhook
* **Endpoint:** `GET /api/webhooks/whatsapp` & `POST /api/webhooks/whatsapp`.
* **Verification (Handshake):**
  ```typescript
  // Challenge Handshake
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.status(403).json({ error: 'FORBIDDEN' });
  ```
* **Payload Signature Verification:**
  - Header: `X-Hub-Signature-256: sha256={hash}`.
  - Verification: Compute HMAC-SHA256 of raw request body using `process.env.WHATSAPP_APP_SECRET`.
  - Comparison: Must use `crypto.timingSafeEqual` to prevent timing attacks (matching pattern in `backend/src/routes/webhookRoutes.ts` line 32).

### 6.2 Razorpay Payment Webhook (Wallet Recharges)
* **Endpoint:** `POST /api/webhooks/razorpay`.
* **Verification:**
  - Header: `X-Razorpay-Signature`.
  - Signature computed over raw body with `process.env.RAZORPAY_WEBHOOK_SECRET`.
  - Pattern already verified in `backend/src/controllers/razorpayWebhook.ts`.

---

## 7. Secrets & Configuration Management

### 7.1 Sensitive Environment Variables Required
| Variable Name | Environment | Purpose | Sensitivity Level |
| :--- | :--- | :--- | :--- |
| `WHATSAPP_CLOUD_API_TOKEN` | Production/Backend | System token for WhatsApp Cloud API | **CRITICAL** (Never expose to client) |
| `WHATSAPP_PHONE_NUMBER_ID` | Production/Backend | Meta business phone ID | **HIGH** |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Production/Backend | Shared secret for webhook handshake | **HIGH** |
| `WHATSAPP_APP_SECRET` | Production/Backend | Used for validating X-Hub-Signature-256 | **CRITICAL** |
| `TOKEN_ENCRYPTION_KEY` | Production/Backend | 32-byte hex key for AES-256 token encryption | **CRITICAL** |
| `RAZORPAY_WEBHOOK_SECRET` | Production/Backend | Validates wallet top-up callbacks | **CRITICAL** |

### 7.2 Configuration Rules
* All secrets must be declared in `backend/.env` and validated at startup in `backend/src/utils/env.ts`.
* Secrets must **NEVER** be committed to Git or printed in application log files (`logger.info`/`console.log`).

---

## 8. Failure Modes, Retries & Idempotency Risks

### 8.1 Double-Send & Campaign Replay Risk
* **Risk:** A network timeout or server restart during a batch WhatsApp dispatch could trigger the scheduler to re-send messages, causing diners to receive duplicate promotions and double-debiting merchant wallet credits.
* **Mitigation (Idempotency Pattern):**
  - Maintain a recipient dispatch state machine: `QUEUED` → `SENDING` → `SENT` / `FAILED`.
  - Record unique dispatch ID: `idempotencyKey = campaign_${campaignId}_cust_${customerId}_date_${yyyy_mm_dd}`.
  - Before sending, acquire row lock or check existence; duplicate sends are instantly rejected.

### 8.2 Webhook Duplication & Wallet Over-Crediting
* **Risk:** Razorpay webhooks can be retried up to 24 hours on temporary network delays. A duplicate `payment.captured` event could credit the wallet twice.
* **Mitigation:**
  - The ledger update must check:
    ```typescript
    const existing = await prisma.usageRecord.findFirst({
      where: { referenceId: razorpayPaymentId }
    });
    if (existing) return res.status(200).json({ status: 'ALREADY_PROCESSED' });
    ```
  - Enforce atomic transaction via `prisma.$transaction`.

### 8.3 WhatsApp API Outage or Meta Account Suspension
* **Failure Mode:** Meta Cloud API returns `400 (Template not found)` or `131056 (Rate limit hit)`.
* **Expected System Behavior:**
  - The job marks the recipient status as `FAILED` with `errorMessage` logged.
  - Does **NOT** debit the merchant's wallet for failed transmissions.
  - Emits warning to merchant dashboard: *"WhatsApp delivery paused: Template review required or Meta rate limit reached."*

---

## 9. Security Risk Classification Summary

| ID | Finding / Surface | Classification | Status & Mitigation |
| :--- | :--- | :---: | :--- |
| **SEC-01** | Missing AES-256-GCM encryption utility for `ConnectedAccount` tokens | **HIGH** | Add symmetric AES-GCM encryption wrapper before writing external tokens to DB. |
| **SEC-02** | Potential Socket.IO broadcast leak on review alerts | **HIGH** | Strictly enforce `io.to('restaurant:' + restaurantId)` room emit; eliminate global `io.emit()`. |
| **SEC-03** | Webhook timing attack on Meta webhook verification | **MEDIUM** | Use `crypto.timingSafeEqual` for all token and signature checks. |
| **SEC-04** | Negative wallet balance race condition | **MEDIUM** | Use Prisma `$transaction` with optimistic locking to check `balance >= cost` prior to batch send. |
| **SEC-05** | Customer phone number exposure in client responses | **LOW** | Mask diner phone numbers (`+91 98765*****`) in admin campaign reports. |

---

## Summary
The security architecture for FEATURE-001 MVP is inherently safe because it relies on server-derived tenant contexts (`requireMarketingAuth`), avoids complex public OAuth endpoints by utilizing static Place ID deep-links for Google reviews, and prevents financial discrepancies through idempotent webhook handling and atomic Prisma wallet transactions.
