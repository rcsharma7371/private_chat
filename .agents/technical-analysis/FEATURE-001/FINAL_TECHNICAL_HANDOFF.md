# ZapNowQR Master Technical Handoff: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature Name:** ZapNow Retention & Growth Engine (MVP)  
**Document Type:** Single-Source-of-Truth Engineering Handoff  
**Target Audience:** Implementation Engineers, QA Engineers, Security Reviewers  
**Date:** 2026-09-28  
**Scope:** Final Read-Only Technical Architecture Specification (Zero application code modified)

---

## 1. Approved MVP Scope

The ZapNow Product Discovery Council reviewed and approved a focused, high-ROI retention engine designed specifically for independent Indian restaurants. High-friction, low-adoption capabilities (social media auto-posting, AI video generation, and unconstrained LLM copywriting) were pruned.

### 1.1 In-Scope Deliverables
1. **Autonomous Lapsed-Customer Reactivation (RFM Win-Back):**
   - Automatically segments diners with $\ge 2$ historical visits whose last order was $\ge 30$ days ago.
   - Dispatches a personalized WhatsApp message with a 1-tap re-ordering deep link (`/#/menu?restaurantId=...&coupon=...&campaignId=...`).
2. **Post-Dining Google Review Booster & Negative Feedback Interception:**
   - 20 minutes post-billing (`status: 'COMPLETED'` / `paymentStatus: 'PAID'`), dispatches a 2-button interactive survey over WhatsApp:
     - **4–5 Stars ("Loved it!"):** Directs diner to the restaurant's public Google Maps review URL (`https://search.google.com/local/writereview?placeid={place_id}`).
     - **1–3 Stars ("Needs Improvement"):** Captures private feedback in the internal database and emits a real-time operational alert to the manager for front-desk service recovery.
3. **Prepaid WhatsApp Messaging Wallet & Ledger:**
   - Pay-as-you-go credit wallet recharged via Razorpay UPI (₹500 / ₹1,000 / ₹2,000 packs).
   - Real-time balance deduction on delivered messages (~₹0.85/conversation).
4. **Closed-Loop ROI Attribution Tile:**
   - Mobile-first dashboard showing: *Messages Sent | Wallet Spend | Orders Placed | Attributed GMV | ROI Multiplier*.

### 1.2 Explicitly Out-of-Scope (Pruned by Council)
* Instagram & Facebook feed/story/reel publishing.
* AI video generation (Sora / Kling / Runway) and AI image canvas generation.
* Unconstrained real-time LLM copy generation (violates Meta WhatsApp pre-approved template policies).
* Complex drag-and-drop workflow builders.
* 3PL hyperlocal fleet dispatch (Dunzo / Shadowfax / Porter).

---

## 2. Existing Functionality We Can Reuse (~70% Code Leverage)

