# ZapNowQR — Global AI Engineering Rules

## 0. PURPOSE

This repository is a production application.

All AI agents working in this repository MUST prioritize:

1. Security
2. Data integrity
3. Tenant isolation
4. Backward compatibility
5. Reliability
6. Testability
7. Maintainability
8. Minimal safe changes

An agent must never optimize for speed of implementation at the expense of production safety.

The existing application is considered valuable and potentially business-critical.

Treat every change as a production change.

---

# 1. AGENT OPERATING MODEL

This repository uses multiple specialized AI agents.

Every agent MUST:

* stay within its assigned role
* follow this `AGENTS.md`
* follow its own agent-specific instructions
* understand existing code before changing it
* avoid unrelated changes
* preserve existing behavior unless the task explicitly requires a behavior change
* communicate important assumptions
* identify risks
* leave the codebase in a testable state

Agent-specific instructions are subordinate to these global safety rules.

If instructions conflict:

1. Security rules in this file take priority.
2. Data-integrity rules take priority.
3. Explicit user requirements take priority.
4. Agent-specific role instructions are applied afterward.

---

# 2. CRITICAL DIRECTORY EXCLUSION

The following directories are completely OUTSIDE the ZapNowQR application scope:

* `openclaw`
* `openclaw-agent-pack`

All agents MUST completely ignore them.

Do NOT:

* scan them
* read files inside them
* search them
* execute commands inside them
* modify them
* install dependencies for them
* analyze them
* include them in architecture analysis
* reference their implementation as part of ZapNowQR

These directories must be treated as external systems.

---

# 3. PRODUCTION-FIRST RULE

Assume the code may be running in production unless explicitly stated otherwise.

Before making a change, determine:

* Is this development/testing code?
* Is this shared code?
* Is this production code?
* Does the change affect existing merchants?
* Does it affect existing orders?
* Does it affect payments?
* Does it affect stored customer data?
* Does it affect live realtime connections?
* Does it affect existing APIs?

Never make a destructive change simply because it works locally.

---

# 4. NO BLIND CHANGES

Never modify code based solely on assumptions.

Before changing a feature:

1. Find the existing implementation.
2. Trace its dependencies.
3. Understand its data flow.
4. Check database impact.
5. Check API consumers.
6. Check realtime dependencies.
7. Check authentication/authorization.
8. Check regression risk.
9. Then implement the smallest appropriate change.

Do not immediately rewrite or redesign existing functionality.

---

# 5. MINIMAL CHANGE PRINCIPLE

Make the smallest change required to satisfy the task.

Do NOT:

* refactor unrelated files
* rename unrelated variables
* rewrite working modules
* upgrade libraries without a task reason
* change architecture unnecessarily
* change API contracts unnecessarily
* change database structures unnecessarily
* alter UI behavior unrelated to the request

Every unrelated change increases regression risk.

---

# 6. SCOPE CONTROL

An agent must stay within the requested task.

Before modifying a file, determine:

* Is this file actually required?
* Is the modification directly related to the task?
* Does changing this file affect other modules?

If a file requires unrelated cleanup, do not silently include that cleanup in the same task.

Create a separate task when appropriate.

---

# 7. SECURITY IS NON-NEGOTIABLE

Security must never be disabled to make a feature work.

Agents MUST NOT:

* disable authentication
* disable authorization
* bypass tenant checks
* disable input validation
* disable security middleware
* expose secrets
* weaken password handling
* bypass payment verification
* trust client-side permissions
* expose internal database structures unnecessarily
* make private APIs public without explicit approval
* disable CORS protections without understanding the impact
* expose internal errors to customers

Never introduce a security regression intentionally.

---

# 8. SECRETS AND CREDENTIALS

Secrets MUST NEVER be committed to Git.

Examples:

* API keys
* access tokens
* JWT secrets
* database passwords
* service-account credentials
* private keys
* webhook secrets
* payment credentials
* OAuth client secrets
* cloud credentials
* SMTP credentials
* OTP provider credentials

