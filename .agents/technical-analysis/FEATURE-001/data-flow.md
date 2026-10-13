# ZapNowQR End-to-End Data Flow Architecture: FEATURE-001
**Role:** `principal_code_analyst`  
**Feature ID:** `FEATURE-001` (ZapNow Retention & Growth Engine MVP)  
**Reference Document:** [.ai/technical-analysis/FEATURE-001/repository-map.md](repository-map.md)  
**Date:** 2026-09-28  
**Scope:** READ-ONLY Technical Data Flow Trace (Approved MVP Workflows)

---

## 1. Overview of Approved MVP Data Flows
This document traces the four core execution loops that constitute the **ZapNow Retention & Growth Engine (MVP)**:
1. **Flow 1:** Autonomous Lapsed-Customer Reactivation (RFM Win-Back Loop)
2. **Flow 2:** Post-Dining Google Review Booster & Negative Feedback Interception Loop
3. **Flow 3:** Prepaid WhatsApp Messaging Wallet Top-Up Loop
4. **Flow 4:** Closed-Loop ROI Attribution & Real-Time Dashboard Reporting

---

## 2. Flow 1: Autonomous Lapsed-Customer Reactivation (RFM Win-Back)

### Data Path Trace:
```text
Cron Scheduler / Admin Trigger
         ↓
Backend Cohort Engine (customerController / retentionService)
         ↓
Database (Customer + Order tables)
         ↓
Pre-Flight Wallet Check (UsageRecord / Entitlement)
         ↓
External Service (Meta WhatsApp Cloud API v21.0)
         ↓
Customer Handset (Interactive WhatsApp Message)
         ↓
Customer Action (1-Tap Direct Reorder Link)
         ↓
ZapNow Menu / UPI Checkout (Order creation with campaignId)
         ↓
Result & Metrics Update (Attributed GMV + Wallet Debit)
```

### Step-by-Step Data Flow:
1. **Trigger:**
   - *Automated:* Background scheduler (`retentionCohortScheduler.ts` via `setInterval` in `backend/src/server.ts`) runs daily at 11:00 AM off-peak.
   - *Manual:* Merchant clicks *"Preview & Send Lapsed Regulars"* in `MarketingOverviewTab.tsx` via `POST /api/marketing/retention/campaigns/trigger`.
2. **Backend & Tenant Context:**
   - Request enters `requireMarketingAuth` middleware (`backend/src/modules/marketing/middleware/marketingAuth.ts`), resolving `req.restaurantId = req.user.restaurantId`.
3. **Database Query:**
   - Evaluates RFM query on `Customer` and `Order` scoped by `restaurantId`:
     ```typescript
     const lapsedCustomers = await prisma.customer.findMany({
       where: {
         restaurantId,
         totalOrders: { gte: 2 },
         lastOrderDate: { lte: thirtyDaysAgo }
       },
       include: {
         orders: {
           take: 1,
           orderBy: { createdAt: 'desc' },
           include: { items: true }
         }
       }
     });
     ```
4. **Pre-Flight Wallet Verification:**
   - Queries `UsageRecord` / `Entitlement` to verify the merchant has sufficient prepaid messaging balance (`balance >= lapsedCustomers.length * ₹0.85`).
   - If balance is insufficient, aborts batch send and prompts top-up (no negative balances allowed).
5. **External API Call (Meta WhatsApp Cloud API):**
   - Calls `POST https://graph.facebook.com/v21.0/{phone_number_id}/messages` with payload:
     ```json
     {
       "messaging_product": "whatsapp",
       "to": "919876543210",
       "type": "template",
       "template": {
         "name": "zapnow_winback_offer_v1",
         "language": { "code": "en" },
         "components": [
           {
             "type": "body",
             "parameters": [
               { "type": "text", "text": "Rahul" },
               { "type": "text", "text": "Biryani Central" },
               { "type": "text", "text": "Paneer Biryani" }
             ]
           },
           {
             "type": "button",
             "sub_type": "url",
             "index": "0",
             "parameters": [
               { "type": "text", "text": "menu?r=rest_123&coupon=MISSYOU15&utm_cmp=cmp_789" }
             ]
           }
         ]
       }
     }
     ```
