# ZapNowQR Engineering Plan: FEATURE-001 (Updated for MSG91 WhatsApp API)
**Role:** `engineering_lead_agent`  
**Feature Name:** ZapNow Retention & Growth Engine (MVP)  
**Feature ID:** `FEATURE-001`  
**Provider Boundary:** MSG91 WhatsApp API v5 (Replacing Direct Meta Graph API)  
**Date:** 2026-09-28  
**Execution Mode:** Engineering Planning & Task Delegation Specification (Zero application code modified)

---

## 1. Feature & Objective
Deliver the **ZapNow Retention & Growth Engine (MVP)** without compromising existing dining, POS billing, kitchen operations, multi-tenant isolation, or database integrity.

Following the platform architectural decision, ZapNowQR will **NOT** directly integrate with the Meta Graph API. ZapNowQR utilizes **MSG91 WhatsApp API v5** as the unified messaging provider boundary, maximizing code reuse from ZapNow's existing MSG91 SMS and OTP infrastructure.

---

## 2. Approved MVP Scope
1. **Autonomous Lapsed-Customer Reactivation:** RFM cohort detection ($\ge 2$ visits, last order $\ge 30$ days ago), pre-flight wallet check, and dispatch of pre-approved WhatsApp win-back templates via MSG91 with dynamic direct ordering links (`/#/menu?restaurantId=...&coupon=...&campaignId=...`).
2. **Post-Dining Review Booster & Interception:** 20 minutes post-billing (`status: 'COMPLETED'` / `paymentStatus: 'PAID'`), dispatches a 2-button interactive WhatsApp rating prompt via MSG91:
   - *4–5 Stars ("Loved it!"):* Directs diner to the restaurant's public Google Maps review URL (`https://search.google.com/local/writereview?placeid={place_id}`).
   - *1–3 Stars ("Needs Improvement"):* Writes private entry in `Feedback` table (`isVisible: false`) and emits a real-time `service-recovery-alert` over Socket.IO to `restaurant:${restaurantId}`.
3. **Prepaid Messaging Wallet & Ledger:** Top-ups via Razorpay UPI (₹500 / ₹1,000 / ₹2,000), atomic ledger credit upon verified webhook signature, and per-message debit deduction (~₹0.85/delivered conversation).
4. **Closed-Loop ROI Attribution Tile:** Admin dashboard metric card displaying: *Messages Sent | Wallet Spend | Orders Placed | Attributed GMV | Net ROI Multiplier*.

---

## 3. Explicitly Out-of-Scope (Strictly Enforced)
* Direct Meta Graph API integration and Meta App OAuth flows.
* Social media feed/story/reel publishing (Instagram / Facebook Graph API).
* AI video generation (Sora / Kling / Runway) and canvas graphic design tools.
* Unconstrained real-time dynamic LLM copywriting.
* Complex drag-and-drop workflow builders.
* 3PL delivery fleet dispatch (Shadowfax / Dunzo / Porter).

---

## 4. Engineering Team & Specialist Assignments

| Specialist Role | Responsibility for FEATURE-001 | Task IDs Owned | Status |
| :--- | :--- | :--- | :---: |
| **`database_engineer`** | Additive Prisma migrations, indexes, and recipient tracking with provider message ID | TASK-001 | **MODIFIED** |
| **`backend_engineer`** | RFM cohort engine, retention controller, wallet controller, order completion hook, scheduler | TASK-003, TASK-005, TASK-006 | **MODIFIED** |
| **`integration_engineer`** | MSG91 WhatsApp client, MSG91 Webhook handlers (Delivery & Inbound), crypto utility | TASK-002, TASK-004 | **MODIFIED** |
| **`frontend_engineer`** | React admin UI: CampaignsTab, WalletTab, ReviewsTab, and Closed-Loop ROI card | TASK-007, TASK-008 | **UNCHANGED** |
| **`qa_engineer`** | Automated unit, integration, tenant-isolation, and non-regression test suites (MSG91 mocks) | TASK-009, TASK-010 | **MODIFIED** |
| **`security_reviewer`** | Independent audit of auth, anti-IDOR, MSG91 authkey secrecy, and webhook auth | TASK-011 | **MODIFIED** |
| **`code_reviewer`** | Final pull request verification, type safety, and production safety gate | TASK-012 | **UNCHANGED** |

---

## 5. File Ownership Matrix

| File / Module Area | Primary Owner | Reviewer | Scope / Allowed Changes |
| :--- | :--- | :--- | :--- |
| `backend/prisma/schema.prisma` | `database_engineer` | `code_reviewer` | Additive models (`MarketingCampaign`, `CampaignRecipient` with `providerMessageId`) |
| `backend/src/services/msg91WhatsAppService.ts` | `integration_engineer` | `code_reviewer` | **NEW:** Outbound MSG91 WhatsApp API v5 wrapper implementing `IWhatsAppProvider` |
| `backend/src/utils/env.ts` | `integration_engineer` | `security_reviewer` | Validate `MSG91_AUTH_KEY`, `MSG91_WHATSAPP_INTEGRATED_NUMBER`, `MSG91_WEBHOOK_TOKEN` |
| `backend/src/modules/marketing/controllers/` | `backend_engineer` | `code_reviewer` | `retentionController.ts`, `walletController.ts` |
| `backend/src/routes/webhookRoutes.ts` | `integration_engineer` | `security_reviewer` | Mount `/api/webhooks/msg91/whatsapp/delivery` and `inbound` |
| `backend/src/controllers/orderController.ts` | `backend_engineer` | `code_reviewer` | Non-blocking post-dining review trigger hook |
| `backend/src/jobs/retentionCohortScheduler.ts` | `backend_engineer` | `code_reviewer` | In-process daily win-back scheduler |
| `pages/Admin/pages/Marketing/` | `frontend_engineer` | `code_reviewer` | Tabs: `CampaignsTab.tsx`, `WalletTab.tsx`, `ReviewsTab.tsx` |
| **Existing SMS (`services/msg91Service.ts`)** | `integration_engineer` | `code_reviewer` | **REUSE / PRESERVE:** Existing SMS & OTP methods remain 100% untouched |
| **Core Dining Checkout (`pages/MenuPage.tsx`)** | **PROTECTED** | — | **DO NOT TOUCH** |
| **KDS (`pages/KDS/`, `kdsController.ts`)** | **PROTECTED** | — | **DO NOT TOUCH** |
| **External Systems (`openclaw/`)** | **FORBIDDEN** | — | **DO NOT TOUCH** |