Agents MUST NOT:

* hardcode secrets
* print secrets in logs
* place secrets in source code
* place secrets in frontend bundles
* paste secrets into documentation
* expose secrets in API responses
* commit `.env` files containing real credentials
* commit service-account JSON files containing credentials

When inspecting configuration, prefer:

* variable names
* configuration structure
* presence/absence

Do not unnecessarily print actual secret values.

If a secret is accidentally discovered, do not propagate it into reports or commits.

---

# 9. ENVIRONMENT VARIABLES

Environment variables may contain sensitive information.

Agents should distinguish:

```text
development
testing
staging
production
```

Never assume an environment variable has the same meaning across environments.

Do not change production environment configuration without explicit authorization.

Do not silently replace production credentials with development credentials.

Do not expose server-side environment variables to frontend code unless explicitly intended.

Only variables intentionally exposed through the frontend build system may be client-visible.

---

# 10. AUTHENTICATION

Authentication MUST be enforced server-side.

Never trust:

* frontend route protection
* hidden buttons
* disabled UI
* localStorage flags
* client-side role variables
* client-provided user IDs

Every protected backend operation must verify authentication independently.

Agents must inspect:

* token/session validation
* token expiration
* refresh behavior
* session invalidation
* authentication middleware
* protected routes

Authentication behavior must remain backward compatible unless explicitly changed.

---

# 11. AUTHORIZATION

Authentication answers:

> Who are you?

Authorization answers:

> Are you allowed to perform this action?

Never confuse them.

Every sensitive backend operation must validate authorization.

Examples:

* restaurant owner
* restaurant staff
* superadmin
* rider
* customer
* support/admin roles

Never rely solely on frontend role checks.

A user must not be able to access another user's or merchant's resources by changing:

* ID
* UUID
* domain
* query parameter
* request body
* URL
* header

---

# 12. MULTI-TENANT / MERCHANT ISOLATION

Merchant isolation is a CRITICAL security boundary.

Every merchant-scoped query MUST use the correct tenant/restaurant context.

Agents must verify tenant isolation for:

* orders
* customers
* menu
* tables
* riders
* payments
* reports
* settlements
* files
* settings
* analytics
* Socket.IO rooms
* custom domains

Never trust a merchant/restaurant ID supplied blindly by the client.

Prefer deriving tenant context from trusted server-side context whenever possible.

Before any database query involving merchant data, ask:

> "Could this query accidentally return another merchant's data?"

If yes or uncertain, stop and investigate.

---

# 13. IDOR / BROKEN ACCESS CONTROL PREVENTION

Changing an identifier in a request must never allow unauthorized access.

Examples:

```text
/orders/:orderId
/customers/:customerId
/menu/:itemId
/restaurants/:restaurantId
/riders/:riderId
```

The server MUST verify that the resource belongs to the authenticated user's authorized tenant/context.

Never assume that possession of an ID implies permission.

---

# 14. INPUT VALIDATION

Never trust client input.

Validate at the backend.

Validate:

* request body
* query parameters
* path parameters
* headers where relevant
* uploaded files
* URLs
* IDs
* numeric values
* enums
* dates
* quantities
* prices
* discounts
* tax values
* status values

Reject malformed or unexpected input.

Do not rely exclusively on TypeScript types for runtime validation.

---

# 15. MASS ASSIGNMENT PROTECTION

Do not blindly spread client objects into database writes.

Avoid patterns that allow users to modify fields they should not control.

For sensitive updates:

```text
Request
↓
Allowed fields
↓
Validation
↓
Authorization
↓
Database update
```

Explicitly control writable fields.

---

# 16. DATABASE SAFETY

Database integrity is critical.

Agents MUST NOT perform destructive database operations casually.

Never execute:

* `DROP DATABASE`
* destructive table deletion
* mass deletion
* destructive migration
* production reset
* `prisma migrate reset`
* commands that knowingly erase production data

unless explicitly authorized and the required safety procedure is established.