6. **Customer Conversion & Result:**
   - Diner clicks the link, which opens the ZapNow customer PWA with coupon `MISSYOU15` pre-applied.
   - Diner completes order via standard UPI payment.
   - `orderController.createOrder` receives `campaignId: 'cmp_789'`.
   - Attributed revenue is credited to the campaign record.

---

## 3. Flow 2: Post-Dining Google Review Booster & Negative Feedback Interception

### Data Path Trace:
```text
POS / QR Dine-In Checkout
         ↓
Order Status -> COMPLETED / PAID (orderController.ts)
         ↓
Delayed Background Trigger (20 mins post-bill)
         ↓
Meta WhatsApp Cloud API (Survey Template)
         ↓
Customer Handset (2-Button Feedback Prompt)
         ↓
   ┌───────────────────────┴────────────────────────┐
   ▼                                                ▼
Path A: 4–5 Stars ("Great!")          Path B: 1–3 Stars ("Needs Improvement")
   ↓                                                ↓
External Deep-Link to Google Maps     Internal Feedback Record (Database)
(https://search.google.com/...)                     ↓
   ↓                                  Manager Alert via Socket.IO & WhatsApp
Public 5-Star Google Review                         ↓
                                      Instant Service Recovery
```

### Step-by-Step Data Flow:
1. **Order Completion Hook:**
   - In `backend/src/controllers/orderController.ts`, when an order transitions to `status: 'COMPLETED'` or `paymentStatus: 'PAID'`:
   - An event or queue item is logged with `triggerAt = Date.now() + (20 * 60 * 1000)`.
2. **Trigger Execution:**
   - Review job worker checks due orders where `customerPhone` exists and review message has not yet been sent.
3. **Dispatch via WhatsApp Cloud API:**
   - Sends interactive survey message:
     *"Thank you for dining at {{restaurant_name}}! How was your experience today?"*
     - Button 1: ⭐⭐⭐⭐⭐ Loved it!
     - Button 2: ⚠️ Needs Improvement
4. **Diner Interactive Response Routing:**
   - **Scenario A (Positive: Loved it):**
     - Button contains dynamic deep-link URL: `https://search.google.com/local/writereview?placeid=${restaurant.googlePlaceId}`.
     - Directs customer straight into the native Google Maps review flow.
   - **Scenario B (Negative / Constructive Feedback):**
     - Diner taps "Needs Improvement" or replies with critique.
     - WhatsApp Webhook (`POST /api/webhooks/whatsapp`) receives the inbound button callback.
     - Creates a record in the existing `Feedback` table (`backend/prisma/schema.prisma` lines 1139–1164):
       ```typescript
       await prisma.feedback.create({
         data: {
           restaurantId,
           customerId: order.customerId,
           customerName: order.customerName,
           customerPhone: order.customerPhone,
           rating: 2,
           review: incomingMessageText,
           isApproved: false,
           isVisible: false // Kept private from public view
         }
       });
       ```
5. **Realtime Manager Alert (Socket.IO):**
   - Emits private event to the restaurant's operational room:
     ```typescript
     io.to(`restaurant:${restaurantId}`).emit('service-recovery-alert', {
       type: 'NEGATIVE_FEEDBACK_INTERCEPTED',
       customerPhone: order.customerPhone,
       customerName: order.customerName,
       feedback: incomingMessageText,
       orderId: order.id,
       timestamp: new Date()
     });
     ```
   - Kitchen POS / Admin dashboard displays an urgent popup: *"Diner at Table 4 gave low rating: [Cold soup]. Tap to WhatsApp or call customer immediately."*

---

## 4. Flow 3: Prepaid WhatsApp Messaging Wallet Top-Up

### Data Path Trace:
```text
Merchant Admin UI (MarketingPage.tsx -> Wallet Tab)
         ↓
API: POST /api/marketing/wallet/topup/create-order
         ↓
Backend (paymentController.ts / razorpayService)
         ↓
Razorpay API (Order Intent Created)
         ↓
Merchant Screen (Razorpay UPI Checkout Modal)
         ↓
Razorpay Webhook (POST /api/webhooks/razorpay)
         ↓
Cryptographic Signature Verification (HMAC SHA-256)
         ↓
Prisma Transaction (Credit Wallet Balance + Log Ledger Entry)
         ↓
Socket.IO Event to Merchant (`wallet-balance-updated`)
         ↓
Admin UI Badge Updates Live (e.g. ₹1,500.00 Balance)
```