---

## 6. System Contracts

### 6.1 Database Contract (Prisma)
* Additive models: `MarketingCampaign` and `CampaignRecipient`.
* `CampaignRecipient` stores `providerMessageId String?` (captures MSG91 `message_id` for delivery tracking).
* Composite unique constraint `idempotencyKey String @unique`.
* Optional relation on `Order`: `campaignId String?`.
* Composite index `Customer(restaurantId, lastOrderDate)` for sub-50ms RFM query performance.

### 6.2 API Contract
* `GET /api/marketing/retention/cohorts` → Returns `{ lapsedRegulars: number, activeRegulars: number, newGuests: number }`.
* `POST /api/marketing/retention/campaigns/trigger` → Body: `{ type: 'WIN_BACK_LAPSED' }`. Returns `{ success: true, targeted: number, dispatched: number }`.
* `GET /api/marketing/retention/analytics` → Returns `{ messagesSent: number, totalSpend: number, ordersPlaced: number, attributedGmv: number, roiMultiplier: number }`.
* `GET /api/marketing/wallet/balance` → Returns `{ balance: number, currency: 'INR', history: UsageRecord[] }`.
* `POST /api/marketing/wallet/topup/create-order` → Body: `{ amount: number }`. Returns Razorpay order intent `{ orderId, amount, currency, key }`.

### 6.3 MSG91 Integration Contract
* Outbound: `POST https://api.control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/` (Header: `authkey`).
* Inbound Delivery Reports: `POST /api/webhooks/msg91/whatsapp/delivery` (Header: `Authorization: Bearer <TOKEN>`).
* Inbound Customer Interactivity: `POST /api/webhooks/msg91/whatsapp/inbound` (Header: `Authorization: Bearer <TOKEN>`).
* Strict 8-second response SLA with idempotent message deduplication.

### 6.4 Realtime Contract (Socket.IO)
* **Room Convention:** Strictly `restaurant:${restaurantId}`.
* **Events:**
  - `service-recovery-alert`: Payload `{ type: 'NEGATIVE_FEEDBACK_INTERCEPTED', customerPhone, customerName, feedback, orderId, timestamp }`.
  - `wallet-balance-updated`: Payload `{ newBalance: number, timestamp }`.
* **Prohibited:** `io.emit()` (global broadcasting) is strictly forbidden.

---

## 7. Implementation Sequencing & Concurrency

```text
[Phase 1: Foundations]
   TASK-001 (Additive DB Migration) ──┬──► TASK-002 (MSG91 Env & Crypto Config)
                                      │
[Phase 2: Contracts & Core Engine]
   ├──────────────────────────────────┼──────────────────────────────┐
   ▼                                  ▼                              ▼
TASK-003 (Backend Retention APIs)   TASK-004 (MSG91 WhatsApp API)   TASK-007 (Frontend Shell)
   │                                  │                              │
[Phase 3: Workflows & Feature UI]     │                              │
   ▼                                  ▼                              ▼
TASK-005 (Wallet & Razorpay Top-up) TASK-006 (Review Trigger)       TASK-008 (Frontend Tabs)
   │                                  │                              │
   └──────────────────────────────────┼──────────────────────────────┘
                                      ▼
[Phase 4: Automated Testing & Verification]
   TASK-009 & TASK-010 (QA Suites & Tenant Isolation Tests)
                                      ▼
[Phase 5: Release Gates]
   TASK-011 (Independent Security Review) ──► TASK-012 (Final Code Review)
```

---

## 8. Security & Quality Gates
1. **Zero Authkey Leakage:** `MSG91_AUTH_KEY` must only exist in backend server memory. Never exposed in API responses or frontend bundles.
2. **Webhook Bearer Authentication:** All callbacks on `/api/webhooks/msg91/*` must validate `Authorization: Bearer <TOKEN>` using `crypto.timingSafeEqual`.
3. **Tenant Isolation Gate:** Every database query must enforce `where: { restaurantId: req.marketingContext.restaurantId }`.
4. **Idempotency Gate:** Webhook handlers acknowledge duplicate `message_id` payloads without duplicate database state mutations or wallet refunds.

---

## 9. Rollout & Rollback Strategy
* **Feature Flag:** `FEATURE_RETENTION_ENGINE=true|false` controls scheduler activation and trigger endpoints.
* **Rollback Procedure:** Setting `FEATURE_RETENTION_ENGINE=false` suspends all background dispatches immediately. All Prisma schema changes are additive, requiring zero database downtime or destructive rollbacks.
