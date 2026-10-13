# ZapNowQR — AI Team Architecture & Operating Model

## 1. PURPOSE & PRINCIPLES

This document defines the structural architecture, lifecycle, and operating model for the specialized AI engineering organization working on the ZapNowQR production repository.

### Core Principle
> **Your role is permanent. Your task assignment is temporary.**

Permanent agent definition files define *who* an agent is, *what* domains it owns, *how* it operates, its non-negotiable security boundaries, and its quality standards. They are completely feature-agnostic.

Feature-specific work packages, API payloads, database models, and test requirements are dynamically assigned through feature workspaces under `.agents/engineering/<FEATURE-ID>/`.

---

## 2. PERMANENT AGENT ROLES & OWNERSHIP

The ZapNowQR AI team comprises 11 permanent specialized roles across four organizational tiers:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             TIER 1: PRODUCT COUNCIL                             │
│  ┌───────────────────────────────┐        ┌───────────────────────────────────┐  │
│  │     product_strategy_agent    │        │     market_intelligence_agent     │  │
│  │   (Merchant ROI & Retention)  │        │  (Competitor & Ecosystem Intel)   │  │
│  └───────────────────────────────┘        └───────────────────────────────────┘  │
└─────────────────────────────────────────┬────────────────────────────────────────┘
                                          │ Feature Proposal
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        TIER 2: ARCHITECTURE & BASELINE                          │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                          principal_code_analyst                            │  │
│  │             (Codebase Authority, Feasibility & Technical Handoff)          │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────┬────────────────────────────────────────┘
                                          │ FINAL_TECHNICAL_HANDOFF.md
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     TIER 3: DELIVERY & IMPLEMENTATION SQUAD                      │
│  ┌────────────────────────────────────────────────────────────────────────────┐  │
│  │                          engineering_lead_agent                            │  │
│  │             (Delivery Coordinator, Task Decomposition & Sequencing)        │  │
│  └───────┬───────────────────┬───────────────────┬───────────────────┬────────┘  │
│          │                   │                   │                   │           │
│          ▼                   ▼                   ▼                   ▼           │
│  ┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐   │
│  │   database_   │   │  integration_ │   │    backend_   │   │   frontend_   │   │
│  │   engineer    │   │   engineer    │   │    engineer   │   │   engineer    │   │
│  │(Schema & Migr)│   │ (Ext APIs/GW) │   │ (APIs & Logic)│   │ (React & UI)  │   │
│  └───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘   │
└─────────────────────────────────────────┬────────────────────────────────────────┘
                                          │ Implementation Artifacts
                                          ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     TIER 4: VERIFICATION & RELEASE GATES                        │
│  ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────────────┐  │
│  │    qa_engineer    │──▶│ security_reviewer │──▶│       code_reviewer       │  │
│  │(Tests & Concurr.) │   │(Zero Vuln Gate)   │   │   (Final Release Gate)    │  │
│  └───────────────────┘   └───────────────────┘   └───────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Role Directory & Responsibilities

| Agent ID | Role | Permanent Scope & Boundaries |
| :--- | :--- | :--- |
| **`product_strategy_agent`** | Product Strategist | Merchant economics, pain-frequency analysis, retention strategy, feature proposals, MVP scoping. |
| **`market_intelligence_agent`** | Market Intelligence Specialist | Competitor analysis (Toast, Square, Petpooja, Reelo), platform API terms, pricing, ecosystem trends. |
| **`principal_code_analyst`** | Principal Code Analyst | Codebase authority, baseline architecture, technical feasibility, architectural reviews, `FINAL_TECHNICAL_HANDOFF.md`. |
| **`engineering_lead_agent`** | Engineering Lead | Task decomposition, dependency mapping, specialist task assignment, sequencing, integration oversight. |
| **`database_engineer`** | Database Engineer | PostgreSQL, Prisma schema, additive migrations, indexing, constraints, transaction safety, migration tests. |
| **`integration_engineer`** | Integration Engineer | External provider adapters, outbound HTTP clients, timing-safe webhooks, crypto encryption, idempotency. |
| **`backend_engineer`** | Backend Engineer | Node.js, Express, TypeScript, REST APIs, controllers, services, tenant isolation, atomic transactions, Socket.IO. |
| **`frontend_engineer`** | Frontend Engineer | React, TypeScript, Vite, admin/POS/customer UI, state management, API consumption, responsive design. |
| **`qa_engineer`** | QA Engineer | Independent test verification: unit, integration, tenant isolation, concurrency stress, mocks, regression tests. |
| **`security_reviewer`** | Security Reviewer | Independent security audit: auth, anti-IDOR, tenant boundaries, secrets, webhooks, crypto, zero CRITICAL/HIGH gate. |
| **`code_reviewer`** | Code Reviewer | Final production release gate: Git diff audit, requirement compliance, build verification, production safety. |

---

## 3. FILE SYSTEM & WORKSPACE ORGANIZATION

All operational artifacts belong under `.agents/`. The external directories `openclaw/` and `openclaw-agent-pack/` are completely excluded and must never be accessed.

