# ZapNowQR Task Breakdown: FEATURE-001 (Updated for MSG91 WhatsApp API)
**Role:** `engineering_lead_agent`  
**Feature Name:** ZapNow Retention & Growth Engine (MVP)  
**Feature ID:** `FEATURE-001`  
**Provider Decision:** MSG91 WhatsApp API v5  
**Date:** 2026-09-28  
**Execution Mode:** Detailed Engineering Work Packages (Zero application code modified)

---

## Task Evolution Matrix (Meta Graph API vs. MSG91 WhatsApp API)

| Task ID | Task Title | Owner | Evolution Status | Summary of Change |
| :--- | :--- | :--- | :---: | :--- |
| **TASK-001** | Additive Database Schema & Migration | `database_engineer` | **MODIFIED** | Added `providerMessageId` to `CampaignRecipient` for MSG91 webhook tracking. |
| **TASK-002** | Provider Config & Cryptography Foundation | `integration_engineer` | **MODIFIED** | Swapped Meta app secrets for `MSG91_WHATSAPP_INTEGRATED_NUMBER` and `MSG91_WEBHOOK_TOKEN`. |
| **TASK-003** | RFM Cohort Engine & Retention APIs | `backend_engineer` | **UNCHANGED** | Uses internal `IWhatsAppProvider` interface; business logic unaffected. |
| **TASK-004** | MSG91 WhatsApp Client & Webhook Receiver | `integration_engineer` | **MODIFIED** | Implemented MSG91 Outbound REST API and Webhooks (`delivery` & `inbound`). Meta Graph API code removed. |
| **TASK-005** | Prepaid Messaging Wallet & Razorpay Top-Up | `backend_engineer` | **UNCHANGED** | Wallet ledger and Razorpay UPI checkout remain identical. |
| **TASK-006** | Post-Dining Review Trigger & Interception Hook | `backend_engineer` | **MODIFIED** | Configured review prompt to dispatch via MSG91 WhatsApp template; inbound rating parsed via MSG91 callback. |
| **TASK-007** | Frontend Layout Restructure & Closed-Loop Tile | `frontend_engineer` | **UNCHANGED** | UI layout and ROI card logic are provider-agnostic. |
| **TASK-008** | Frontend Campaign, Wallet & Review Tabs | `frontend_engineer` | **UNCHANGED** | Tab interfaces connect to ZapNow backend APIs; unaffected by provider change. |
| **TASK-009** | Automated Unit & Integration Test Suites | `qa_engineer` | **MODIFIED** | Updated mocks from Meta Graph API to MSG91 Outbound REST payloads and MSG91 Webhook schemas. |
| **TASK-010** | Tenant Isolation & Concurrency Verification | `qa_engineer` | **UNCHANGED** | Cross-merchant data protection and wallet concurrency remain identical. |
| **TASK-011** | Independent Security & Provider Secrecy Audit | `security_reviewer` | **MODIFIED** | Audits `MSG91_AUTH_KEY` secrecy and MSG91 bearer webhook token verification. |
| **TASK-012** | Production Safety Gate & Final Code Review | `code_reviewer` | **UNCHANGED** | Final verification gate and non-regression checks remain identical. |

---

## Detailed Task Work Packages

