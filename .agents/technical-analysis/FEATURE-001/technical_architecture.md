# ZapNowQR Technical Architecture Specification: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature ID:** `FEATURE-001` (ZapNow Retention & Growth Engine MVP)  
**Status:** **FEASIBLE WITH CONSTRAINTS**  
**Date:** 2026-09-28  
**Scope:** Final Read-Only Technical Architecture Specification

---

## 1. System Overview
The **ZapNow Retention & Growth Engine (MVP)** is an integrated, multi-tenant customer re-engagement and reputation management system built into the ZapNowQR platform. It operates autonomously on first-party dining telemetry (scanned QR orders, POS bills, customer visit history) to drive direct restaurant revenue and protect online reputation.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MERCHANT ADMIN PWA                                   │
│  MarketingPage.tsx  │  MarketingOverviewTab.tsx  │  CampaignsTab  │  WalletTab        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ HTTPS / Bearer JWT (requireMarketingAuth)
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  BACKEND API GATEWAY                                   │
│  /api/marketing/retention/*   │   /api/marketing/wallet/*   │   /api/webhooks/*        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
│  COHORT ENGINE   │               │  WALLET SERVICE  │               │ WEBHOOK RECEIVER │
│ (RFM Analytics)  │               │ (Razorpay / ACID)│               │ (Meta WhatsApp)  │
└────────┬─────────┘               └────────┬─────────┘               └────────┬─────────┘
         │                                  │                                  │
         ▼                                  ▼                                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                  PRISMA POSTGRESQL DB                                  │
│ Customer │ Order │ Feedback │ ConnectedAccount │ UsageRecord │ Entitlement │ Campaign  │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
│  BACKGROUND CRON │               │ META WHATSAPP    │               │ SOCKET.IO SERVER │
│ (Off-Peak Batch) │               │   CLOUD API      │               │(room: restaurant)│
└──────────────────┘               └──────────────────┘               └──────────────────┘
```

---

## 2. Core Architectural Components

### 2.1 RFM Cohort Engine (`retentionService.ts` / `customerController.ts`)
* **Purpose:** Evaluates dine-in and takeaway records to segment diners into actionable behavioural buckets without third-party tools.
* **Cohorts Supported in MVP:**
  1. *Lapsed Regulars:* Diners with $\ge 2$ previous orders whose last order was $\ge 30$ days ago.
  2. *Active Regulars:* Diners with $\ge 2$ previous orders who ordered within the last 14 days.
  3. *New Guests:* Diners with exactly 1 order in the last 7 days.
* **Execution Pattern:** In-memory aggregation over indexed `Customer` and `Order` records scoped by `restaurantId`.

### 2.2 Template-Constrained WhatsApp Messenger (`whatsAppService.ts`)
* **Purpose:** Dispatches transactional and marketing messages via Meta Graph API v21.0.
* **Architecture:**
  - Strict compliance with Meta WhatsApp pre-approved templates (`POST /v21.0/{phone-number-id}/messages`).
  - Parameter injection for customer name, restaurant name, favorite dish, and single-click ordering URL.
  - Zero dynamic unconstrained LLM outbound messaging to prevent template rejections and delivery blocks.

### 2.3 Post-Dining Feedback & Google Review Interceptor (`feedbackService.ts`)
* **Purpose:** 20 minutes post-billing, dispatches a 2-button rating prompt to the diner.
* **Two-Way Routing Logic:**
  - **4–5 Stars ("Loved it!"):** Dynamic deep-link to the restaurant's public Google Maps review URL (`https://search.google.com/local/writereview?placeid={place_id}`).
  - **1–3 Stars ("Needs Improvement"):** Webhook logs internal `Feedback` (`isVisible: false`) and emits a real-time `service-recovery-alert` to `restaurant:${restaurantId}` for immediate manager intervention.

### 2.4 Prepaid Messaging Wallet & Ledger (`walletService.ts`)
* **Purpose:** Manages merchant marketing credits on a pay-as-you-go model.
* **Mechanics:**
  - Pre-flight balance verification prior to batch dispatches ($Balance \ge Count \times ₹0.85$).
  - Instant top-ups via Razorpay UPI checkout sheet (₹500 / ₹1,000 / ₹2,000).
  - Cryptographically verified HMAC webhooks credit the ledger inside an atomic Prisma transaction (`$transaction`).

### 2.5 Real-Time Operational Layer (Socket.IO)
* **Namespace:** Standard HTTP Socket.IO server.
* **Target Rooms:** Strictly partitioned by `restaurant:${restaurantId}`.
* **Events:**
  - `service-recovery-alert`: Emitted on receipt of 1–3 star diner feedback.
  - `wallet-balance-updated`: Emitted on verified Razorpay wallet top-up.

---

## 3. Key Design Decisions & Architectural Invariants
1. **Zero Client-Side Trust:** Tenant context is derived strictly on the server from signed JWTs via `requireMarketingAuth`. Frontend-supplied `restaurantId` fields are ignored.
2. **Zero Google OAuth Overhead:** The MVP completely avoids Google Partner API approval gates by routing 4–5 star reviews via static Google Place ID deep-links.
3. **Idempotent Dispatches:** Every message recipient logs an idempotency key (`campaign_${campaignId}_cust_${customerId}_date_${yyyy_mm_dd}`) to eliminate duplicate WhatsApp sends.
4. **No Destructive Database Alterations:** All schema extensions are additive; core models (`Customer`, `Order`, `Feedback`, `Restaurant`) remain completely backwards-compatible.
