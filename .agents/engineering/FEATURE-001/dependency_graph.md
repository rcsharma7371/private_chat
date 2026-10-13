# ZapNowQR Engineering Dependency Graph: FEATURE-001 (Updated for MSG91)
**Role:** `engineering_lead_agent`  
**Feature Name:** ZapNow Retention & Growth Engine (MVP)  
**Feature ID:** `FEATURE-001`  
**Provider Boundary:** MSG91 WhatsApp API v5  
**Date:** 2026-09-28  
**Execution Mode:** Dependency & Concurrency Topology (Zero application code modified)

---

## 1. Visual Task Dependency Topology

```mermaid
graph TD
    classDef foundation fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef core fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef frontend fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef qa fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px;
    classDef gate fill:#ffebee,stroke:#d32f2f,stroke-width:2px;

    subgraph Phase1 [Phase 1: Foundations]
        T1[TASK-001: Additive DB Schema & Migration<br/><b>Owner: database_engineer</b>]:::foundation
        T2[TASK-002: MSG91 Config & Cryptography<br/><b>Owner: integration_engineer</b>]:::foundation
    end

    subgraph Phase2 [Phase 2: Core Services & Contracts]
        T3[TASK-003: RFM Cohort Engine & Retention APIs<br/><b>Owner: backend_engineer</b>]:::core
        T4[TASK-004: MSG91 WhatsApp Client & Webhooks<br/><b>Owner: integration_engineer</b>]:::core
        T7[TASK-007: Frontend Shell & ROI Tile<br/><b>Owner: frontend_engineer</b>]:::frontend
    end

    subgraph Phase3 [Phase 3: Workflows & Feature UI]
        T5[TASK-005: Messaging Wallet & Top-Up<br/><b>Owner: backend_engineer</b>]:::core
        T6[TASK-006: Review Trigger & Interception Hook<br/><b>Owner: backend_engineer</b>]:::core
        T8[TASK-008: Campaigns, Wallet & Reviews Tabs<br/><b>Owner: frontend_engineer</b>]:::frontend
    end

    subgraph Phase4 [Phase 4: Automated Testing & Verification]
        T9[TASK-009: Automated Test Suites (MSG91 Mocks)<br/><b>Owner: qa_engineer</b>]:::qa
        T10[TASK-010: Tenant Isolation & Concurrency Verification<br/><b>Owner: qa_engineer</b>]:::qa
    end

    subgraph Phase5 [Phase 5: Release Gates & Audits]
        T11[TASK-011: Independent Security Review<br/><b>Owner: security_reviewer</b>]:::gate
        T12[TASK-012: Code Review & Production Safety Gate<br/><b>Owner: code_reviewer</b>]:::gate
    end

    %% Dependency Connections
    T1 --> T3
    T1 --> T5
    T1 --> T6
    T2 --> T4
    T4 --> T5
    T4 --> T6
    
    %% Frontend Contract Path
    T3 -. Frozen API Contract .-> T7
    T7 --> T8
    T3 --> T8
    T5 --> T8

    %% QA & Testing
    T3 --> T9
    T4 --> T9
    T5 --> T9
    T6 --> T9
    T8 --> T9
    T9 --> T10

    %% Release Gates
    T10 --> T11
    T11 --> T12
```

---

## 2. Concurrency & Parallelism Matrix

| Task Pair | Can Run in Parallel? | Condition / Synchronization Requirement |
| :--- | :---: | :--- |
| **TASK-001 & TASK-002** | **YES** | Completely independent files (`schema.prisma` vs `crypto.ts` / `env.ts`). |
| **TASK-003 & TASK-004** | **YES** | Once TASK-001 (DB models) and TASK-002 (MSG91 config) are complete, backend RFM and MSG91 client develop independently. |
| **TASK-003 & TASK-007** | **YES** | Frontend UI shell works against frozen API contracts while backend retention endpoints are implemented. |
| **TASK-005 & TASK-006** | **NO** | Sequential within backend: complete Wallet & Webhook integration before implementing order review trigger hook. |
| **TASK-007 & TASK-008** | **NO** | Sequential within frontend: Layout shell must be stabilized before mounting complex interactive tabs. |
| **TASK-009 & TASK-010** | **NO** | Standard unit/integration suites must pass before executing high-concurrency multi-tenant penetration tests. |
| **TASK-011 & TASK-012** | **NO** | Independent security reviewer must sign off before the final code reviewer executes the production safety gate. |

---

## 3. Critical Path Analysis

$$\text{Critical Path: } \mathbf{TASK\text{-}001} \longrightarrow \mathbf{TASK\text{-}003} \longrightarrow \mathbf{TASK\text{-}005} \longrightarrow \mathbf{TASK\text{-}008} \longrightarrow \mathbf{TASK\text{-}009} \longrightarrow \mathbf{TASK\text{-}010} \longrightarrow \mathbf{TASK\text{-}011} \longrightarrow \mathbf{TASK\text{-}012}$$

* **Longest Dependency Chain:** Database schema $\to$ Retention Engine $\to$ Wallet Ledger $\to$ Interactive UI Tabs $\to$ Automated Testing $\to$ Security Audit $\to$ Final Sign-Off.
* **Secondary Parallel Track:** Provider Config (`TASK-002`) $\to$ MSG91 WhatsApp Client & Webhooks (`TASK-004`) $\to$ Review Hook (`TASK-006`). Feeds into QA alongside the main critical path.

---

## 4. Interface & Contract Milestones

1. **Milestone 1 (Foundations Frozen):**
   - Output: `prisma/schema.prisma` migrated; MSG91 configuration & `crypto.ts` unit tested.
   - Unlocks: All backend and integration tasks (`TASK-003`, `TASK-004`).
2. **Milestone 2 (API & MSG91 Webhook Contracts Frozen):**
   - Output: Frozen contracts for `/api/marketing/retention/*`, `/api/marketing/wallet/*`, and `/api/webhooks/msg91/whatsapp/*`.
   - Unlocks: Frontend interactive tabs (`TASK-008`).
3. **Milestone 3 (Integration & Scheduling Ready):**
   - Output: MSG91 WhatsApp client verified, review trigger active in `orderController.ts`.
   - Unlocks: End-to-end QA suites (`TASK-009`).
4. **Milestone 4 (Security Sign-Off):**
   - Output: Authkey confidentiality, anti-IDOR, tenant isolation, and cryptographic verification report.
   - Unlocks: Final code review and feature flag enablement (`TASK-012`).