### TASK-001: Additive Database Schema & Migration (MODIFIED)
* **Feature ID:** `FEATURE-001`
* **Status:** **MODIFIED**
* **Objective:** Define additive Prisma models for campaigns and recipients with explicit MSG91 `providerMessageId` tracking and composite index for RFM queries.
* **Owner:** `database_engineer`
* **Files Owned:** `backend/prisma/schema.prisma`
* **Files Protected (Do NOT Touch):** Core dining models (`Customer`, `Order`, `Payment`, `OrderItem` field definitions must not be altered, dropped, or renamed).
* **Dependencies:** None.
* **Inputs:** Approved Prisma schema extension from `FINAL_TECHNICAL_HANDOFF.md`.
* **Outputs:** Validated Prisma migration; updated Prisma client (`npx prisma generate`).
* **Existing Contracts:** PostgreSQL schema standards, `@@map` conventions.
* **Key Fields Added:**
  - `MarketingCampaign`: `id`, `restaurantId`, `name`, `type`, `status`, `templateName`, `totalTargeted`, `totalSent`, `totalDelivered`, `totalOrders`, `attributedGmv`, `totalSpend`.
  - `CampaignRecipient`: `id`, `campaignId`, `customerId`, `phone`, `idempotencyKey` (@unique), `providerMessageId` (MSG91 message_id, indexed), `status` (`QUEUED`, `SUBMITTED`, `SENT`, `DELIVERED`, `FAILED`), `errorMessage`, `sentAt`, `deliveredAt`.
  - `Customer`: Composite index `@@index([restaurantId, lastOrderDate])`.
* **Acceptance Criteria:**
  - Zero breaking changes to existing tables.
  - Migration applies cleanly on clean database and existing database state without data loss.
* **Testing Requirements:** Migration rollback and forward test execution.
* **Security Requirements:** Zero customer data modification or deletion during migration.

---

### TASK-002: Provider Config & Cryptography Foundation (MODIFIED)
* **Feature ID:** `FEATURE-001`
* **Status:** **MODIFIED**
* **Objective:** Implement AES-256-GCM encryption/decryption utilities and add required MSG91 WhatsApp environment variable validations.
* **Owner:** `integration_engineer`
* **Files Owned:** `backend/src/utils/crypto.ts`, `backend/src/utils/env.ts`
* **Files Protected:** Core security middleware (`backend/src/middleware/auth.ts`).
* **Dependencies:** None.
* **Inputs:** MSG91 credentials and token encryption key specification.
* **Outputs:** Symmetric `encryptToken(text)` / `decryptToken(ciphertext)`; updated `env.ts`.
* **Key Variables Validated in `env.ts`:**
  - `MSG91_AUTH_KEY` (Already present in `env.ts`).
  - `MSG91_WHATSAPP_INTEGRATED_NUMBER` (WABA number without `+`, e.g. `919876543210`).
  - `MSG91_WEBHOOK_TOKEN` (Shared bearer token for webhook verification).
  - `TOKEN_ENCRYPTION_KEY` (32-byte hex string for AES-256-GCM).
* **Acceptance Criteria:**
  - Cryptographic operations use `crypto.createCipheriv('aes-256-gcm', key, iv)`.
  - Variables are validated as optional in dev/test, mandatory when `FEATURE_RETENTION_ENGINE=true`.
* **Testing Requirements:** Unit test round-trip encryption/decryption with valid and tampered auth tags.
* **Security Requirements:** Zero authkey hardcoding; reject invalid or modified authentication tags.

---

### TASK-003: RFM Cohort Engine & Retention APIs (UNCHANGED)
* **Feature ID:** `FEATURE-001`
* **Status:** **UNCHANGED**
* **Objective:** Build backend controller and service for querying diner cohorts and triggering campaigns scoped strictly to `restaurantId`.
* **Owner:** `backend_engineer`
* **Files Owned:** `backend/src/modules/marketing/controllers/retentionController.ts`, `backend/src/modules/marketing/routes/marketingRoutes.ts`
* **Files Protected:** `backend/src/controllers/customerController.ts` (reuse logic, do not modify).
* **Dependencies:** TASK-001.
* **Inputs:** `req.marketingContext` from `requireMarketingAuth`.
* **Outputs:** Endpoints `GET /api/marketing/retention/cohorts`, `POST /api/marketing/retention/campaigns/trigger`, `GET /api/marketing/retention/analytics`.
* **Acceptance Criteria:**
  - Evaluates diners ($\ge 2$ visits, last order $\ge 30$ days ago).
  - All queries strictly mandate `where: { restaurantId }`.
  - Dispatches enforce pre-flight wallet check.
* **Testing Requirements:** Unit test cohort classification and multi-tenant isolation.
* **Security Requirements:** Strict Anti-IDOR enforcement; client-provided `restaurantId` ignored.