Never add a migration simply because a schema change "looks cleaner."

Inspect:

* existing models
* relations
* constraints
* indexes
* enums
* migrations
* existing data dependencies

Before schema changes, identify:

* migration risk
* existing data impact
* API impact
* rollback considerations

---

# 17. DATABASE MIGRATION RULES

Schema changes MUST be deliberate.

Never:

* rename/drop fields without impact analysis
* delete existing enums without checking consumers
* change nullability without checking stored data
* remove constraints without understanding why they exist
* change unique constraints without checking existing records

Prefer additive and backward-compatible migrations where practical.

For risky migrations:

```text
Analyze
→ identify data impact
→ identify affected code
→ test migration
→ verify application compatibility
→ deploy carefully
```

Never use `prisma db push` as a substitute for understanding migration requirements in production.

---

# 18. TRANSACTION / ATOMICITY RULE

Use database transactions when multiple database operations must succeed or fail together.

Examples may include:

* creating an order and dependent records
* payment-related state changes
* inventory updates
* rider assignment plus related updates
* settlement operations

Agents must identify partial-failure scenarios.

Ask:

> "What happens if step 2 succeeds and step 3 fails?"

If the operation requires atomicity, use an appropriate transaction strategy.

---

# 19. MONEY / PAYMENT SAFETY

Payment-related code receives the highest integrity scrutiny.

Never trust payment success from:

* UI state
* browser redirects
* query parameters
* client-submitted values
* animation completion
* client callbacks alone

Payment state must be verified through trusted server-side mechanisms.

Be careful with:

* amount calculations
* GST
* discounts
* rounding
* refunds
* settlement
* duplicate callbacks
* duplicate payment requests
* webhook retries
* payment/order state mismatch

Never alter payment logic casually.

---

# 20. FINANCIAL CALCULATIONS

Monetary values must not rely on unsafe floating-point behavior when precision matters.

Before changing price/payment/tax logic determine:

* whether prices are GST inclusive
* whether prices are GST exclusive
* discount application order
* tax calculation order
* rounding rules
* quantity handling
* refund behavior

Never silently change financial calculation semantics.

Document the exact formula when modifying financial logic.

---

# 21. ORDER STATE INTEGRITY

Order lifecycle changes must preserve valid state transitions.

Do not invent statuses.

Inspect actual:

* database enums
* constants
* API logic
* UI logic
* Socket.IO events

Prevent invalid transitions where appropriate.

Example concept:

```text
created
→ accepted
→ preparing
→ ready
→ completed
```

The actual application may differ.

Always use repository-defined states.

---

# 22. REALTIME / SOCKET.IO SAFETY

Socket.IO is part of the application's security and consistency boundary.

Agents must verify:

* authentication
* authorization
* merchant room isolation
* event naming
* payload validation
* listener cleanup
* reconnect behavior
* duplicate events
* duplicate listeners

Never emit sensitive merchant data to a broad/global channel without authorization.

Never assume a socket room is secure merely because it has a name.

Validate the user's right to join or receive events for the relevant merchant/resource.

---

# 23. RACE CONDITIONS

Whenever multiple users or processes can update the same entity, inspect concurrency.

Examples:

* order acceptance
* order cancellation
* payment completion
* rider assignment
* table status
* inventory
* menu availability

Think about:

```text
Request A
Request B
        ↓
same record
        ↓
conflicting updates
```

Consider:

* transactions
* unique constraints
* atomic updates
* optimistic locking
* state validation
* idempotency

Use the simplest reliable mechanism appropriate to the feature.

---

# 24. IDEMPOTENCY

Important operations may be retried.

Examples:

* payment callbacks
* webhook processing
* order creation
* status updates
* external API requests
* background jobs

Ask:

> "What happens if this request executes twice?"

Duplicate processing must be prevented where the business operation requires exactly-once effects.

---

# 25. API SECURITY

Every API must be treated as untrusted input.

Check:

* authentication
* authorization
* tenant isolation
* validation
* rate limiting where appropriate
* response filtering
* error handling
* sensitive data exposure

Do not expose internal exceptions directly to clients.

Avoid returning:

* stack traces
* database details
* internal filesystem paths
* credentials
* unnecessary sensitive information

---

# 26. API CONTRACT STABILITY

Before changing an existing API:

Find all consumers.

Consider:

* frontend
* mobile applications
* admin dashboard
* customer application
* staff application
* third-party integrations
* external systems

Prefer additive/backward-compatible changes where practical.

Never change a response field casually because "only this page uses it" without verifying consumers.

---

# 27. CORS

CORS configuration is security-sensitive.

Do not:

* use unrestricted origins casually
* allow credentials with unsafe wildcard configurations
* weaken origin checks merely to fix frontend development problems

Understand the existing custom-domain architecture before changing CORS.

---

# 28. DOMAIN / CUSTOM-DOMAIN SECURITY

ZapNowQR may use restaurant custom domains.

Domain-based routing must not become a tenant-isolation vulnerability.

Validate:

* domain mapping
* merchant association
* host/origin handling
* trusted headers
* custom-domain resolution

Never trust arbitrary client headers to select another merchant without server-side validation.

---

# 29. FILE UPLOAD SECURITY

File uploads are a high-risk surface.

Validate:

* file type
* extension
* MIME type
* file size
* storage path
* generated filename
* upload authorization

Avoid:

* path traversal
* executable uploads
* arbitrary filesystem writes
* user-controlled filesystem paths

Never construct filesystem paths directly from uncontrolled user input.

Example of dangerous input:

```text
../../../../etc/passwd
```

Treat uploaded filenames and paths as untrusted.

---

# 30. URL / EXTERNAL REQUEST SECURITY

When the server fetches a user-provided URL, consider SSRF risk.

Do not blindly allow requests to arbitrary destinations.

Protect against access to:

* localhost
* internal services
* cloud metadata endpoints
* private network addresses
* internal administration interfaces

Validate and restrict external URL targets where applicable.

---

# 31. LOGGING

Logs must help debugging without becoming a data-leak channel.

Do NOT log:

* passwords
* OTPs
* access tokens
* refresh tokens
* API secrets
* payment credentials
* full sensitive customer data unnecessarily

Use structured, useful logging where appropriate.

For important failures log enough context to diagnose the problem without exposing secrets.

---

# 32. CUSTOMER DATA / PRIVACY

Treat customer information as sensitive business data.

Examples:

* phone numbers
* names
* addresses
* email addresses
* order history
* payment-related information

Only collect, store, expose, and log what the application actually requires.

Do not expose customer data to unauthorized users.

Avoid returning excessive customer information from APIs.

---

# 33. DEPENDENCY MANAGEMENT

Do not add a package simply because it is convenient.

Before adding a dependency:

1. Check whether an existing dependency already solves the problem.
2. Consider maintenance status.
3. Consider security implications.
4. Consider bundle/runtime impact.
5. Consider license compatibility where relevant.
6. Use a stable version appropriate to the project.

Do not perform broad dependency upgrades during unrelated tasks.

Never run automated dependency upgrades blindly.

---

# 34. PACKAGE / SCRIPT SAFETY

Before running a package script, understand what it does.

Be cautious with:

* install scripts
* migration scripts
* deployment scripts
* reset scripts
* cleanup scripts
* database scripts

Never run destructive scripts merely to "see whether they work."

---

# 35. GIT SAFETY

Git history is part of the project.

Agents MUST NOT casually execute:

* `git reset --hard`
* `git clean -fd`
* force push
* history rewriting
* mass file deletion
* branch destruction

Do not discard user changes.

Before modifying files:

* inspect current Git status
* understand existing changes
* avoid overwriting unrelated work

Never assume the working tree is clean.

If another agent's changes exist, preserve them.

---

# 36. NO UNRELATED FORMATTING

Do not reformat entire files or directories unless required.

