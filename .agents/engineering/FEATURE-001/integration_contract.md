# ZapNowQR Integration Contract: FEATURE-001 (MSG91 WhatsApp)
**Role:** `engineering_lead_agent`  
**Feature Name:** ZapNow Retention & Growth Engine (MVP)  
**Provider Boundary:** MSG91 WhatsApp API v5  
**Date:** 2026-09-28  
**Scope:** HTTP API Contracts, Webhook Schemas, and Internal Provider Interfaces (Zero application code modified)

---

## 1. Internal Provider Interface: `IWhatsAppProvider`

To maintain loose coupling between business logic and MSG91, all backend dispatches interact via a standardized provider interface:

```typescript
export interface SendTemplateOptions {
  recipientPhone: string;          // Format: '91XXXXXXXXXX'
  templateName: string;            // e.g. 'zapnow_winback_offer_v1'
  languageCode?: string;          // Default: 'en'
  components: {
    bodyVariables?: Record<string, string>;   // { '1': 'Gaurav', '2': 'Royal Spice' }
    buttonVariables?: Record<string, string>; // { '1': 'DISCOUNT15' }
  };
  integratedNumber?: string;       // Optional merchant override
  trackingId: string;              // ZapNow CampaignRecipient ID
}

export interface ProviderSendResult {
  success: boolean;
  providerMessageId?: string;
  requestId?: string;
  status: 'SUBMITTED' | 'FAILED';
  errorCode?: string;
  errorMessage?: string;
}

export interface IWhatsAppProvider {
  sendTemplateMessage(options: SendTemplateOptions): Promise<ProviderSendResult>;
}
```

---

## 2. MSG91 Outbound REST Contract

### 2.1 Endpoint Specification
* **URL:** `POST https://api.control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/`
* **Headers:**
  - `authkey: process.env.MSG91_AUTH_KEY`
  - `Content-Type: application/json`

### 2.2 Request Payload Schema
```json
{
  "integrated_number": "91XXXXXXXXXX",
  "content_type": "template",
  "payload": {
    "messaging_product": "whatsapp",
    "type": "template",
    "template": {
      "name": "zapnow_winback_offer_v1",
      "language": {
        "code": "en",
        "policy": "deterministic"
      },
      "to_and_components": [
        {
          "to": [
            "919876543210"
          ],
          "components": {
            "body_1": {
              "type": "text",
              "value": "Gaurav"
            },
            "body_2": {
              "type": "text",
              "value": "The Biryani Project"
            },
            "body_3": {
              "type": "text",
              "value": "Chicken Biryani"
            },
            "button_1": {
              "subtype": "url",
              "type": "text",
              "value": "menu?restaurantId=cm1...&coupon=WINBACK15"
            }
          }
        }
      ]
    }
  }
}
```

### 2.3 Response Payloads
* **Success Response (HTTP 200):**
```json
{
  "type": "success",
  "request_id": "673c2f35d6fc054b942d20d2_req_101",
  "message": "Template message submitted successfully"
}
```
* **Failure Response (HTTP 400 / 401 / 422):**
```json
{
  "type": "error",
  "message": "Template does not exist or parameter count mismatch",
  "code": 422
}
```

---

## 3. MSG91 Webhook Inbound Contract

### 3.1 Delivery Report Callback
* **Endpoint:** `POST /api/webhooks/msg91/whatsapp/delivery`
* **Trigger:** MSG91 Event `On Outbound Report Received`
* **Security:** Header `Authorization: Bearer <MSG91_WEBHOOK_TOKEN>`
* **Payload Structure:**
```json
{
  "event": "outbound_report",
  "request_id": "673c2f35d6fc054b942d20d2_req_101",
  "message_id": "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSMzAy...==",
  "receiver": "919876543210",
  "status": "delivered",
  "reason": "",
  "timestamp": "2026-09-28 12:30:00"
}
```
* **Status Enum Mapping:**
  - `submitted` $\to$ ZapNow `SUBMITTED`
  - `sent` $\to$ ZapNow `SENT`
  - `delivered` $\to$ ZapNow `DELIVERED`
  - `read` $\to$ ZapNow `READ`
  - `failed` / `failed_by_meta` $\to$ ZapNow `FAILED`

### 3.2 Inbound Interactive Survey Response Callback
* **Endpoint:** `POST /api/webhooks/msg91/whatsapp/inbound`
* **Trigger:** Customer taps quick-reply button on survey message
* **Payload Structure:**
```json
{
  "event": "inbound_message",
  "from": "919876543210",
  "message_id": "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSMzAy...==",
  "type": "interactive",
  "interactive": {
    "type": "button_reply",
    "button_reply": {
      "id": "RATING_1_STAR",
      "title": "Needs Improvement"
    }
  },
  "timestamp": "2026-09-28 12:35:00"
}
```
* **Action Triggered:**
  - `button_reply.id === 'RATING_5_STAR'`: Generates dynamic link to Google Place ID.
  - `button_reply.id <= 'RATING_3_STAR'`: Writes private record to `Feedback` (`isVisible: false`) and emits Socket.IO alert `service-recovery-alert` to `restaurant:${restaurantId}`.

---

## 4. Idempotency & Webhook Resilience Contract

1. **8-Second Timeout Guard:**
   - The webhook handler must write the event to memory/database and return HTTP `200 OK` within $< 8000$ms to prevent MSG91 retries.
2. **Duplicate Detection:**
   - Handlers check `CampaignRecipient.providerMessageId === message_id`.
   - If the event was already processed with identical or newer status (e.g. `delivered` after `read`), the handler returns `200 OK` immediately without duplicate updates.
3. **Wallet Balance Safety:**
   - Wallet credits/refunds occur inside `prisma.$transaction`.
   - Deductions are locked on `DELIVERED` status; failed dispatches trigger atomic wallet refund.
