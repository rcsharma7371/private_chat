# ZapNowQR Repository Discovery Map: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature ID:** `FEATURE-001` (ZapNow Retention & Growth Engine MVP)  
**Reference Document:** [.agents/product-council/discussions/FEATURE-001/final_report.md](../../product-council/discussions/FEATURE-001/final_report.md)  
**Date:** 2026-09-28  
**Scope:** READ-ONLY Technical Repository Discovery (No implementation code, no schema modifications)

---

## 1. Approved MVP Scope vs. Out-of-Scope (from Final Council Report)

### 1.1 In-Scope for MVP Technical Architecture
1. **Automated Customer Cohort Engine (RFM):** Classify diners into *Active Regulars*, *Lapsed Regulars (30+ days inactive)*, and *New Guests* using existing `Order` and `Customer` tables.
2. **Pre-Approved Meta WhatsApp Campaign Catalog:** Standard F&B message templates with dynamic variable injection (`{{customer_name}}`, `{{favorite_dish}}`, `{{discount_link}}`).
3. **Post-Dining Google Review Booster & Interception:** Automated message 20 minutes post-billing: 4–5 stars redirect to Google Maps review link; 1–3 stars trigger private alert to manager.
4. **Prepaid WhatsApp Messaging Wallet & Ledger:** Balance tracking, Razorpay UPI top-up, and per-message debit deduction.
5. **Closed-Loop ROI Attribution:** Mobile-first dashboard showing *Messages Sent | Wallet Cost | Orders Placed | Attributed GMV*.

### 1.2 Explicitly Out-of-Scope (Pruned by Council)
* **Instagram / Facebook Content Publishing:** Excluded.
* **AI Short-Form Video & Image Generation (Sora/Kling/Image Gen):** Excluded.
* **Unconstrained Real-Time LLM Copywriting:** Excluded (violates Meta template pre-approval rules).
* **Complex Boolean Marketing Drag-and-Drop Builders:** Excluded.
* **3PL Hyperlocal Fleet Dispatch (Shadowfax/Dunzo/Porter):** Excluded from initial phase.

---

## 2. Relevant Frontend Modules

| File Path | Component / Responsibility | Current State & Relevance to MVP |
| :--- | :--- | :--- |
| `pages/Admin/pages/Marketing/MarketingPage.tsx` | Main Marketing layout & tab router | **Existing / Reusable.** Currently mounts tabs: `overview`, `create`, `content`, `accounts`, `media`, `brand`, `usage`. Can host the MVP Retention tabs (`Overview`, `Campaigns`, `Reviews`, `Wallet`). |
| `pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx` | Marketing overview dashboard | **Existing / Reusable.** Already contains metric cards, quick draft actions, and layout primitives. Can be adapted to show the closed-loop ROI tile (*Messages Sent, Wallet Spend, Orders Placed, Attributed GMV*). |
| `pages/Admin/pages/Customers/CustomersPage.tsx` | Customer management & history view | **Existing / Reusable.** Displays customer lists, visit recency, and order stats. Provides UI patterns for displaying RFM cohorts. |
| `pages/AdminDashboard.tsx` & `src/App.tsx` | Admin navigation and router config | **Existing / Intact.** Hosts the `/admin/marketing` route. No breaking routing changes needed. |
| `src/services/marketingApi.ts` *(or inline fetch)* | Client API communications | **Existing / Extendable.** Existing marketing API calls can be augmented with cohort queries and wallet balance fetches. |

---

## 3. Relevant Backend Modules

| File Path | Module / Responsibility | Relevance to FEATURE-001 MVP |
| :--- | :--- | :--- |
| `backend/src/modules/marketing/routes/marketingRoutes.ts` | Marketing Express router | **Existing / Reusable.** Mounted at `/marketing` and `/api/marketing` in `backend/src/app.ts`. Provides dedicated router surface for growth endpoints. |
| `backend/src/modules/marketing/middleware/marketingAuth.ts` | Marketing merchant authentication | **Existing / Reusable.** Enforces strict tenant isolation by binding `req.restaurantId = req.user.restaurantId`. |
| `backend/src/controllers/customerController.ts` | Customer directory & stats controller | **Existing / Reusable.** `getCustomerStats` (lines 249–328) already computes `totalOrders`, `totalSpent`, `lastVisit`, and order source breakdown (`qrDineIn`, `qrTakeaway`, `staff`) scoped strictly to `restaurantId`. |
| `backend/src/controllers/orderController.ts` | Order lifecycle and state management | **Existing / Hook Point.** Handles order status updates (`COMPLETED`, `PAID`). Serves as trigger point for scheduling the 20-minute post-dining review prompt. |
| `backend/src/controllers/paymentController.ts` & `razorpayWebhook.ts` | Razorpay payment integration | **Existing / Reusable.** Provides payment verification patterns for handling prepaid messaging wallet top-ups via Razorpay UPI. |
| `backend/src/jobs/` & `backend/src/server.ts` | In-process background schedulers | **Existing Architecture.** Schedulers (`paymentReconciliationJob.ts`, `autoPrepScheduler.ts`, `orderRefundRetryJob.ts`) run via `setInterval` loops initialized in `server.ts`. A dedicated `retentionCohortScheduler.ts` can follow this established pattern. |

---

## 4. Relevant Database Models (`backend/prisma/schema.prisma`)

### 4.1 Core Existing Models (Zero Changes Needed for Discovery)
* `Customer` (lines 681–696):
  - Fields: `id`, `restaurantId`, `phone`, `name`, `totalOrders`, `totalSpent`, `lastOrderDate`, `createdAt`.
  - Constraint: `@@unique([phone, restaurantId])` — **Guarantees clean tenant isolation**.
  - Relations: `orders Order[]`, `feedbacks Feedback[]`.