---

### TASK-004: MSG91 WhatsApp Client & Webhook Receiver (MODIFIED)
* **Feature ID:** `FEATURE-001`
* **Status:** **MODIFIED**
* **Objective:** Build HTTP client for MSG91 WhatsApp API v5 and webhook controller for delivery receipts and inbound interactive customer replies.
* **Owner:** `integration_engineer`
* **Files Owned:** `backend/src/services/msg91WhatsAppService.ts`, `backend/src/modules/marketing/controllers/msg91WebhookController.ts`, `backend/src/routes/webhookRoutes.ts`
* **Files Protected:** `backend/src/services/msg91Service.ts` (preserve SMS/OTP methods untouched), existing handlers in `webhookRoutes.ts`.
* **Dependencies:** TASK-002.
* **Inputs:** MSG91 WhatsApp API v5 documentation; pre-approved template definitions.
* **Outputs:**
  - `msg91WhatsAppService.ts` implementing `IWhatsAppProvider.sendTemplateMessage()`.
  - Endpoints: `POST /api/webhooks/msg91/whatsapp/delivery` and `POST /api/webhooks/msg91/whatsapp/inbound`.
* **Acceptance Criteria:**
  - Outbound calls `https://api.control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/` with header `authkey`.
  - Webhooks validate `Authorization: Bearer <MSG91_WEBHOOK_TOKEN>` using `crypto.timingSafeEqual`.
  - Responds within 8 seconds with HTTP `200 OK`.
  - Delivery status updates `CampaignRecipient` (`SUBMITTED`, `SENT`, `DELIVERED`, `FAILED`).
* **Testing Requirements:** Mock tests for template parameter injection and signature verification failure paths.
* **Security Requirements:** Prevent timing attacks on webhook token validation; reject unauthorized calls with 401.

---

### TASK-005: Prepaid Messaging Wallet & Razorpay Top-Up (UNCHANGED)
* **Feature ID:** `FEATURE-001`
* **Status:** **UNCHANGED**
* **Objective:** Implement prepaid wallet balance queries, Razorpay payment order generation, and atomic webhook ledger credits.
* **Owner:** `backend_engineer`
* **Files Owned:** `backend/src/modules/marketing/controllers/walletController.ts`, `backend/src/controllers/razorpayWebhook.ts` (additive case only)
* **Files Protected:** Existing dining order payments in `razorpayWebhook.ts`.
* **Dependencies:** TASK-001, TASK-004.
* **Inputs:** Razorpay payment SDK and existing `UsageRecord` / `Entitlement` models.
* **Outputs:** `GET /api/marketing/wallet/balance`, `POST /api/marketing/wallet/topup/create-order`, real-time Socket.IO emit `wallet-balance-updated`.
* **Acceptance Criteria:**
  - Creates Razorpay order intent with metadata `{ restaurantId, type: 'MARKETING_WALLET' }`.
  - Webhook verifies signature and executes atomic credit in `prisma.$transaction`.
  - Idempotent: checks `UsageRecord.referenceId` before crediting.
* **Testing Requirements:** Concurrency test on wallet credit and balance deduction locks.
* **Security Requirements:** Prevent negative wallet balances; prevent duplicate credit exploitation.

---

### TASK-006: Post-Dining Review Trigger & Interception Hook (MODIFIED)
* **Feature ID:** `FEATURE-001`
* **Status:** **MODIFIED**
* **Objective:** Hook into order completion to schedule 20-minute delayed WhatsApp review survey via MSG91, route 4–5 star ratings to Google Maps, and intercept 1–3 star ratings into `Feedback`.
* **Owner:** `backend_engineer`
* **Files Owned:** `backend/src/controllers/orderController.ts` (hook insertion only), `backend/src/jobs/reviewSurveyScheduler.ts`
* **Files Protected:** Core order state transitions and billing logic in `orderController.ts`.
* **Dependencies:** TASK-001, TASK-004.
* **Inputs:** `Order` status transitions (`COMPLETED` / `PAID`).
* **Outputs:** Delayed survey dispatch via MSG91 template; 1–3 star ratings captured in `Feedback` (`isVisible: false`) and emitted via `service-recovery-alert` to `restaurant:${restaurantId}`.
* **Acceptance Criteria:**
  - Non-blocking: failures in survey scheduling must never abort or fail order completion.
  - Positive 4–5 stars redirect to Google Place review URL.
  - Real-time alert delivered strictly to private merchant room.
