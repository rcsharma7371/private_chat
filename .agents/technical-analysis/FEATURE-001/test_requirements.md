# ZapNowQR Test Requirements & Quality Assurance Plan: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature ID:** `FEATURE-001` (ZapNow Retention & Growth Engine MVP)  
**Date:** 2026-09-28  
**Scope:** Test Specification & Safety Verification Criteria

---

## 1. Test Strategy Overview
In accordance with Rule 46 & 47 of `AGENTS.md`, no change may be marked complete without explicit automated and verified testing. Because FEATURE-001 involves external messaging, financial wallet transactions, and customer dining telemetry, test execution must cover:
* Happy path verification
* Input validation & malicious payloads
* Multi-tenant authorization & IDOR boundary checks
* Cryptographic signature validation
* Concurrency, idempotency & race conditions
* Non-regression of core dining and ordering workflows

---

## 2. Required Test Suites

### 2.1 Suite 1: RFM Cohort Analytics & Segmentation (`retentionCohort.test.ts`)
* **Test 1.1 (Lapsed Regular Detection):** Verify that a customer with 3 completed orders whose last order was 31 days ago is correctly classified as `LAPSED_REGULAR`.
* **Test 1.2 (Active Regular Exclusion):** Verify that a customer with 3 orders whose last order was 5 days ago is **excluded** from the lapsed win-back batch.
* **Test 1.3 (Single-Visit Filter):** Verify that a diner with only 1 order 35 days ago is classified as `LAPSED_ONE_TIME` and not sent a regular win-back promotion.
* **Test 1.4 (Cancelled Order Exclusion):** Verify that orders with status `CANCELLED` or `REJECTED` do not count toward frequency or monetary metrics.
* **Test 1.5 (Multi-Tenant Isolation):** Given Restaurant A and Restaurant B, verify that Restaurant A's cohort query **never** includes customers or orders belonging to Restaurant B, even if phone numbers match.

### 2.2 Suite 2: Prepaid Messaging Wallet & Ledger (`walletTransactions.test.ts`)
* **Test 2.1 (Pre-Flight Balance Check):** Attempting to dispatch a campaign of 50 messages (cost ₹42.50) with a wallet balance of ₹20.00 must reject with HTTP `402 INSUFFICIENT_WALLET_BALANCE` and send zero messages.
* **Test 2.2 (Atomic Top-Up Credit):** Verify that receiving a valid Razorpay webhook event increments the merchant's balance and creates a corresponding `UsageRecord` entry inside a single `$transaction`.
* **Test 2.3 (Duplicate Webhook Idempotency):** Submitting the exact same Razorpay payment ID webhook twice must return HTTP `200 ALREADY_PROCESSED` without double-crediting the merchant's balance.
* **Test 2.4 (Simultaneous Debit Concurrency):** Simulate two simultaneous campaign dispatches attempting to spend the same remaining ₹50. Exactly one must succeed; the other must abort cleanly without negative balance.

### 2.3 Suite 3: Webhook Verification & Cryptography (`webhooksSecurity.test.ts`)
* **Test 3.1 (Meta Webhook Handshake):** A `GET /api/webhooks/whatsapp` request with valid `hub.verify_token` must return HTTP `200` with the raw `hub.challenge` string.
* **Test 3.2 (Invalid Verify Token):** A `GET` request with an incorrect verify token must return HTTP `403 FORBIDDEN`.
* **Test 3.3 (HMAC-SHA256 Signature Verification):** A `POST /api/webhooks/whatsapp` request signed with `X-Hub-Signature-256` matching `process.env.WHATSAPP_APP_SECRET` must be accepted.
* **Test 3.4 (Tampered Payload Rejection):** Modifying 1 byte of the webhook payload while keeping the original signature must fail verification and return HTTP `401/403`.
* **Test 3.5 (Timing-Safe Comparison):** Verify that string comparisons use `crypto.timingSafeEqual` rather than standard `===`.

### 2.4 Suite 4: Post-Dining Feedback & Realtime Alerts (`reviewInterception.test.ts`)
* **Test 4.1 (Delayed Trigger Scheduling):** When an order updates to `status: 'COMPLETED'`, verify a review dispatch task is scheduled with `triggerAt = createdAt + 20 minutes`.
* **Test 4.2 (Positive 5-Star URL):** Verify positive survey response generates the correct URL: `https://search.google.com/local/writereview?placeid={place_id}`.
* **Test 4.3 (Negative Feedback Interception):** An inbound WhatsApp callback rating $\le 3$ must create a `Feedback` record with `isVisible: false` and `isApproved: false`.
* **Test 4.4 (Socket.IO Room Isolation):** Emitting a negative feedback alert must deliver exclusively to room `restaurant:${restaurantId}`. Verify that a socket connection joined to `restaurant:${otherRestaurantId}` receives zero events.

### 2.5 Suite 5: Token Encryption at Rest (`cryptoTokens.test.ts`)
* **Test 5.1 (AES-256-GCM Round-Trip):** Encrypting an API token and then decrypting it must yield the exact original plaintext string.
* **Test 5.2 (Auth Tag Tamper Detection):** Modifying the authentication tag or ciphertext must throw a cryptographic authentication error upon decryption.
* **Test 5.3 (API Response Leak Prevention):** Calling `GET /api/marketing/accounts` must verify that neither `encryptedAccessToken` nor `encryptedRefreshToken` is present in the JSON response keys.

---

## 3. Regression Testing Requirements (Core ZapNow Workflows)

The following existing workflows must be executed and confirmed passing before feature release:
1. **Dine-In Customer Ordering:** QR scan → menu view → item selection → UPI checkout → KOT print.
2. **Kitchen Display System (KDS):** Order status transitions (`PENDING` → `ACCEPTED` → `PREPARING` → `READY` → `COMPLETED`).
3. **Cashier / POS Billing:** Split bill, applying existing promo coupons, cash settlement.
4. **Existing Background Workers:** Auto-prep scheduler, payment reconciliation job, printer paper monitor continue running without starvation.

---

## 4. Acceptance Criteria Checklist for Implementation Agents

- [ ] All unit and integration test suites pass in the test environment.
- [ ] No application code modified outside the defined boundary.
- [ ] No plaintext secrets or tokens stored in database or printed in logs.
- [ ] No unauthenticated routes exposed.
- [ ] No global `io.emit()` broadcasts introduced.
- [ ] Zero lint errors, zero TypeScript compilation errors.
- [ ] Rollback strategy verified with additive migration.