* `Order` (lines 720+):
  - Fields: `id`, `restaurantId`, `customerId`, `customerPhone`, `totalAmount`, `status`, `paymentStatus`, `source`, `createdAt`.
  - Relations: `items OrderItem[]`, `customer Customer?`.
* `Feedback` (lines 1139–1164):
  - Fields: `id`, `restaurantId`, `customerId`, `customerName`, `customerPhone`, `rating` (Int), `title`, `review`, `isApproved`, `isVisible`.
  - Index: `@@index([restaurantId])`, `@@index([rating])`.
  - Perfect foundation for storing the post-dining rating before external Google Maps redirect.
* `Restaurant` (lines 50+):
  - Core merchant entity linking all tenant data.

### 4.2 Existing Marketing Extension Models (Already in Schema)
* `ConnectedAccount` (lines 1577–1602):
  - Stores OAuth tokens, `platform` (enum `MarketingPlatform`), `externalAccountId`, `encryptedAccessToken`, `encryptedRefreshToken`.
  - Can store Meta WhatsApp Cloud API credentials per restaurant.
* `UsageRecord` (lines 1737–1752):
  - Tracks units consumed (`WHATSAPP_SEND`), `baseBalanceAfter`, `extraBalanceAfter`.
* `Entitlement` (lines 1792–1811):
  - Tracks `baseUnits`, `consumedUnits`, `purchasedExtraUnits`.
* `Content` & `ContentPublication` (lines 1654–1711):
  - Tracks outbound marketing messages, publication status (`PENDING`, `PUBLISHED`, `FAILED`).

---

## 5. Relevant Authentication & Authorization

1. **Merchant Admin Authentication:**
   - Handled via `authenticate` middleware in `backend/src/middleware/auth.ts`.
   - JWT payload contains `{ id, restaurantId, role }`.
   - Standardizes server-side verification: `(req as any).user.restaurantId`.
2. **Marketing Module Middleware:**
   - `requireMarketingAuth` in `backend/src/modules/marketing/middleware/marketingAuth.ts`.
   - Checks active merchant session and enforces that requests cannot manipulate another restaurant's marketing data.
3. **Customer QR Authentication:**
   - `softVerifyCustomerToken` and `verifyCustomerToken` in `backend/src/middleware/customerAuth.ts`.
   - Verifies customer phone session during QR ordering.

---

## 6. Relevant External Integrations

1. **Meta WhatsApp Cloud API (Graph API):**
   - Protocol: REST HTTPS (`POST https://graph.facebook.com/v21.0/{phone-number-id}/messages`).
   - Authentication: System User Permanent Token / App Access Token.
   - Payload: Pre-approved template specification with parameter array (`parameters: [{ type: 'text', text: '...' }]`).
2. **Razorpay Payment Gateway:**
   - Existing integration in `backend/src/controllers/paymentController.ts`.
   - Used for creating UPI order intents to top up the restaurant's prepaid WhatsApp messaging wallet.
3. **Google Business Profile (GBP) Review URL:**
   - Deep-link mechanism: `https://search.google.com/local/writereview?placeid={place_id}`.
   - Stored in restaurant settings or `ConnectedAccount.metadata` to route 4–5 star raters directly to Google Maps.

---

## 7. Relevant Existing Customer, Order & Merchant Data

1. **Transaction Telemetry:**
   - Every dine-in QR scan and takeaway order logs `customerPhone`, `items`, `totalAmount`, `orderType` (`DINE_IN`, `TAKEAWAY`, `DELIVERY`), and `createdAt`.
   - RFM variables (Recency = days since `lastOrderDate`, Frequency = `totalOrders`, Monetary = `totalSpent`) are already present in `Customer` and `Order` tables.
2. **Tenant Isolation Guarantees:**
   - All customer queries use `where: { restaurantId }`.
   - The unique compound key `@@unique([phone, restaurantId])` ensures customers visiting multiple restaurants have completely isolated records per tenant.

---

## 8. Relevant Configuration & Environment Variables

Current environment configuration in `backend/.env` (validated via `backend/src/utils/env.ts`):
* `DATABASE_URL`: PostgreSQL connection string.
* `JWT_SECRET`: Secret for signing merchant admin tokens.
* `RAZORPAY_KEY_ID` & `RAZORPAY_KEY_SECRET`: Razorpay credentials for payment handling.
* `FRONTEND_URL`: URL used for generating 1-tap direct ordering links (`${FRONTEND_URL}/#/menu?restaurantId=...&coupon=...&campaign=...`).
* **Required New Env Vars for MVP:**
  - `WHATSAPP_CLOUD_API_TOKEN`: Meta access token (if centralized) or per-restaurant encrypted credentials in `ConnectedAccount`.
  - `WHATSAPP_PHONE_NUMBER_ID`: Meta phone number ID.
  - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: Token for validating incoming Meta delivery receipts.

---

## Summary of Discovery Findings
* **Reusable Code Extent: ~70%.** The ZapNow repository already contains the customer database, RFM query logic in `customerController.ts`, marketing routes, marketing middleware, and the Prisma marketing extension schema.
* **No Unnecessary Reinvention:** We do not need to create customer tables or basic marketing models from scratch; we can leverage existing models (`Customer`, `Order`, `Feedback`, `ConnectedAccount`, `UsageRecord`) and focus purely on the zero-touch WhatsApp trigger and Google review booster logic.