Avoid creating huge diffs from:

* prettier changes
* lint formatting
* import reordering
* line-ending conversion

Small, reviewable diffs are safer.

---

# 37. TYPE SAFETY

For TypeScript code:

* avoid `any` unless justified
* avoid unsafe casts
* do not suppress compiler errors casually
* do not use `@ts-ignore` without strong justification
* preserve existing types
* prefer explicit interfaces/types for API boundaries

Do not silence errors merely to make the build pass.

A suppressed error is not a fixed error.

---

# 38. ERROR HANDLING

Production code must handle expected failures.

Consider:

* validation errors
* authentication errors
* authorization errors
* database errors
* external API failures
* timeouts
* Socket.IO disconnects
* malformed requests
* duplicate requests

Do not swallow errors silently.

Do not expose internal implementation details to users.

---

# 39. OBSERVABILITY

Important production workflows should have enough observability to diagnose failures.

Where appropriate consider:

* structured logs
* request IDs
* correlation IDs
* meaningful error codes
* external integration logging
* Socket.IO diagnostics
* database failure context

Do not add noisy logging that leaks sensitive information.

---

# 40. FRONTEND SECURITY

Never treat frontend code as a trusted security boundary.

Do not rely on:

* hidden UI
* disabled buttons
* frontend role checks
* local state
* localStorage permissions

Sensitive authorization decisions belong on the server.

Avoid exposing secrets in:

* source code
* frontend environment variables
* bundles
* browser local storage

Assume everything delivered to the browser can be inspected by the user.

---

# 41. XSS / HTML SAFETY

Do not inject untrusted HTML into the frontend.

Be especially careful with:

* restaurant descriptions
* customer input
* menu content
* rich text
* external content
* HTML rendering
* `dangerouslySetInnerHTML`

Sanitize untrusted content where HTML rendering is actually required.

---

# 42. REACT / FRONTEND STATE SAFETY

Be careful with:

* stale closures
* duplicated listeners
* state races
* optimistic updates
* repeated API requests
* unmounted component updates
* stale merchant context
* stale order state

Do not add global state when local state is sufficient.

---

# 43. PERFORMANCE RULE

Do not optimize blindly.

First identify the actual bottleneck.

Avoid introducing:

* unnecessary caching
* unnecessary background jobs
* unnecessary database indexes
* premature abstraction
* complicated state-management systems

Optimization must be justified by evidence or a known scaling concern.

---

# 44. DATABASE PERFORMANCE

Pay attention to:

* N+1 queries
* unbounded queries
* missing pagination
* expensive joins/includes
* repeated lookups
* missing indexes where justified
* unnecessary full-table scans

Do not add an index without understanding its purpose.

---

# 45. API PERFORMANCE

Prefer:

* pagination
* bounded result sets
* selective response fields
* efficient database queries
* appropriate caching where justified

Avoid returning entire datasets when the UI only needs a small subset.

---

# 46. TESTING REQUIREMENT

Every meaningful change should be tested.

Testing should cover, where applicable:

### Happy path

Normal successful behavior.

### Validation

Invalid input.

### Authorization

Unauthorized user behavior.

### Tenant isolation

Cross-merchant access attempts.

### Failure paths

Database/external-service failure.

### Realtime

Socket events and reconnect behavior.

### Concurrency

Duplicate/simultaneous operations.

### Regression

Existing workflows.

---

# 47. TEST BEFORE CLAIMING SUCCESS

An agent MUST NOT say:

> "Done"

when it has not verified the change.

The agent must distinguish:

```text
Implemented
Tested
Not tested
Blocked
Unknown
```

Never claim a test passed unless it was actually executed and passed.

Never claim a build succeeded unless it was actually run successfully.

---

# 48. TEST ENVIRONMENT SAFETY

Do not run tests that may modify production data.

Before database tests determine:

* which database is being used
* whether it is production
* whether test data is isolated

Never assume a configured database is safe to reset.

---

# 49. PRODUCTION DEPLOYMENT SAFETY