* **Testing Requirements:** Verify 20-minute offset logic, feedback table insertion, and room-scoped Socket.IO emit.
* **Security Requirements:** Negative reviews must not be visible publicly until reviewed by management.

---

### TASK-007: Frontend Layout Restructure & Closed-Loop Tile (UNCHANGED)
* **Feature ID:** `FEATURE-001`
* **Status:** **UNCHANGED**
* **Objective:** Restructure marketing tab layout and embed Closed-Loop ROI attribution metric card in Overview tab.
* **Owner:** `frontend_engineer`
* **Files Owned:** `pages/Admin/pages/Marketing/MarketingPage.tsx`, `pages/Admin/pages/Marketing/tabs/MarketingOverviewTab.tsx`
* **Files Protected:** Admin navigation shell (`pages/AdminDashboard.tsx`, `src/App.tsx`).
* **Dependencies:** Frozen API Contract.
* **Inputs:** `GET /api/marketing/retention/analytics` response schema.
* **Outputs:** Clean navigation with MVP tabs (`Overview`, `Campaigns`, `Reviews`, `Wallet`); ROI attribution summary card.
* **Acceptance Criteria:**
  - Deprecate complex unneeded tabs (`brand`, `media`, `create`) from default view.
  - Displays *Spend vs Direct GMV Generated* with net ROI multiplier.
  - Responsive, mobile-first design.
* **Testing Requirements:** Component render tests with loaded, empty, and error API states.
* **Security Requirements:** No sensitive tokens or secrets rendered or stored in localStorage.

---

### TASK-008: Frontend Campaign, Wallet & Review Tabs (UNCHANGED)
* **Feature ID:** `FEATURE-001`
* **Status:** **UNCHANGED**
* **Objective:** Build interactive admin tabs for managing win-back campaigns, recharging messaging wallet via Razorpay, and viewing intercepted reviews.
* **Owner:** `frontend_engineer`
* **Files Owned:** `pages/Admin/pages/Marketing/tabs/CampaignsTab.tsx`, `pages/Admin/pages/Marketing/tabs/WalletTab.tsx`, `pages/Admin/pages/Marketing/tabs/ReviewsTab.tsx`
* **Files Protected:** Customer ordering UI (`pages/MenuPage.tsx`).
* **Dependencies:** TASK-003, TASK-005, TASK-007.
* **Inputs:** Completed backend APIs and Razorpay checkout script.
* **Outputs:** 3 dedicated tab components integrated into `MarketingPage.tsx`.
* **Acceptance Criteria:**
  - `CampaignsTab.tsx`: Displays active/paused toggle, audience counter, and preview modal.
  - `WalletTab.tsx`: Displays live balance badge, recharge pack selector (₹500 / ₹1,000 / ₹2,000), Razorpay modal trigger, and ledger table.
  - `ReviewsTab.tsx`: Feed of intercepted 1–3 star ratings with customer phone/name and Google Place ID input.
* **Testing Requirements:** User interaction testing for campaign toggle, top-up modal trigger, and review feed.
* **Security Requirements:** Mask diner phone numbers in review feed (`+91 98765*****`).

---