1. **RFM Aggregation Routines:** [`backend/src/controllers/customerController.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/controllers/customerController.ts#L249-L328) already computes `totalOrders`, `totalSpent`, `lastVisit`, and order sources (`qrDineIn`, `qrTakeaway`, `staff`) with strict tenant isolation.
2. **Customer & Order Models:** [`backend/prisma/schema.prisma`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/prisma/schema.prisma) contains `Customer`, `Order`, `OrderItem`, and `Payment`. Customers are already partitioned by `@@unique([phone, restaurantId])`.
3. **Feedback Table:** [`Feedback`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/prisma/schema.prisma#L1139-L1164) already supports `rating`, `review`, `isApproved`, `isVisible`, and `restaurantId`. Directly captures intercepted negative reviews.
4. **Marketing Module & Middleware:** [`backend/src/modules/marketing/`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/modules/marketing/) is mounted at `/marketing` and `/api/marketing`. [`marketingAuth.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/modules/marketing/middleware/marketingAuth.ts) resolves `req.marketingContext = { restaurantId, userId, role }`.
5. **Marketing Schema Extension:** `ConnectedAccount`, `UsageRecord`, and `Entitlement` are already defined in Prisma schema.
6. **Payment Infrastructure:** [`razorpay.service.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/services/razorpay.service.ts) and [`razorpayWebhook.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/controllers/razorpayWebhook.ts) provide battle-tested UPI payment and HMAC verification patterns.
7. **Background Jobs Engine:** [`backend/src/jobs/`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/jobs/) and [`server.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/server.ts#L40-L55) provide standard `setInterval` workers with graceful shutdown handling.
8. **Frontend Layout Primitives:** [`MarketingPage.tsx`](file:///C:/Users/Gaurav/Desktop/zapnowQR/pages/Admin/pages/Marketing/MarketingPage.tsx) and [`MarketingOverviewTab.tsx`](file:///C:/Users/Gaurav/Desktop/zapnowQR/pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx) already exist in the Admin Dashboard.

---

## 3. Frontend Changes

* **Tab Restructuring in [`MarketingPage.tsx`](file:///C:/Users/Gaurav/Desktop/zapnowQR/pages/Admin/pages/Marketing/MarketingPage.tsx):**
  - Deprecate complex unneeded tabs (`brand`, `media`, `create`) from the default navigation.
  - Mount MVP tabs: `Overview`, `Campaigns`, `Reviews`, `Wallet`.
* **New UI Sub-Components:**
  - `CampaignsTab.tsx`: Card-based UI showing the "Lapsed Regular Win-Back" engine with an active/paused toggle, audience size counter (*"42 regulars inactive >30 days"*), and preview modal.
  - `WalletTab.tsx`: Real-time balance badge, Razorpay UPI top-up selector (₹500 / ₹1,000 / ₹2,000), and transaction ledger table.
  - `ReviewsTab.tsx`: Feed of intercepted 1–3 star ratings with customer contact buttons; settings form to update Google Place ID.
* **Enhanced [`MarketingOverviewTab.tsx`](file:///C:/Users/Gaurav/Desktop/zapnowQR/pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx):**
  - Integrate a **Closed-Loop ROI Metric Card**: *Spend (₹) vs Direct Revenue Generated (₹)*.

---

## 4. Backend Changes

* **New Controllers:**
  - `backend/src/modules/marketing/controllers/retentionController.ts`: Provides endpoints for calculating cohort counts, previewing win-back templates, and manually triggering campaigns.
  - `backend/src/modules/marketing/controllers/walletController.ts`: Queries wallet balance, ledger history, and initiates Razorpay top-up orders.
  - `backend/src/modules/marketing/controllers/whatsappWebhookController.ts`: Handles Meta webhook challenge handshake and delivery receipt updates.
* **New Services:**
  - `backend/src/services/whatsAppService.ts`: HTTP client wrapping Meta Graph API v21.0 with parameter injection and batch rate-limiting.
  - `backend/src/utils/crypto.ts`: Standardized AES-256-GCM symmetric encryption/decryption module for sensitive third-party tokens.
* **New Background Scheduler:**
  - `backend/src/jobs/retentionCohortScheduler.ts`: Daily scheduled task (11:00 AM) evaluating active restaurants, pre-flight wallet balances, and dispatching win-back messages.
* **Order Status Hook:**
  - In `backend/src/controllers/orderController.ts`, when `status === 'COMPLETED'` or `paymentStatus === 'PAID'`, schedule the 20-minute post-dining review survey trigger.

---

## 5. Database Changes (Prisma Schema)

**Nature of Changes: Strictly Additive (Zero breaking changes to existing models).**

```prisma
// ADDITIVE PRISMA EXTENSION

model MarketingCampaign {
  id             String          @id @default(cuid())
  restaurantId   String
  name           String
  type           String          @default("WIN_BACK_LAPSED")
  status         String          @default("ACTIVE") // ACTIVE, PAUSED, COMPLETED
  templateName   String
  totalTargeted  Int             @default(0)
  totalSent      Int             @default(0)
  totalDelivered Int             @default(0)
  totalOrders    Int             @default(0)
  attributedGmv  Float           @default(0)
  totalSpend     Float           @default(0)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  restaurant     Restaurant      @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  recipients     CampaignRecipient[]
  orders         Order[]

  @@index([restaurantId, status])
  @@map("marketing_campaigns")
}

model CampaignRecipient {
  id             String            @id @default(cuid())
  campaignId     String
  customerId     String
  phone          String
  idempotencyKey String            @unique
  status         String            @default("QUEUED") // QUEUED, SENT, DELIVERED, FAILED
  errorMessage   String?           @db.Text
  sentAt         DateTime?
  deliveredAt    DateTime?
  createdAt      DateTime          @default(now())

  campaign       MarketingCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  customer       Customer          @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([campaignId, status])
  @@index([phone])
  @@map("marketing_campaign_recipients")
}
```
*Note: Add optional `campaignId String?` to the existing `Order` model for direct revenue attribution.*

---

## 6. External Integrations

1. **Meta WhatsApp Business Cloud API (Graph API v21.0):**
   - Outbound REST endpoint: `POST https://graph.facebook.com/v21.0/{phone-number-id}/messages`.
   - Uses pre-approved Meta message templates:
     - `zapnow_winback_offer_v1` (Marketing Category).
     - `zapnow_dining_review_v1` (Utility Category).
2. **Razorpay Payment Gateway:**
   - Outbound: Creates top-up payment orders via existing `razorpay.orders.create`.
   - Inbound: Webhook on `POST /api/webhooks/razorpay` captures successful UPI recharges.
3. **Google Place Review URL (Zero-OAuth):**
   - Direct client URL generation: `https://search.google.com/local/writereview?placeid={place_id}`.
   - Zero direct server-to-server API coupling required for the MVP.

---

## 7. OAuth / Authentication

* **Merchant Admin Requests:** Authenticated using existing signed JWT Bearer tokens via `requireMarketingAuth`.
* **Zero Client Trust:** Merchant context is never derived from frontend request bodies or queries; it is strictly resolved server-side (`req.marketingContext = { restaurantId, userId, role }`).
* **Token Storage Security:** Access tokens in `ConnectedAccount` must be encrypted at rest using AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and excluded from all API `select` clauses.

---

## 8. Merchant / Tenant Isolation

* **Database Queries:** Every query touching customers, orders, campaigns, ledgers, or feedback must explicitly mandate:
  `where: { restaurantId: req.marketingContext.restaurantId }`.
* **Customer Partitioning:** The database enforces `@@unique([phone, restaurantId])`, ensuring diner transaction histories across different restaurants remain strictly partitioned.
* **Socket.IO Room Partitioning:** Real-time events must emit strictly to `restaurant:${restaurantId}`. Cross-tenant broadcasts are strictly prohibited.

---

## 9. API Changes

| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/marketing/retention/cohorts` | `requireMarketingAuth` | Fetch counts for Lapsed Regulars, Active Regulars, New Guests |
| `POST` | `/api/marketing/retention/campaigns/trigger` | `requireMarketingAuth` | Trigger campaign dispatch for selected cohort |
| `GET` | `/api/marketing/retention/analytics` | `requireMarketingAuth` | Fetch attributed GMV, messages sent, and ROI metrics |
| `GET` | `/api/marketing/wallet/balance` | `requireMarketingAuth` | Fetch wallet balance and transaction ledger |
| `POST` | `/api/marketing/wallet/topup/create-order` | `requireMarketingAuth` | Create Razorpay payment order for wallet recharge |
| `GET` | `/api/webhooks/whatsapp` | Public (Token handshake) | Meta webhook verification handshake (`hub.challenge`) |
| `POST` | `/api/webhooks/whatsapp` | HMAC-SHA256 signature | Inbound Meta delivery receipts and button clicks |

---

## 10. Socket.IO Impact

* **Permitted Events Only:**
  1. `service-recovery-alert`: Emitted to `restaurant:${restaurantId}` when 1–3 star feedback is intercepted.
  2. `wallet-balance-updated`: Emitted to `restaurant:${restaurantId}` when Razorpay wallet recharge is verified.
* **Prohibited Patterns:** `io.emit()` (global broadcasting) is strictly forbidden to prevent tenant data leakage.

---

## 11. Security Requirements

1. **Anti-IDOR:** Derivation of `restaurantId` from JWT token context is mandatory across all endpoints.
2. **Timing-Safe Crypto:** Webhook token and signature comparisons must strictly use `crypto.timingSafeEqual`.
3. **RBAC:** Only `RESTAURANT_SUPERADMIN`, `RESTAURANT_ADMIN`, and `RESTAURANT_MANAGER` may dispatch campaigns or recharge wallets; cashiers and kitchen staff are blocked.
4. **Data Minimization:** Diners' phone numbers in campaign reports must be masked (`+91 98765*****`).

---

## 12. Performance Considerations

* **Database Indexing:** Add composite index `Customer(restaurantId, lastOrderDate)` to keep RFM cohort queries $<50$ms.
* **Batch Throttling:** Background dispatch workers must throttle outbound WhatsApp requests to $\le 10$ messages/second to prevent event-loop congestion and Meta API 429 rate-limits.
* **Off-Peak Execution:** Cron scheduler must execute daily at 11:00 AM (prior to the lunch peak) to avoid POS database contention.

---

## 13. Failure Handling

* **Meta API Outage:** Messages marked `FAILED` with logged error; merchant wallet is **not** debited for unsent messages.
* **Insufficient Balance:** Schedulers and manual triggers abort with `INSUFFICIENT_WALLET_BALANCE` before initiating API calls (no negative balances permitted).
* **Network Drop on Webhook:** Handlers return HTTP `200` only after committing the database transaction; uncommitted retries are handled safely via idempotency keys.

---

## 14. Idempotency Requirements

1. **Campaign Dispatch:** Every recipient record enforces a unique `idempotencyKey` (`campaign_${campaignId}_cust_${customerId}_date_${yyyy_mm_dd}`). Prevents double-sending promotions to the same customer within 24 hours.
2. **Wallet Recharges:** Webhook handler checks `UsageRecord.referenceId === razorpayPaymentId` before crediting funds, preventing duplicate credits from webhook retries.

---

## 15. Environment Variables & Secrets Required

| Variable | Sensitivity | Required For |
| :--- | :---: | :--- |
| `WHATSAPP_CLOUD_API_TOKEN` | **CRITICAL** | Meta WhatsApp Cloud API system user access token |
| `WHATSAPP_PHONE_NUMBER_ID` | **HIGH** | Meta WhatsApp Business phone number identifier |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **HIGH** | Secret for Meta webhook challenge handshake |
| `WHATSAPP_APP_SECRET` | **CRITICAL** | HMAC validation of incoming Meta webhooks (`X-Hub-Signature-256`) |
| `TOKEN_ENCRYPTION_KEY` | **CRITICAL** | 32-byte hex key for AES-256-GCM token encryption at rest |
| `RAZORPAY_WEBHOOK_SECRET` | **CRITICAL** | Validates Razorpay top-up callbacks |
| `FEATURE_RETENTION_ENGINE` | Low | Feature flag (`true`/`false`) controlling scheduler activation |

---

## 16. Dependencies Required

* **Zero New npm Dependencies Needed:**
  - HTTP requests: Native `fetch` (Node.js 18+).
  - Cryptography: Built-in `node:crypto`.
  - Database: Existing `@prisma/client`.
  - Real-time: Existing `socket.io`.
  - Payments: Existing `razorpay` SDK.

---

## 17. Files / Modules Likely to Change

* [`backend/src/modules/marketing/routes/marketingRoutes.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/modules/marketing/routes/marketingRoutes.ts)
* [`backend/src/routes/webhookRoutes.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/routes/webhookRoutes.ts)
* [`backend/src/controllers/orderController.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/controllers/orderController.ts) (hook for completed orders)
* [`backend/src/server.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/server.ts) (mount scheduler)
* [`backend/src/utils/env.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/utils/env.ts) (add env vars)
* [`pages/Admin/pages/Marketing/MarketingPage.tsx`](file:///C:/Users/Gaurav/Desktop/zapnowQR/pages/Admin/pages/Marketing/MarketingPage.tsx)
* [`pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx`](file:///C:/Users/Gaurav/Desktop/zapnowQR/pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx)

---

## 18. Files / Modules That MUST NOT Change

* **Core Dining Checkout:** Customer PWA checkout files (`pages/MenuPage.tsx`, `components/CheckoutModal.tsx`).
* **Kitchen Order Management:** Kitchen Display System (`pages/KDS/`, `kdsController.ts`).
* **Existing Billing Routines:** `restaurantBillingScheduler.ts`, `agentBillingScheduler.ts`.
* **Excluded Systems:** Completely ignore `openclaw` and `openclaw-agent-pack`.

---

## 19. Implementation Order

```text
Phase 1: Security & Storage Foundation
  1.1 Create backend/src/utils/crypto.ts (AES-256-GCM).
  1.2 Apply additive Prisma migration (MarketingCampaign, CampaignRecipient).
  1.3 Update backend/src/utils/env.ts with retention variables.

Phase 2: Core Services & Webhooks
  2.1 Implement backend/src/services/whatsAppService.ts.
  2.2 Implement backend/src/modules/marketing/controllers/walletController.ts.
  2.3 Implement backend/src/modules/marketing/controllers/whatsappWebhookController.ts.
  2.4 Mount routes in webhookRoutes.ts and marketingRoutes.ts.

Phase 3: Retention Engine & Scheduler
  3.1 Implement backend/src/modules/marketing/controllers/retentionController.ts.
  3.2 Implement backend/src/jobs/retentionCohortScheduler.ts.
  3.3 Hook into orderController.ts for 20-minute post-dining review trigger.
  3.4 Initialize scheduler in server.ts under FEATURE_RETENTION_ENGINE flag.

Phase 4: Frontend UI Integration
  4.1 Build CampaignsTab.tsx, WalletTab.tsx, and ReviewsTab.tsx.
  4.2 Update MarketingPage.tsx navigation.
  4.3 Integrate closed-loop ROI tile in MarketingOverviewTab.tsx.

Phase 5: Automated QA & End-to-End Verification
  5.1 Execute all 5 required test suites.
  5.2 Verify non-regression on core QR ordering and POS billing.
```

---

## 20. Test Requirements

Implementation agents must implement and execute the following automated test suites:
1. `retentionCohort.test.ts`: Verifies RFM classification (Lapsed vs Active) and multi-tenant isolation.
2. `walletTransactions.test.ts`: Verifies pre-flight balance checks, atomic top-ups, duplicate webhook idempotency, and concurrency locks.
3. `webhooksSecurity.test.ts`: Verifies Meta webhook challenge handshake, HMAC-SHA256 signature validation, and timing-safe comparisons.
4. `reviewInterception.test.ts`: Verifies 20-minute delayed trigger scheduling, Place ID URL formatting, and private negative review interception.
5. `cryptoTokens.test.ts`: Verifies AES-256-GCM encryption/decryption round-trip and API response token exclusion.

---

## 21. Rollback & Feature-Flag Considerations

* **Feature Flag:** Controlled via `FEATURE_RETENTION_ENGINE=true|false`. Setting to `false` instantly suspends the background scheduler and dispatches without requiring a server rollback.
* **Schema Safety:** Because all database changes are strictly additive (`MarketingCampaign`, `CampaignRecipient`, optional `Order.campaignId`), rolling back backend code requires **zero destructive database rollbacks**. Existing orders and diner profiles remain 100% intact.

---

## 22. Known Unknowns

1. **Meta WhatsApp Account Approval Velocity:** Time required for an individual restaurant's WABA to verify and obtain Tier 1 template approvals. *(Mitigation: ZapNow can operate via a centralized master WABA with restaurant name parameter injection for the pilot).*
2. **Customer Opt-Out Behavior:** diner response rate when receiving WhatsApp prompts from a new business number. *(Mitigation: Messages clearly include standard "Reply STOP to unsubscribe" and limit sends to $\le 1$ message per 30 days).*
3. **Google Place ID Resolution:** Whether merchants know their Google Place ID. *(Mitigation: Provide an automated search-and-select autocomplete widget in the admin settings tab).*

---

# FINAL TECHNICAL STATUS:

## **FEASIBLE WITH CONSTRAINTS**

### Constraints Summary:
1. Meta WhatsApp Cloud API template pre-approval is strictly mandatory (no dynamic LLM outbound copy).
2. WhatsApp Business Accounts are rate-limited to Tier 1 (1,000 conversations/24h) initially.
3. Third-party tokens must be encrypted using AES-256-GCM in `backend/src/utils/crypto.ts`.
4. Google Review redirection must use direct Place ID deep-links to bypass Google Cloud Partner API quota gates.