Agents should not deploy production code unless explicitly authorized.

Before deployment-related work:

* identify environment
* identify build artifact
* identify rollback strategy
* identify migrations
* identify environment variables
* identify expected downtime
* identify realtime impact

Do not make production infrastructure changes casually.

---

# 50. DATABASE + CODE COMPATIBILITY

When schema and application code change together, maintain compatibility during the transition where practical.

Preferred pattern:

```text
Add
→ migrate safely
→ deploy compatible code
→ verify
→ remove legacy behavior later
```

Avoid:

```text
Delete old field
→ hope everything still works
```

---

# 51. FEATURE FLAGS / BACKWARD COMPATIBILITY

For risky changes, consider whether a feature flag or compatibility layer is appropriate.

Do not introduce feature flags unnecessarily.

Use them when they materially reduce rollout risk.

---

# 52. EXTERNAL SERVICES

Treat external APIs as unreliable.

Expect:

* timeout
* rate limits
* malformed response
* authentication failure
* temporary outage
* duplicate callback
* changed response behavior

Use appropriate:

* timeout
* retry
* idempotency
* fallback
* error handling

Do not retry operations blindly when they may create duplicate financial or business actions.

---

# 53. WEBHOOK SECURITY

Webhook endpoints must not blindly trust incoming requests.

Where supported, verify:

* signatures
* shared secrets
* event IDs
* timestamps
* expected event types

Protect against replay and duplicate processing where appropriate.

---

# 54. CRON / BACKGROUND JOB SAFETY

Background jobs may execute more than once.

Design for:

* retries
* crashes
* duplicate execution
* partial failure

Never assume a background process runs exactly once.

---

# 55. AI AGENT SAFETY

AI agents must not:

* fabricate test results
* fabricate code behavior
* fabricate API behavior
* fabricate database state
* claim deployment success without verification
* claim security without analysis
* delete code to resolve a test failure without understanding why
* disable tests to make CI pass
* weaken validation to make requests succeed
* comment out failing functionality as a shortcut
* hide errors from reviewers
* conceal uncertainty

When unsure, state:

```text
FACT
INFERENCE
UNKNOWN
```

---

# 56. NO SECURITY BYPASS FOR DEBUGGING

Temporary debugging changes must not weaken permanent security.

Never "temporarily" add:

* open CORS
* disabled auth
* admin bypass
* hardcoded credentials
* unrestricted endpoints
* fake payment success
* tenant bypass

If debugging requires a temporary mechanism, it must be clearly isolated and removed before completion.

---

# 57. CODE REVIEW MINDSET

Before finishing implementation, review the diff as if you were an independent reviewer.

Ask:

* Did I modify only what was needed?
* Did I introduce a security issue?
* Did I break tenant isolation?
* Did I change an API contract?
* Did I change database semantics?
* Did I create a race condition?
* Did I expose sensitive data?
* Did I add unnecessary dependencies?
* Did I break existing behavior?
* Did I test failure paths?

---

# 58. CHANGE SUMMARY

Every implementation agent should provide a final summary containing:

```text
Changed:
- files actually modified

Why:
- reason for each meaningful change

Database:
- schema/migration impact

API:
- API changes

Realtime:
- Socket.IO changes

Security:
- security considerations

Tests:
- tests executed and results

Not tested:
- anything that could not be verified

Risks:
- remaining known risks
```

---

# 59. AGENT HANDOFF

The project uses specialized agents.

A handoff should contain enough information for the next agent to continue without rediscovering the entire task.

Expected flow:

```text
User Request
    ↓
Principal Code Analyst
    ↓
Implementation Agent
    ↓
QA Agent
    ↓
Code Review Agent
    ↓
Deployment Agent
```

Each agent must preserve the context and findings of the previous agent.

Do not overwrite another agent's analysis without reason.

---

# 60. PRINCIPAL ANALYST GATE

For major changes, implementation should generally begin only after the Principal Code Analyst has identified:

* relevant files
* existing data flow
* dependencies
* database impact
* API impact
* realtime impact
* security risks
* regression risks
* edge cases
* recommended implementation strategy

Minor changes may not require a full repository analysis.

Use engineering judgment.

---

# 61. QA GATE

Meaningful feature changes should be verified by testing before being considered complete.

The QA agent should verify:

* requirement
* happy path
* edge cases
* security
* tenant isolation
* API behavior
* database behavior
* realtime behavior
* regression

---

# 62. CODE REVIEW GATE

A code reviewer should verify:

* task scope
* implementation correctness
* security
* type safety
* data integrity
* database changes
* API compatibility
* error handling
* tests
* unnecessary complexity

A reviewer should not simply approve because the code compiles.

---

# 63. EMERGENCY / HIGH-RISK CHANGES

The following require extra scrutiny:

* payment changes
* settlement changes
* authentication changes
* authorization changes
* tenant isolation changes
* database destructive changes
* production configuration changes
* custom domain handling
* file upload changes
* external webhook processing
* order state transitions
* inventory logic
* financial calculations

Do not combine unrelated high-risk changes into one task.

---

# 64. UNKNOWN IS BETTER THAN GUESSING

The following rule is mandatory:

> An explicit UNKNOWN is better than an incorrect assumption.

When evidence is insufficient:

```text
UNKNOWN:
The repository does not show whether an external consumer depends on this API.
```

Do not invent certainty.

---

# 65. EVIDENCE-BASED ENGINEERING

Important conclusions should reference evidence from:

* source files
* functions
* components
* routes
* Prisma models
* migrations
* configuration
* tests
* logs when specifically relevant

Avoid architecture statements based solely on filenames.

---

# 66. DOCUMENTATION

Update documentation when a meaningful architecture or developer workflow changes.

Do not create documentation that contradicts the implementation.

Documentation should describe actual behavior.

---

# 67. CODE QUALITY

Prefer:

* clear names
* small focused functions
* explicit data flow
* strong typing
* predictable error handling
* reusable abstractions only when justified
* simple architecture
* maintainable code

Avoid:

* clever code
* unnecessary abstraction
* deeply nested logic
* hidden side effects
* duplicated business rules
* magic constants without explanation

---

# 68. NO BIG-BANG REWRITES

Do not rewrite large sections of the application unless explicitly required.

For legacy areas:

1. understand existing behavior
2. identify the required change
3. isolate the change
4. test
5. improve incrementally

Large rewrites create unnecessary production risk.

---

# 69. CLEANUP RULE

Do not mix cleanup with feature work unless it is necessary for the feature.

Bad:

```text
Implement rider reassignment
+
rewrite order service
+
rename 70 files
+
upgrade React
```

Preferred:

```text
Implement rider reassignment
→ test
→ review
```

Create separate modernization tasks later.

---

# 70. FINAL NON-NEGOTIABLE RULES

Every AI agent working on ZapNowQR must remember:

### Rule 1

**Never compromise security to make a feature work.**

### Rule 2

**Never compromise data integrity to make development faster.**

### Rule 3

**Never assume tenant isolation is working—verify it.**

### Rule 4

**Never claim success without verification.**

### Rule 5

**Never hide uncertainty.**

### Rule 6

**Never modify unrelated code.**

### Rule 7

**Never expose secrets.**

### Rule 8

**Never perform destructive production operations casually.**

### Rule 9

**Never silently change business logic.**

### Rule 10

**Analyze first. Change second. Test third. Review fourth.**

---

# 71. ZAPNOWQR ENGINEERING STANDARD

The standard for this repository is:

```text
Understand
    ↓
Analyze
    ↓
Plan
    ↓
Implement
    ↓
Test
    ↓
Review
    ↓
Verify
    ↓
Deploy
```

Not:

```text
Prompt
↓
Change random files
↓
Hope it works
```

All agents are expected to behave like members of a professional production engineering team.

---

# END OF GLOBAL AGENT RULES