### TASK-009: Automated Unit & Integration Test Suites (MODIFIED)
* **Feature ID:** `FEATURE-001`
* **Status:** **MODIFIED**
* **Objective:** Implement comprehensive automated test suites covering RFM segmentation, wallet transactions, MSG91 webhook bearer auth, and review interception.
* **Owner:** `qa_engineer`
* **Files Owned:** `backend/src/__tests__/retentionCohort.test.ts`, `backend/src/__tests__/walletTransactions.test.ts`, `backend/src/__tests__/msg91Webhooks.test.ts`, `backend/src/__tests__/reviewInterception.test.ts`, `backend/src/__tests__/cryptoTokens.test.ts`
* **Files Protected:** Existing test suites in `backend/src/__tests__/`.
* **Dependencies:** TASK-003, TASK-004, TASK-005, TASK-006.
* **Inputs:** `test_requirements.md` and `integration_contract.md`.
* **Outputs:** 5 automated, reproducible Jest/Supertest test suites.
* **Acceptance Criteria:** 100% of tests pass cleanly in local and CI environments with MSG91 mocks.
* **Testing Requirements:** Execute test commands directly and record passing test counts.
* **Security Requirements:** Use mock databases or isolated test tenant data; never touch production database.

---

### TASK-010: Tenant Isolation & Concurrency Verification (UNCHANGED)
* **Feature ID:** `FEATURE-001`
* **Status:** **UNCHANGED**
* **Objective:** Explicitly verify that cross-merchant data leakage, IDOR vulnerabilities, and race conditions are impossible under high concurrency.
* **Owner:** `qa_engineer`
* **Files Owned:** `backend/src/__tests__/retentionTenantIsolation.test.ts`
* **Files Protected:** Application source code.
* **Dependencies:** TASK-009.
* **Inputs:** Multi-tenant test cases (Restaurant A vs Restaurant B).
* **Outputs:** Automated multi-tenant penetration and isolation verification report.
* **Acceptance Criteria:**
  - Cross-tenant cohort queries return zero records from foreign restaurants.
  - Simultaneous wallet balance debits never result in negative balances.
  - Socket.IO events delivered exclusively to authorized merchant rooms.
* **Testing Requirements:** Run multi-tenant assertion matrix.
* **Security Requirements:** Zero cross-tenant data leakage permitted.

---

### TASK-011: Independent Security & Provider Secrecy Audit (MODIFIED)
* **Feature ID:** `FEATURE-001`
* **Status:** **MODIFIED**
* **Objective:** Perform independent security audit of MSG91 authkey confidentiality, webhook bearer token verification, tenant isolation, and phone number data masking.
* **Owner:** `security_reviewer`
* **Files Owned:** `.agents/engineering/FEATURE-001/security_audit_report.md`
* **Files Protected:** Application source code.
* **Dependencies:** TASK-010.
* **Inputs:** All changed files and test reports.
* **Outputs:** Formal Security Audit Report with PASS/FAIL classification.
* **Acceptance Criteria:** Zero CRITICAL or HIGH severity security vulnerabilities.
* **Testing Requirements:** Static security scan and endpoint parameter tampering verification.
* **Security Requirements:** Strict adherence to Section 7 & 18 of `AGENTS.md`.

---

### TASK-012: Production Safety Gate & Final Code Review (UNCHANGED)
* **Feature ID:** `FEATURE-001`
* **Status:** **UNCHANGED**
* **Objective:** Conduct final pull request review, verify zero regression on core dining/POS code, verify clean TypeScript compilation, and approve release.
* **Owner:** `code_reviewer`
* **Files Owned:** `.agents/engineering/FEATURE-001/code_review_report.md`
* **Files Protected:** Application source code.
* **Dependencies:** TASK-011.
* **Inputs:** Complete Git diff, test execution results, and security audit report.
* **Outputs:** Final Engineering Verification Report and release sign-off.
* **Acceptance Criteria:**
  - TypeScript compilation passes with zero errors.
  - All tests pass.
  - No unrelated files modified.
  - No secrets committed.
  - Feature flag `FEATURE_RETENTION_ENGINE` verified.
* **Testing Requirements:** Run full build (`npm run build` in frontend and backend).
* **Security Requirements:** Comply with Rule 47 of `AGENTS.md` ("Test Before Claiming Success").
