# ZapNowQR Implementation Plan: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature ID:** `FEATURE-001` (ZapNow Retention & Growth Engine MVP)  
**Final Status:** **FEASIBLE WITH CONSTRAINTS**  
**Date:** 2026-09-28  
**Scope:** Final Read-Only Technical Handoff for Future Implementation Agents

---

## 1. Final Technical Recommendation & Status

### **STATUS: FEASIBLE WITH CONSTRAINTS**

### Rationale:
The approved MVP for FEATURE-001 is structurally sound and achieves high implementation leverage (~70% of necessary models and analytics routines already exist in the ZapNowQR repository). It can be implemented cleanly without disrupting existing dining, billing, or kitchen POS operations.

### Explicit Constraints Identified:
1. **Constraint 1 (Meta Template Pre-Approval):** Meta WhatsApp Cloud API strictly prohibits dynamic on-the-fly marketing copy. Standardized F&B templates (`zapnow_winback_offer_v1`, `zapnow_dining_review_v1`) must be pre-registered and approved in the Meta Business Manager before dispatches can succeed.
2. **Constraint 2 (Meta Phone Number Tier Limits):** New WhatsApp Business Accounts (Tier 1) are limited to 1,000 business-initiated conversations per rolling 24 hours. Schedulers must enforce rate throttling.
3. **Constraint 3 (Token Cryptography Standard):** An AES-256-GCM symmetric cipher utility must be established in `backend/src/utils/crypto.ts` to encrypt WhatsApp tokens stored in `ConnectedAccount`.
4. **Constraint 4 (Google Reviews Scope):** Google review redirection must use direct Place ID deep-links (`https://search.google.com/local/writereview?placeid={place_id}`) rather than full two-way Google Business Profile Partner APIs, which require lengthy partner approvals and have zero default quota.

---

## 2. Existing Functionality to Reuse

| Existing Component | Location | Reusability Rationale |
| :--- | :--- | :--- |
| **RFM Customer Analytics** | `backend/src/controllers/customerController.ts` | `getCustomerStats` (lines 249–328) already computes `totalOrders`, `totalSpent`, `lastVisit`, and order sources (`qrDineIn`, `qrTakeaway`, `staff`) scoped strictly by `restaurantId`. |
| **Customer & Order Models** | `backend/prisma/schema.prisma` (`Customer`, `Order`, `OrderItem`) | Core dining records already store phone numbers, order items, timestamps, and amounts with `@@unique([phone, restaurantId])`. |
| **Feedback Model** | `backend/prisma/schema.prisma` (`Feedback`) | Lines 1139–1164 already define `rating`, `review`, `isApproved`, `isVisible`, `restaurantId`, and `customerId`. Directly stores intercepted reviews. |
| **Marketing Router & Auth** | `backend/src/modules/marketing/routes/marketingRoutes.ts` & `middleware/marketingAuth.ts` | Already mounted at `/api/marketing` with robust server-side merchant context derivation (`req.marketingContext`). |
| **Marketing Extension Schema** | `backend/prisma/schema.prisma` (`ConnectedAccount`, `UsageRecord`, `Entitlement`) | Already provides structures for external accounts and credit consumption tracking. |
| **Razorpay Integration** | `backend/src/controllers/paymentController.ts` & `razorpayWebhook.ts` | Existing UPI intent creation and HMAC-SHA256 signature verification patterns. |
| **Background Scheduler Pattern** | `backend/src/jobs/` & `backend/src/server.ts` | Established `setInterval` job runner with error boundaries and graceful shutdown. |
| **Frontend Layout & Navigation** | `pages/Admin/pages/Marketing/MarketingPage.tsx` | Main marketing layout already mounted in Admin Dashboard. |

---

## 3. Files Likely Requiring Modification

| File Path | Nature of Modification | Precautions & Scope Control |
| :--- | :--- | :--- |
| `backend/src/modules/marketing/routes/marketingRoutes.ts` | Mount new retention and wallet sub-routes | Additive only; preserve existing routes. |
| `backend/src/routes/webhookRoutes.ts` | Mount WhatsApp delivery and challenge endpoints | Additive only; ensure strict HMAC signature verification. |
| `backend/src/controllers/orderController.ts` | Hook into `COMPLETED`/`PAID` state to schedule review prompt | Non-blocking trigger; wrap in try/catch to prevent affecting order updates. |
| `backend/src/server.ts` | Initialize `startRetentionCohortScheduler()` on startup | Wrap in try/catch; follow existing scheduler pattern. |
| `backend/src/utils/env.ts` | Add validation for optional `WHATSAPP_*` environment variables | Mark as optional in non-production environments to prevent boot crashes. |
| `pages/Admin/pages/Marketing/MarketingPage.tsx` | Reorganize tabs to prioritize MVP features (Overview, Campaigns, Reviews, Wallet) | Prune unused tabs (Video, BrandKit) from default view. |
| `pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx` | Embed Closed-Loop ROI attribution metrics card | Replace placeholder graphics with real GMV and spend metrics. |

---

## 4. New Files & Components Likely Required

### Backend:
1. `backend/src/modules/marketing/controllers/retentionController.ts`: Handles cohort generation, campaign preview, and dispatch triggers.
2. `backend/src/modules/marketing/controllers/walletController.ts`: Handles prepaid wallet balance queries and Razorpay top-up order generation.
3. `backend/src/modules/marketing/controllers/whatsappWebhookController.ts`: Handles Meta webhook challenge verification (`hub.challenge`) and inbound message/status callbacks.
4. `backend/src/services/whatsAppService.ts`: Encapsulates Meta Graph API v21.0 calls with rate-limit throttling and parameter injection.
5. `backend/src/jobs/retentionCohortScheduler.ts`: In-process background scheduler for evaluating daily win-back cohorts.
6. `backend/src/utils/crypto.ts`: AES-256-GCM token encryption and decryption utilities.

