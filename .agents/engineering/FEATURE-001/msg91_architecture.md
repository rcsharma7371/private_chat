# ZapNowQR MSG91 WhatsApp Architecture Specification: FEATURE-001
**Role:** `engineering_lead_agent`  
**Feature Name:** ZapNow Retention & Growth Engine (MVP)  
**Provider Decision:** MSG91 WhatsApp API v5  
**Date:** 2026-09-28  
**Scope:** Provider Boundary, Integration Topology, and Data Contracts (Zero application code modified)

---

## 1. Architectural Overview & Provider Boundary

ZapNowQR utilizes **MSG91 WhatsApp API v5** as the sole messaging provider boundary for WhatsApp communications in FEATURE-001. Direct integration with Meta Graph API is eliminated from the ZapNow application stack.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     ZAPNOW PLATFORM                                    │
│                                                                                        │
│   Business Layer             Provider Boundary              HTTP Transport             │
│  ┌──────────────────────┐    ┌─────────────────────────┐    ┌──────────────────────┐   │
│  │ retentionController  │───►│ msg91WhatsAppService    │───►│ axios client         │   │
│  │ reviewSurveyScheduler│    │ (IWhatsAppProvider)     │    │ (authkey header)     │   │
│  └──────────────────────┘    └─────────────────────────┘    └──────────┬───────────┘   │
└────────────────────────────────────────────────────────────────────────┼───────────────┘
                                                                         │ HTTPS (Port 443)
                                                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   MSG91 CLOUD (v5 API)                                 │
│  • api.control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/                    │
│  • Webhook Dispatcher (On Outbound Report Received / On Inbound Message Received)      │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Meta Cloud API / Partner Channel
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              WHATSAPP / META INFRASTRUCTURE                            │
│  • WhatsApp Business Account (WABA)                                                    │
│  • Registered & Approved Business Phone Numbers                                        │
│  • Pre-approved WhatsApp Templates (Utility / Marketing)                               │
└────────────────────────────────────────┬───────────────────────────────────────────────┘
                                         │ Encrypted WhatsApp Protocol
                                         ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CUSTOMER HANDSET                                    │
│  • Interactive Template Message (Win-back Offer / Post-Dining Review Prompt)           │
│  • Quick-Reply Action Buttons                                                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Platform Responsibilities & Separation of Concerns

It is critical to distinguish what ZapNow controls, what MSG91 controls, and what the WhatsApp/Meta platform controls:

| Responsibility Domain | ZapNow Platform | MSG91 Provider | Meta / WhatsApp Platform |
| :--- | :---: | :---: | :---: |
| **RFM Cohort Analytics & Dining Data** | **Full Control** | Zero | Zero |
| **Prepaid Wallet & Financial Ledger** | **Full Control** | Zero | Zero |
| **Template Outbound Formatting** | Constructs payload | Translates to Meta format | Renders on handset |
| **Outbound Message Delivery** | Triggers via REST | Queues & relays to Meta | Delivers to device |
| **Delivery Status Tracking (DLR)** | Consumes webhook | Emits webhook callbacks | Generates device receipts |
| **Interactive Button Response Routing** | Consumes webhook | Forwards inbound webhook | Captures tap on device |
| **WABA & Phone Number Registration** | Provides business docs | Hosts integrated number | Grants WABA verification |
| **Template Verification & Approval** | Submits content | Mediates with Meta | Enforces template rules |
| **Revenue & GMV Attribution** | **Full Control** | Zero | Zero |

---

## 3. Existing Code Reuse: `Msg91Service`