### Step-by-Step Data Flow:
1. **Merchant Initiates Top-Up:**
   - Merchant selects a pack (₹500 for ~580 messages, ₹1,000 for ~1,200 messages) in `MarketingPage.tsx`.
   - Frontend calls `POST /api/marketing/wallet/topup/create-order` with `{ amount: 1000 }`.
2. **Backend Order Creation:**
   - Authenticated route verifies merchant session (`req.user.restaurantId`).
   - Calls Razorpay Orders API: `razorpay.orders.create({ amount: 100000, currency: 'INR', notes: { restaurantId, type: 'MARKETING_WALLET' } })`.
3. **UPI Payment Execution:**
   - Merchant completes payment via GPay / PhonePe / Paytm on the Razorpay modal.
4. **Webhook Receipt & Verification:**
   - `POST /api/webhooks/razorpay` receives `payment.captured` event.
   - Verifies `x-razorpay-signature` using `crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)`.
5. **ACID Ledger Credit:**
   - In a single Prisma `$transaction`:
     - Updates `Entitlement` / `Wallet`: increments `purchasedExtraUnits` or balance.
     - Inserts `UsageRecord` with `action: 'LIFETIME_TOPUP'`, `unitsConsumed: 0`, `description: 'Razorpay UPI Topup - ₹1000'`.
6. **Realtime Socket.IO Update:**
   - Emits event: `io.to('restaurant:' + restaurantId).emit('wallet-balance-updated', { newBalance: 1500.00 })`.
   - Admin UI updates immediately without manual page refresh.

---

## 5. Flow 4: Closed-Loop ROI Attribution & Real-Time Reporting

### Data Path Trace:
```text
Merchant visits Marketing Dashboard (MarketingOverviewTab.tsx)
         ↓
API: GET /api/marketing/retention/analytics?timeframe=30d
         ↓
Backend (customerController / marketingAnalyticsController)
         ↓
Prisma Aggregations (Campaigns + Orders with campaignId + UsageRecord)
         ↓
JSON Response (Messages Sent, Spend, Orders, Direct GMV, ROI Multiplier)
         ↓
Frontend Tile Render ("₹48 Spent → ₹1,420 Orders Generated = 29.5x ROI")
```

### Attribution Mechanics:
* **Attribution Window:** 72 hours from WhatsApp link tap or coupon application.
* **Matching Rule:** `Order.campaignId === campaign.id` OR (`Order.couponCode === campaign.couponCode` AND `Order.customerId === campaignRecipient.customerId`).
* **Calculation:**
  - `Total Attributed GMV` = Sum of all converted orders' `totalAmount`.
  - `Campaign Cost` = Count of delivered WhatsApp templates × ₹0.85.
  - `Net ROI Ratio` = `Total Attributed GMV / Campaign Cost`.

---

## 6. Socket.IO Relevance Matrix

| Scenario | Is Socket.IO Required? | Event Name | Room | Emitter | Listener | Rationale |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| **Negative Review Interception** | **YES** | `service-recovery-alert` | `restaurant:${restaurantId}` | `whatsappWebhookController.ts` | Admin POS / Kitchen Display | Urgent operational requirement: Manager must intercept customer before they leave the dining table or vent publicly on Google. |
| **Wallet Balance Top-Up** | **YES** | `wallet-balance-updated` | `restaurant:${restaurantId}` | `razorpayWebhook.ts` | `MarketingPage.tsx` | Instant visual confirmation when merchant completes UPI payment on their mobile device. |
| **Lapsed Customer Batch Dispatch** | **NO** | — | — | — | — | Long-running background batch; progress is queryable via standard REST polling or simple notification badge. |
| **Standard Google 5-Star Review Tap** | **NO** | — | — | — | — | External link directly to Google Maps; zero in-app state change required. |

---

## Summary
The data flows for FEATURE-001 MVP strictly leverage ZapNow's existing transaction pipelines, tenant boundaries (`restaurant:${restaurantId}`), and database tables (`Customer`, `Order`, `Feedback`, `UsageRecord`), introducing Socket.IO strictly where low-latency operational intervention is mandatory (Negative Review Interception & Live Wallet Balance Confirmation).