### Frontend:
1. `pages/Admin/pages/Marketing/tabs/CampaignsTab.tsx`: Dedicated UI for previewing and activating autonomous win-back campaigns.
2. `pages/Admin/pages/Marketing/tabs/WalletTab.tsx`: Wallet balance badge, transaction ledger table, and Razorpay UPI top-up modal.
3. `pages/Admin/pages/Marketing/tabs/ReviewsTab.tsx`: View intercepted 1–3 star feedback and manage Google Place ID settings.

---

## 5. Database Changes (Prisma Schema)

### Migration Required: **YES (Additive Only)**
To support campaign history and recipient-level idempotency tracking without overloading generic tables:

```prisma
// ADDITIVE PRISMA EXTENSION (Zero breaking changes to existing tables)

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

*Note: Add optional `campaignId String?` relation to the existing `Order` model for direct revenue attribution.*

---

## 6. API Changes

### New Endpoints to Introduce:
1. `GET /api/marketing/retention/cohorts`: Retrieves segmented diner counts (*Lapsed Regulars, Active Regulars, New Guests*).
2. `POST /api/marketing/retention/campaigns/trigger`: Dispatches pre-flight checked campaign to selected cohort.
3. `GET /api/marketing/retention/analytics`: Fetches attributed GMV, messages sent, and ROI metrics.
4. `GET /api/marketing/wallet/balance`: Fetches active wallet balance and transaction ledger.
5. `POST /api/marketing/wallet/topup/create-order`: Generates Razorpay payment order for wallet recharge.
6. `GET /api/webhooks/whatsapp`: Meta webhook verification handshake.
7. `POST /api/webhooks/whatsapp`: Inbound Meta delivery receipts and interactive button callbacks.

---

## 7. External Integrations
* **Meta WhatsApp Cloud API (v21.0):** REST API for dispatching pre-approved templates. Requires System User token.
* **Razorpay Payment Gateway:** Integrated for prepaid wallet UPI top-ups via standard order creation and signature verification.
* **Google Place Deep-Link:** Client-side redirect URL generation; zero direct API coupling.

---

## 8. Authentication / OAuth
* Uses existing signed JWT sessions via `requireMarketingAuth`.
* Derive tenant context purely on the server (`req.marketingContext.restaurantId`).
* External tokens stored in `ConnectedAccount` must be encrypted using AES-256-GCM.

---

## 9. Merchant Isolation
* All database queries mandate `where: { restaurantId }`.
* Socket.IO events mandate `io.to('restaurant:' + restaurantId)`.
* Diner records partitioned by `@@unique([phone, restaurantId])`.

---

## 10. Socket.IO Impact
* Only 2 targeted events introduced:
  - `service-recovery-alert`: Emitted to `restaurant:${restaurantId}` on 1–3 star negative feedback receipt.
  - `wallet-balance-updated`: Emitted to `restaurant:${restaurantId}` on successful Razorpay wallet top-up.
* No global broadcasting (`io.emit`) permitted.

---

## 11. Security Considerations
* **Anti-IDOR:** Client-submitted `restaurantId` is ignored; server token context is mandatory.
* **Timing-Safe Checks:** Webhook verification must use `crypto.timingSafeEqual`.
* **Zero Secret Leakage:** Tokens are excluded from API select clauses and never logged.

---

## 12. Performance Considerations
* **RFM Query Performance:** Add index on `Customer(restaurantId, lastOrderDate)` to keep cohort queries $<50$ms.
* **Batch Throttling:** Background dispatches must run at 10 messages/second to avoid Meta API rate limits and event-loop blocking.
* **Off-Peak Execution:** Cron scheduler executes at 11:00 AM (prior to lunch rush).

---

## 13. Failure Handling
* **Meta API Downtime:** Status set to `FAILED`; wallet balance is **not** debited for unsent messages.
* **Duplicate Webhooks:** Razorpay top-ups check `UsageRecord.referenceId` idempotency.
* **Low Wallet Balance:** Dispatches automatically abort with `INSUFFICIENT_WALLET_BALANCE` error rather than incurring negative balances.

---

## 14. Testing Requirements
* Unit tests for AES-256-GCM cipher encrypt/decrypt.
* Integration tests for `requireMarketingAuth` tenant context derivation.
* Mock tests for Meta WhatsApp template dispatch and webhook HMAC verification.
* Transactional tests for wallet credit and debit operations.

---

## 15. Implementation Order
1. **Phase 1 (Foundation):** AES-256-GCM utility, Prisma additive migration (`MarketingCampaign`, `CampaignRecipient`), environment variable validation.
2. **Phase 2 (Core Services):** `whatsAppService.ts`, `retentionService.ts`, `walletService.ts`.
3. **Phase 3 (Webhooks & Handlers):** Meta WhatsApp webhook handshake, Razorpay wallet top-up handler, Socket.IO alerts.
4. **Phase 4 (Scheduler):** `retentionCohortScheduler.ts` initialized in `server.ts`.
5. **Phase 5 (Frontend UI):** `CampaignsTab.tsx`, `WalletTab.tsx`, `ReviewsTab.tsx`, and `MarketingOverviewTab.tsx` ROI tiles.

---

## 16. Rollout & Rollback Considerations
* **Rollout:** Deploy database migration (additive), deploy backend with feature disabled (`FEATURE_RETENTION_ENGINE=false`), verify Meta webhook verification, enable feature per pilot restaurant.
* **Rollback:** Feature can be disabled instantly via feature flag or by disabling the scheduler in `server.ts`. Because all database changes are strictly additive, no destructive schema rollback is necessary.