ZapNow already uses MSG91 extensively for SMS OTPs, transactional order notifications, and invoices in [`backend/src/services/msg91Service.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/services/msg91Service.ts).

### 3.1 Reusable Elements:
1. **Authentication Pattern:** Uses `authkey` header passed to MSG91 control endpoints. Validated via `process.env.MSG91_AUTH_KEY` in [`backend/src/utils/env.ts`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/src/utils/env.ts).
2. **Phone Number Formatting:** Standardizes recipient numbers to `91XXXXXXXXXX` (strips spaces, removes `+`, ensures country code prefix).
3. **HTTP Client & Error Logging:** Utilizes `axios` with structured error logging (`logger.error`).

### 3.2 Elements That Must Remain Separate:
1. **SMS Flows vs. WhatsApp Templates:** SMS uses the Flow API (`/api/v5/flow/`), whereas WhatsApp requires the Outbound Message API (`/api/v5/whatsapp/whatsapp-outbound-message/`).
2. **Component Structures:** WhatsApp templates require specific `to_and_components` payloads (`body_1`, `button_1`), unlike simple key-value maps used in SMS flows.
3. **Delivery Lifecycle:** SMS DLRs are optional for ZapNow; WhatsApp delivery and read receipts require stateful tracking for campaign analytics and service recovery.

---

## 4. Merchant WhatsApp Identity & Mapping

For multi-tenant operations, each merchant's WhatsApp identity is represented cleanly using existing schema structures:

1. **Centralized Platform WABA (Default Pilot Mode):**
   - ZapNow utilizes a shared primary WhatsApp Business Number (`MSG91_WHATSAPP_INTEGRATED_NUMBER`).
   - Templates dynamically inject the restaurant's name and branded ordering URL:
     * Body: *"Hi {{1}}, {{2}} misses you! Here is a 15% discount on your favorite dish..."*
     * Button URL: `https://zapnow.in/#/menu?restaurantId={{restaurantId}}&coupon={{code}}`
2. **Merchant-Dedicated WABA (Self-Branded Enterprise Mode):**
   - For merchants with their own integrated number on MSG91, the configuration maps to the existing [`ConnectedAccount`](file:///C:/Users/Gaurav/Desktop/zapnowQR/backend/prisma/schema.prisma) model:
     - `provider`: `'MSG91_WHATSAPP'`
     - `restaurantId`: `restaurant.id`
     - `accountName`: Merchant WhatsApp Business Name
     - `metadata`: JSON storing `{ integratedNumber: "919876543210", namespace: "..." }`
     - `isActive`: `true`

---

## 5. Webhook Architecture & Idempotency Control

MSG91 uses a push-based webhook system (`Webhook (New)`) to deliver delivery updates and inbound responses.

### 5.1 Endpoints Required:
* `POST /api/webhooks/msg91/whatsapp/delivery` (Event: `On Outbound Report Received`)
* `POST /api/webhooks/msg91/whatsapp/inbound` (Event: `On Inbound Message Received`)

### 5.2 MSG91 Webhook Constraints:
* **Timeout Threshold:** The ZapNow webhook endpoint must return HTTP `200 OK` within **8,000 milliseconds (8 seconds)**.
* **Retry Policy:** MSG91 retries unacknowledged webhooks up to **4 times**.
* **Idempotency Requirement:** Handlers must verify whether the `message_id` or `request_id` has already been processed to prevent duplicate status changes or duplicate review alerts.

### 5.3 Webhook Verification:
* Validated using a shared bearer token configured in MSG91 Webhook headers:
  `Authorization: Bearer process.env.MSG91_WEBHOOK_TOKEN`
* Verified using `crypto.timingSafeEqual` before parsing the JSON body.

---

## 6. Message Delivery Lifecycle & State Machine

The ZapNow system explicitly decouples provider acceptance from physical device delivery:

```
[QUEUED] 
   │
   ▼ (ZapNow calls MSG91 API)
[SUBMITTED] ◄── MSG91 returns HTTP 200 with request_id (Request Accepted)
   │
   ├──────────────────────────────┬──────────────────────────────┐
   ▼ (Webhook: 'sent')            ▼ (Webhook: 'failed')          ▼ (Webhook: 'failed_by_meta')
[SENT]                         [FAILED]                       [FAILED]
   │                           (Wallet Refunded)              (Wallet Refunded)
   ▼ (Webhook: 'delivered')
[DELIVERED] ◄── Physical handset delivery confirmed (Wallet Debit Finalized)
   │
   ▼ (Webhook: 'read')
[READ]
```

### State Definitions:
1. `SUBMITTED`: MSG91 API accepted the request. Balance is reserved, not finalized.
2. `DELIVERED`: MSG91 webhook confirms delivery to device. Wallet debit is confirmed.
3. `FAILED` / `FAILED_BY_META`: Delivery failed (e.g. invalid number, blocked). Reserved wallet balance is refunded immediately.