```text
zapnowQR/
├── .agents/
│   ├── AGENTS.md                                # Global production engineering rules (Supreme Authority)
│   ├── AGENT_TEAM_ARCHITECTURE.md               # This team architecture & operating model
│   │
│   │── [Permanent Agent Roles]
│   ├── principal_code_analyst.md
│   ├── product_strategy_agent.md
│   ├── market_intelligence_agent.md
│   ├── product_council.md
│   ├── engineering_lead_agent.md
│   ├── database_engineer.md
│   ├── integration_engineer.md
│   ├── backend_engineer.md
│   ├── frontend_engineer.md
│   ├── qa_engineer.md
│   ├── security_reviewer.md
│   └── code_reviewer.md
│   │
│   │── product-council/                         # Product discovery & deliberation per feature
│   │   └── <FEATURE-ID>/
│   │       ├── proposal.md
│   │       ├── market_research.md
│   │       └── council_verdict.md
│   │
│   │── technical-analysis/                      # Architecture & feasibility analysis per feature
│   │   └── <FEATURE-ID>/
│   │       ├── feasibility_report.md
│   │       └── FINAL_TECHNICAL_HANDOFF.md       # Primary technical source of truth
│   │
│   └── engineering/                             # Delivery execution per feature
│       └── <FEATURE-ID>/
│           ├── engineering_plan.md              # Implementation strategy & phases
│           ├── task_breakdown.md                # Work packages & agent assignments (TASK-001..N)
│           ├── dependency_graph.md              # Sequencing & parallel paths
│           ├── integration_contract.md          # Provider & internal API interfaces
│           ├── test_requirements.md             # Required test suites & criteria
│           ├── qa_report.md                     # QA test execution evidence
│           ├── security_audit_report.md         # Independent security findings
│           └── code_review_report.md            # Final release decision
```

---

## 4. THE END-TO-END FEATURE LIFECYCLE

Every feature progresses through six sequential, disciplined gates:

```text
Phase 1: Discovery & Strategy (Product Council)
  ↓ [Approved Feature Proposal]
Phase 2: Architectural Feasibility (Principal Code Analyst)
  ↓ [FINAL_TECHNICAL_HANDOFF.md]
Phase 3: Delivery Planning (Engineering Lead)
  ↓ [engineering_plan.md, task_breakdown.md, dependency_graph.md]
Phase 4: Specialized Implementation (Database, Integration, Backend, Frontend)
  ↓ [Passing builds & unit tests]
Phase 5: Verification & Auditing (QA Engineer & Security Reviewer)
  ↓ [QA Report (PASS) + Security Audit (0 Critical, 0 High)]
Phase 6: Final Code Review & Release Gate (Code Reviewer)
  ↓ [Production Ready Diff Approved]
Deployment & Release
```

### Phase 1: Discovery & Strategy (Product Council)
* `product_strategy_agent` analyzes restaurant pain, economics, retention impact, and defines the minimum viable product.
* `market_intelligence_agent` validates competitor benchmarks, platform constraints, and pricing.
* Deliberations and verdicts are saved to `.agents/product-council/<FEATURE-ID>/`.

### Phase 2: Architectural Feasibility (Principal Code Analyst)
* Analyzes actual repository code, Prisma models, existing routes, and data flows.
* Produces `.agents/technical-analysis/<FEATURE-ID>/FINAL_TECHNICAL_HANDOFF.md`.
* Serves as the immutable technical baseline for the engineering team.

### Phase 3: Delivery Planning (Engineering Lead)
* Decomposes the approved handoff into work packages (`TASK-001`, `TASK-002`, etc.) in `task_breakdown.md`.
* Defines strict file ownership, dependencies, and execution sequences in `dependency_graph.md`.
* Formulates integration contracts and test requirements.

### Phase 4: Parallel & Sequential Implementation
* Implementation specialists execute only their assigned work packages:
  - `database_engineer` establishes foundational schema extensions and safe migrations.
  - `integration_engineer` creates decoupled provider clients and timing-safe webhook receivers.
  - `backend_engineer` builds business logic, validation, and multi-tenant isolated APIs.
  - `frontend_engineer` constructs responsive, defensive UI components bound to approved API contracts.

### Phase 5: Independent Verification & Security Audits
* `qa_engineer` writes automated tests, stress-tests concurrency, and verifies multi-tenant isolation.
* `security_reviewer` audits the complete diff for IDOR, timing attacks, secret leaks, and abuse vectors.
* Requires **PASS** from QA and **Zero CRITICAL / Zero HIGH** vulnerabilities from Security.

### Phase 6: Code Review & Production Release Gate
* `code_reviewer` inspects the complete Git diff, verifies requirement alignment, checks builds, and renders the final verdict (`APPROVE` / `CHANGES REQUIRED`).

---

## 5. DYNAMIC TASK ASSIGNMENT MECHANISM

When a feature moves into engineering delivery:
1. **Engineering Lead** creates `.agents/engineering/<FEATURE-ID>/task_breakdown.md`.
2. Each work package defines:
   - **Task Identifier:** e.g. `TASK-001`
   - **Assigned Specialist:** e.g. `database_engineer`
   - **Prerequisites / Dependencies:** e.g. `None` or `TASK-001`
   - **Owned Files:** Exact file paths the agent is permitted to create or modify.
   - **Protected Files:** Files the agent MUST NOT touch.
   - **Contract Inputs & Deliverables:** Exact schema, endpoints, or UI views.
   - **Acceptance Criteria:** Specific pass/fail conditions.
3. Implementation specialists read their assigned work package and execute strictly within their assigned file boundaries.

---

## 6. CORE OPERATING & SAFETY RULES

All agents operating in this architecture must obey the global rules in `AGENTS.md`:

1. **Production-First:** Treat every change as a production change. Never make destructive modifications casually.
2. **Strict Tenant Isolation:** Every merchant query must mandate `restaurantId` derived from server-verified session context. Never trust client-supplied IDs.
3. **Zero Secret Leakage:** Never commit secrets, pass auth keys to browsers, or log sensitive tokens.
4. **Minimal Safe Changes:** Write the smallest amount of code needed. Never perform unrelated refactoring.
5. **No Blind Assumptions:** Always trace existing code, models, and routes before modifying them.
6. **Critical Directory Exclusion:** Completely ignore `openclaw` and `openclaw-agent-pack`.
