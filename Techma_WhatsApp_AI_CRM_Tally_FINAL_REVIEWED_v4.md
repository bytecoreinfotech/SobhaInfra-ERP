# TECHMA WHATSAPP + AI CRM + TALLY
## FREE-FIRST PRODUCTION MASTER SPECIFICATION

**Version:** 4.0 — FINAL REVIEWED BASELINE  
**Purpose:** Master implementation document for Lovable + human developers
**Status:** Final reviewed baseline — implementation may proceed phase-by-phase  
**Primary goal:** WhatsApp Marketing + AI Sales Automation + CRM + TallyPrime + Sales Intelligence  
**Deployment goal:** Zero hosting cost for the MVP / early production stage, while keeping a clean migration path to paid infrastructure.

---

# 1. EXECUTIVE SUMMARY

Build a multi-tenant-ready sales automation platform in which:

```text
Marketing Campaign
      ↓
WhatsApp
      ↓
Customer Reply
      ↓
AI Sales Assistant
      ↓
Product / Brochure / Rate / FAQ
      ↓
Qualification
      ↓
Lead Score + Intent + Objection
      ↓
CRM
      ↓
Human Salesperson
      ↓
Quotation / Deal
      ↓
TallyPrime
      ↓
Invoice / Outstanding / Payment
      ↓
Payment Follow-up
      ↓
Dashboard + Google Sheets
```

The system must be designed so that AI, WhatsApp, Tally or Google Sheets can fail temporarily without destroying CRM data.

**Primary source of truth:** CRM database.

**Accounting source of truth:** TallyPrime.

**Reporting destination:** CRM dashboard + optional Google Sheets.

**AI source of business facts:** approved knowledge/product/pricing tools.

---

# 2. NON-NEGOTIABLE PRODUCT PRINCIPLES

1. CRM must work even when AI is disabled.
2. CRM must work even when Tally is disconnected.
3. Google Sheets must never be the primary database.
4. AI must never invent prices, discounts, stock, payment status or delivery promises.
5. AI must have configurable conversation limits.
6. Human takeover must always be possible.
7. Every external webhook must be idempotent.
8. Bulk campaign processing must use queues/background jobs.
9. Secrets must never be exposed in frontend code.
10. All important business actions must be auditable.
11. The free deployment architecture must avoid unnecessary always-on servers.
12. Paid external services such as WhatsApp messaging and OpenAI API are **not** considered hosting costs; they must be tracked separately.

---

# 3. FREE-FIRST TECHNOLOGY STACK — LOVABLE-OPTIMIZED

## 3.1 Final Recommended Stack

| Layer | Technology | Why |
|---|---|---|
| App builder | Lovable | Fast AI-assisted development |
| Frontend | Lovable's current supported web stack + TypeScript | Lovable-native |
| Database | Supabase PostgreSQL | Native Lovable integration, SQL, RLS |
| Auth | Supabase Auth | Native Lovable integration |
| Backend/API | Supabase Edge Functions | Secure server-side integrations |
| File storage | Supabase Storage initially | Simple Lovable integration |
| Background jobs | Supabase Cron + DB job tables | Free-first and simple |
| Optional queue | Supabase Queues/PGMQ | Add when workload requires durable queues |
| Frontend hosting | Lovable hosting initially; Cloudflare Pages/other static host if required | Keep migration path open |
| AI | OpenAI API | Controlled AI Sales Agent |
| WhatsApp | Meta WhatsApp Cloud API | Official WhatsApp channel |
| Accounting | TallyPrime + local connector/agent | Local accounting system |
| Reporting | CRM dashboard + Google Sheets | Business reporting |
| Source control | GitHub | Version control + developer handoff |

**Important Lovable compatibility decision:** Use **Supabase as the primary backend**, not Cloudflare D1 as the first implementation. Lovable has native Supabase integration for database, authentication, storage, realtime and Edge Functions, which makes it materially easier for Lovable and a human developer to build and maintain this system. citeturn1search0turn1search5

## 3.2 Free Tier Reality

Supabase Free currently includes 500 MB database size, 1 GB file storage, 5 GB egress, 50,000 MAU and 500,000 Edge Function invocations. Free projects can pause after 1 week of inactivity. citeturn0search0

Therefore:

- This is a **free-first MVP/early-production architecture**, not a promise of unlimited free operation.
- The system must monitor database size, storage, egress and function usage.
- Old raw chat/media data should have configurable retention/archival.
- Brochures and large media should not be duplicated in database rows.
- WhatsApp and OpenAI usage are external costs and are never assumed to be free.
- If the business requires guaranteed always-on infrastructure, automatic backups and higher quotas, move to a paid backend without changing the application domain model.

## 3.3 Why This Stack Is Better for Lovable

Lovable's native Supabase integration can create database tables, authentication, storage and Edge Functions through the development workflow. Lovable also supports GitHub synchronization and external deployment. citeturn1search0turn1search14turn1search9

This reduces the risk of Lovable generating a frontend that does not match a separately designed backend.

---

# 4. FREE DEPLOYMENT ARCHITECTURE

```text
                         INTERNET
                            |
              +-------------+-------------+
              |                           |
          Lovable Web App             WhatsApp
              |                       Webhook
              v                           |
        Supabase Edge Functions <---------+
              |
       +------+-------------------------+
       |                                |
       v                                v
 Supabase PostgreSQL              Supabase Storage
       |                                |
       |                                |
       +------------+-------------------+
                    |
             Cron / Job Runner
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
     Campaign      AI        Tally Sync
      Worker     Worker        Worker
        |           |           |
        v           v           v
    WhatsApp     OpenAI      Local Connector
                              ↓
                           TallyPrime

                    |
                    v
             CRM + Analytics
                    |
                    v
              Google Sheets
```

## 4.1 Background Processing Strategy

For the first implementation, use:

```text
DB job table
   ↓
Supabase Cron
   ↓
Edge Function
   ↓
Claim N pending jobs atomically
   ↓
Process
   ↓
Mark success / retry / failed
```

This avoids requiring a separate always-on worker.

Supabase supports Cron jobs that can invoke Edge Functions, and its current Queues/PGMQ feature can be introduced later if durable queue semantics become necessary. citeturn2search1turn2search0

**Do not make Supabase Queues a hard MVP dependency solely because it exists; it is currently documented as Public Alpha.** Start with a database-backed job queue and migrate selected workloads to PGMQ when justified. citeturn2search7

# 4. FREE DEPLOYMENT ARCHITECTURE

```text
                         INTERNET
                            |
              +-------------+-------------+
              |                           |
          Lovable UI                 WhatsApp
              |                       Webhook
              v                           |
       Cloudflare Worker API <------------+
              |
       +------+-------------------+
       |          |               |
       v          v               v
      D1         R2            Queues
   Database    Files          Jobs
       |                          |
       |                          v
       |                    Campaign Worker
       |                    AI Worker
       |                    Sync Worker
       |
       +----------+-----------+
                  |
          Dashboard / CRM
                  |
       +----------+----------+
       |                     |
       v                     v
   OpenAI API           Google Sheets
       |
       |
       v
 Tally Connector
       |
       v
 Local TallyPrime
```

---

# 5. IMPORTANT FREE-TIER REALITY

"Free deployment" means:

- no monthly hosting bill initially
- free-tier quotas are respected
- architecture can scale later

It does NOT mean:

- WhatsApp messages are free
- OpenAI API is free
- Meta business verification is necessarily free
- TallyPrime is free
- domain is free
- large-scale storage is always free

The application must show third-party usage/cost separately.

---

# 6. CLOUDFLARE FREE-TIER SAFETY

Configure application-level limits below platform limits.

Example:

```text
Daily API request budget: configurable
Campaign batch size: 50-100
AI messages/contact/day: configurable
AI monthly budget: configurable
Queue retry limit: configurable
File upload size: configurable
Webhook rate limit: configurable
```

If a free-tier limit is approaching:

```text
Normal
  ↓
Warning
  ↓
Pause non-critical jobs
  ↓
Admin alert
```

Never let an accidental loop consume the entire quota.

---

# 6A. LOVABLE DEVELOPMENT RULES

The developer must build in small, testable phases.

Recommended Lovable workflow:

```text
PLAN
 ↓
DATABASE SCHEMA
 ↓
AUTH + RLS
 ↓
CRM
 ↓
WHATSAPP INBOX
 ↓
CAMPAIGNS
 ↓
AI
 ↓
TALLY
 ↓
ANALYTICS
```

Do not ask Lovable to build the entire platform in one prompt.

After each phase:

1. Build
2. Test
3. Review database/RLS
4. Test mobile UI
5. Run security checks
6. Commit to GitHub
7. Continue to next phase

Lovable documentation recommends using Plan mode for investigation/planning and GitHub for version-controlled development. citeturn1search2turn1search13turn1search14

## 6B. DEFINITION OF DONE

A feature is not complete merely because the screen exists.

For every module:

```text
UI
+
Database
+
Validation
+
Authorization
+
Error Handling
+
Loading States
+
Empty States
+
Audit Event
+
Mobile Check
+
Security Test
+
Happy-path Test
+
Failure-path Test
```

## 6C. DATABASE-FIRST RULE

For database-backed features:

1. Define schema.
2. Define foreign keys.
3. Define indexes.
4. Define RLS.
5. Define server-side operations.
6. Then build UI.

Never allow frontend-only authorization.

## 6D. API / INTEGRATION RULE

Every external integration must have:

```text
Connection
Health Check
Secrets
Webhook
Idempotency
Timeout
Retry
Error Log
Audit Log
Manual Retry
Disconnect / Disable
```

# 7. PROJECT STRUCTURE

Recommended monorepo:

```text
techma-sales-platform/
│
├── apps/
│   └── web/
│       ├── src/
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       └── services/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   │   ├── whatsapp-webhook/
│   │   ├── ai-chat/
│   │   ├── campaign-worker/
│   │   ├── tally-sync/
│   │   ├── sheets-sync/
│   │   └── automation-runner/
│   ├── seed/
│   └── config.toml
│
├── docs/
│
└── README.md
```

---

# 8. CORE MODULES

## Phase 1 — Foundation

- Authentication
- Organization
- Users
- Roles
- Permissions
- Audit logs
- Settings
- Dashboard shell

## Phase 2 — CRM

- Leads
- Customers
- Contacts
- Deals
- Tasks
- Activities
- Notes
- Customer 360
- Sales pipeline

## Phase 3 — WhatsApp

- WhatsApp connection
- Webhook
- Inbox
- Conversations
- Contacts
- Templates
- Media
- Delivery/read status
- Opt-out

## Phase 4 — Campaigns

- Audience
- Segmentation
- Campaign creation
- Template selection
- Scheduling
- Queue
- Sending
- Retry
- Analytics

## Phase 5 — AI

- Knowledge base
- OpenAI integration
- AI conversation
- Tool calling
- Qualification
- Lead scoring
- Human handoff
- AI usage/cost

## Phase 6 — Tally

- Connector
- Ledger/customer mapping
- Invoice sync
- Outstanding
- Payment
- Reconciliation
- Sync logs

## Phase 7 — Intelligence

- Funnel analytics
- Objection analytics
- Product analytics
- Salesperson analytics
- Campaign ROI
- Google Sheets

---

# 9. CRM DATA MODEL

Core tables:

```text
organizations
users
roles
permissions
user_roles

leads
customers
contacts
deals
deal_items

activities
tasks
notes

products
product_categories
product_prices

campaigns
campaign_recipients
campaign_events

whatsapp_accounts
whatsapp_contacts
whatsapp_conversations
whatsapp_messages
whatsapp_media

ai_conversations
ai_messages
ai_runs
ai_tool_calls
ai_knowledge
ai_knowledge_versions

lead_scores
lead_intents
lead_objections

quotations
quotation_items

tally_connections
tally_mappings
tally_sync_jobs
tally_sync_errors
tally_invoices
tally_outstandings
tally_payments

automation_rules
automation_runs

integration_events
audit_logs
usage_metrics
```

All tenant-owned tables must include:

```text
organization_id
created_at
updated_at
```

---

# 10. CUSTOMER 360

Customer screen:

```text
CUSTOMER
├── Profile
├── WhatsApp
├── Campaign History
├── AI Summary
├── Products Interested
├── Deals
├── Quotations
├── Tasks
├── Calls
├── Notes
├── Tally Invoices
├── Outstanding
├── Payments
└── Audit History
```

A salesperson should understand the customer without reading the entire historical chat.

---

# 11. WHATSAPP ARCHITECTURE

Use official WhatsApp Cloud API.

Flow:

```text
WhatsApp
   ↓
Webhook
   ↓
Signature / authenticity validation
   ↓
Idempotency check
   ↓
Store event
   ↓
Process asynchronously
   ↓
CRM
   ↓
AI / Campaign / Automation
```

Never perform expensive processing directly inside the webhook request.

---

# 12. WHATSAPP INBOX

Features:

- Conversation list
- Search
- Customer profile
- Message history
- Media
- AI indicator
- Human takeover
- Assign salesperson
- Internal notes
- Lead stage
- Product context
- Follow-up task
- Opt-out

Conversation modes:

```text
AI ACTIVE
HUMAN ACTIVE
AI PAUSED
CLOSED
```

---

# 13. CAMPAIGN ENGINE

Campaign creation:

```text
Campaign
 ↓
Audience
 ↓
Eligibility / Opt-out check
 ↓
Template validation
 ↓
Queue
 ↓
Sender Worker
 ↓
WhatsApp API
 ↓
Delivery Webhook
 ↓
Analytics
```

Never loop over 5,000 contacts inside one HTTP request.

Use queue batches.

---

# 14. CAMPAIGN SEGMENTATION

Filters:

- Location
- Product interest
- Customer type
- Previous campaign
- Lead stage
- Last interaction
- Tally outstanding
- Purchase history
- Tags
- Opt-in status
- Opt-out status

Before sending:

```text
Targeted
- Invalid number
- Opted out
- Already contacted
- Duplicates
= Final audience
```

Show the exact final audience count.

---

# 15. CAMPAIGN ATTRIBUTION

Track:

```text
first_touch_campaign
last_touch_campaign
conversion_campaign
campaign_history
```

This enables:

> Which campaign actually generated the customer?

---

# 16. AI SALES AGENT

The AI is a **bounded sales assistant**, not unrestricted autonomous AI.

Levels:

### Level 1 — Information

- Product details
- Brochure
- Rate chart
- FAQ
- Packaging
- Basic policies

### Level 2 — Qualification

- Requirement
- Quantity
- Location
- Timeline
- Product
- Price concern

### Level 3 — Human Handoff

- Negotiation
- Final quotation
- Discount
- Credit terms
- Complaint
- Unknown question
- Strong buying intent

---

# 17. AI KNOWLEDGE BASE

Knowledge sources:

- Product catalogue
- Brochures
- Rate charts
- FAQs
- Sales policies
- Delivery rules
- Payment terms
- Approved scripts

Every knowledge item:

```text
knowledge_id
category
title
content
file_reference
version
status
effective_from
effective_until
updated_by
updated_at
```

AI can use only active/effective data.

---

# 18. AI TOOL REGISTRY

Controlled tools:

```text
get_customer_profile()
get_product()
get_product_price()
get_brochure()
get_rate_chart()
get_faq()
get_outstanding_summary()
update_lead_intent()
update_lead_score()
create_followup()
request_human_handoff()
```

AI must never receive unrestricted SQL/database access.

---

# 19. AI PRICING GUARDRAIL

AI must never invent:

- Price
- Discount
- Stock
- Tax
- Delivery date
- Credit terms
- Payment status

Pricing flow:

```text
Customer asks price
      ↓
AI extracts product/quantity
      ↓
get_product_price()
      ↓
Approved price returned
      ↓
AI responds
```

Negotiation:

```text
"Rate kam hoga?"
       ↓
AI records price objection
       ↓
Human salesperson
```

---

# 20. AI CONVERSATION STATE

```text
NEW
 ↓
ENGAGED
 ↓
DISCOVERY
 ↓
PRODUCT_IDENTIFIED
 ↓
QUALIFIED
 ↓
PRICE_DISCUSSION
 ↓
HUMAN_HANDOFF
 ↓
SALES_FOLLOWUP
 ↓
WON / LOST / LATER
```

---

# 21. AI QUALIFICATION

Structured fields:

```text
intent
interest_level
product_ids
quantity
location
purchase_timeline
price_feedback
objections[]
brochure_requested
rate_chart_requested
quotation_requested
human_requested
next_action
summary
```

Example:

```text
Intent: interested
Interest: hot
Product: Tile Adhesive
Quantity: 500 bags
Location: Mumbai
Objection: price
Timeline: this month
Human follow-up: yes
```

---

# 22. AI LEAD SCORING

Configurable example:

```text
Explicit buying intent      +30
Quotation requested         +20
Salesperson requested       +20
Quantity provided           +10
Rate chart requested        +10
Brochure requested           +5
Price objection             -10
Not interested              -40
Opt-out                    -100
```

Show both score and reasons.

---

# 23. HUMAN HANDOFF

Triggers:

- Salesperson requested
- Discount negotiation
- Final quotation
- Credit request
- Complaint
- Unknown question
- Strong buying intent
- AI limit reached

Handoff card:

```text
🔥 HOT LEAD

Customer: ABC Traders
Product: Tile Adhesive
Quantity: 500 Bags
Location: Mumbai

Issue: Price
Requested: Better rate

AI Summary:
Customer is interested but considers
the current rate expensive.

Recommended action:
Call and discuss bulk pricing.
```

---

# 24. SALES FEEDBACK LOOP

After salesperson interaction:

```text
Contacted
Interested
Quotation Sent
Negotiation
Follow-up Later
Not Reachable
Wrong Lead
Lost
Won
```

Reasons:

```text
Price
Competitor
Quality
Timing
Budget
Availability
Other
```

Use this data to evaluate AI qualification quality.

---

# 25. CAMPAIGN INTELLIGENCE

Example for 5,000 recipients:

```text
5,000 Targeted
4,700 Delivered
840 Replied
610 AI Conversations

245 Interested
110 HOT
135 WARM

120 Price Issues
80 Brochure Requests
65 Rate Chart Requests
95 Not Interested

180 Human Handoffs

28 Converted
```

All numbers must come from actual stored events.

---

# 26. EVENT MODEL

Track:

```text
campaign_targeted
message_queued
message_sent
message_delivered
message_read
customer_replied
ai_started
ai_tool_called
ai_qualified
brochure_sent
rate_chart_sent
price_objection
human_handoff
quotation_requested
sales_contacted
deal_created
deal_won
deal_lost
payment_reminder_sent
payment_received
```

This makes analytics reliable.

---

# 27. IDEMPOTENCY

Every external event needs a unique key.

```text
provider + provider_event_id
```

Processing:

```text
Event received
      ↓
Already processed?
 ├── YES → acknowledge
 └── NO  → process + store
```

This prevents duplicate CRM records.

---

# 28. TALLY ARCHITECTURE

Do not connect cloud CRM directly to Tally localhost.

Use:

```text
Cloud CRM
   ↓
Secure Tally Connector
   ↓
Local TallyPrime
```

Tally connector responsibilities:

- Local connection
- Sync
- Queue
- Retry
- Mapping
- Health status
- Error reporting

Tally remains source of truth for accounting.

CRM remains source of truth for sales/marketing.

---

# 29. TALLY DATA

Sync:

- Customers/Ledgers
- Invoices
- Outstanding
- Payments
- Selected sales/accounting data

Mapping:

```text
Tally Ledger
      ↓
Exact Match
      ↓
Possible Match
      ↓
Human Confirmation
```

Never merge ledgers only because names look similar.

---

# 30. PAYMENT FOLLOW-UP AUTOMATION

Example:

```text
Tally Outstanding
       ↓
Due Date
       ↓
Automation Rule
       ↓
WhatsApp Reminder
       ↓
Customer Reply
       ↓
AI handles basic query
       ↓
Payment-related issue
       ↓
Accounts/Salesperson
```

AI must not claim payment is received unless Tally confirms it.

---

# 31. GOOGLE SHEETS

Google Sheets is optional reporting.

Never use it as primary database.

Tabs:

```text
Campaign Summary
Qualified Leads
Hot Leads
Price Objections
Human Follow-ups
Product Interest
Sales Outcomes
Daily AI Activity
```

Use stable CRM IDs.

---

# 32. DASHBOARDS

## Management Dashboard

- Total leads
- Campaign performance
- Hot leads
- Conversion
- Revenue
- Outstanding
- Payment recovery
- AI usage
- Salesperson performance

## Campaign Dashboard

- Targeted
- Sent
- Delivered
- Read
- Replied
- Interested
- Price objections
- Human handoff
- Quotation
- Converted

## AI Dashboard

- Conversations
- Messages
- Tool calls
- Qualified leads
- Handoffs
- AI cost
- Average turns
- AI failure rate
- Qualification accuracy

## Tally Dashboard

- Connection
- Last sync
- Invoices
- Outstanding
- Payments
- Errors
- Pending retries

---

# 33. FREE DEPLOYMENT DESIGN

## Cloudflare

Use:

```text
Workers
D1
R2
Queues
Static Assets
```

Free-tier limits are finite and must be monitored. Current Cloudflare documentation lists Workers Free at 100,000 requests/day, D1 Free at 5 million rows read/day and 100,000 rows written/day, and Queues Free with 24-hour message retention. citeturn0search0turn0search1turn0search4

## Important

The system must NOT assume the free tier can support unlimited 5,000-recipient campaigns forever.

Add:

```text
Usage Dashboard
Quota Warning
Job Pause
Admin Alert
```

If the application outgrows the free tier, move to paid Cloudflare without rewriting the architecture.

---

# 34. FREE DEPLOYMENT ENVIRONMENTS

## Development

```text
Local machine
Cloudflare local/dev tools
Test WhatsApp number
Test Tally company
Test OpenAI key
```

## Staging

```text
Cloudflare Worker
Separate D1 database
Separate R2 bucket
Separate WhatsApp configuration
Separate secrets
```

## Production

```text
Production Worker
Production D1
Production R2
Production Queues
Production WhatsApp
Production OpenAI
Production Tally Connector
```

Never use production database for development.

---

# 35. SECRETS

Never commit:

```text
OPENAI_API_KEY
WHATSAPP_ACCESS_TOKEN
WHATSAPP_APP_SECRET
TALLY_CREDENTIALS
GOOGLE_CLIENT_SECRET
SESSION_SECRET
```

Use Cloudflare secrets/environment bindings.

---

# 36. BACKUP STRATEGY

Even when using free services:

- Daily database export
- Weekly full backup
- Product/knowledge backup
- Campaign data export
- Configuration backup

At minimum, keep an external encrypted backup.

Do not rely on a free-tier database as the only copy of business data.

---

# 37. SECURITY

Required:

- RBAC
- Tenant isolation
- Server-side authorization
- Input validation
- Rate limiting
- Webhook verification
- Idempotency
- Secure file URLs
- Audit logs
- Secret management
- Session security
- Backup protection

---

# 38. AI SAFETY

AI must not:

- Reveal internal prompts
- Reveal CRM records of other customers
- Invent business information
- Negotiate unauthorized pricing
- Confirm unverified payment
- Promise unavailable stock
- Promise delivery without approved data
- Continue after human takeover
- Send marketing messages without required campaign eligibility/consent controls

---

# 39. FILE / MEDIA SYSTEM

Store:

- Brochures
- Rate charts
- Product images
- PDFs
- Quotations

Use R2.

Database stores metadata:

```text
file_id
organization_id
filename
mime_type
size
r2_key
category
product_id
version
status
created_at
```

---

# 40. AUTOMATION ENGINE

Generic rules:

```text
WHEN event
IF conditions
THEN action
```

Example:

```text
WHEN lead.intent = interested
AND lead.interest_level = hot
THEN create salesperson task
```

Another:

```text
WHEN tally.outstanding > configured_threshold
AND due_date <= today
THEN payment_followup
```

Automation must have:

- Active/inactive
- Conditions
- Action
- Retry
- Audit log
- Last execution
- Failure reason

---

# 41. NOTIFICATION SYSTEM

Notify salesperson via:

- CRM notification
- Email if configured
- WhatsApp/internal channel if configured

Examples:

```text
🔥 New Hot Lead
💰 Price Objection
📞 Callback Requested
📄 Quotation Requested
💳 Payment Overdue
⚠ Tally Sync Failed
```

---

# 42. SEARCH

Global search across:

- Customers
- Leads
- Deals
- Phone numbers
- Product
- Campaign
- Invoice
- Tally ledger

Phone normalization is mandatory.

Example:

```text
+91 98765 43210
9876543210
+919876543210
```

must resolve to the same contact where appropriate.

---

# 43. REPORT EXPORT

Support:

- CSV
- XLSX if needed
- Google Sheets
- PDF summary

Reports should preserve CRM IDs and timestamps.

---

# 44. OBSERVABILITY

Track:

- API errors
- Webhook errors
- Queue failures
- AI latency
- AI cost
- WhatsApp failures
- Tally failures
- Google Sheets failures
- Database errors
- Authentication failures

Use correlation IDs:

```text
campaign_event_id
conversation_id
customer_id
ai_run_id
task_id
```

---

# 45. AI TESTING

Before production, create test conversations for:

- Product query
- Price query
- Brochure
- Rate chart
- Price objection
- Discount request
- Competitor
- Complaint
- Human handoff
- Unknown question
- Opt-out
- Hindi
- Hinglish
- Typos
- Multiple products
- Large quantity
- Tally payment question

Acceptance requires:

- Correct answer
- Correct tool
- Correct CRM classification
- No hallucinated price
- Correct handoff
- Correct analytics event

---

# 46. PERFORMANCE TEST

Test at minimum:

```text
5,000 campaign recipients
1,000+ replies
500+ concurrent stored conversations
Large message history
Large CRM search
Repeated webhooks
Queue retry
Tally offline
OpenAI timeout
WhatsApp API timeout
Google Sheets failure
```

System must degrade gracefully.

---

# 47. FAILURE BEHAVIOUR

## WhatsApp down

Campaign jobs remain queued/retry later.

## OpenAI down

CRM and human inbox continue working.

AI sends fallback:

> "Aapki query sales team ko forward kar raha hoon."

## Tally offline

CRM continues. Sync is queued.

## Google Sheets down

CRM continues. Sync retries.

## R2 unavailable

CRM metadata remains safe; media action shows retry/error.

---

# 48. PHASED IMPLEMENTATION

## Phase 1 — Foundation
Auth, RBAC, organization, CRM.

## Phase 2 — WhatsApp Inbox
Webhook, conversations, media, human inbox.

## Phase 3 — Campaigns
Templates, audience, queue, delivery tracking.

## Phase 4 — AI Information Assistant
Product/FAQ/brochure/rate lookup.

## Phase 5 — AI Qualification
Intent, scoring, objection, CRM updates.

## Phase 6 — Human Handoff
Sales queues, tasks, summaries.

## Phase 7 — Tally
Connector, ledger mapping, invoice/outstanding/payment.

## Phase 8 — Automation
Payment follow-up, reminders, rules.

## Phase 9 — Intelligence
Campaign attribution, BI, Sheets, ROI.

## Phase 10 — Optimization
A/B testing, AI evaluation, better scoring, advanced automation.

---

# 49. MVP DEFINITION

The first usable MVP should contain:

```text
CRM
+
WhatsApp Inbox
+
Campaigns
+
AI Product Assistant
+
AI Qualification
+
Human Handoff
+
Basic Dashboard
```

Tally and advanced automation can follow without changing the core CRM model.

---

# 50. PRODUCTION ACCEPTANCE CHECKLIST

## CRM
- [ ] Leads
- [ ] Customers
- [ ] Deals
- [ ] Tasks
- [ ] Activities
- [ ] Customer 360
- [ ] RBAC
- [ ] Audit logs

## WhatsApp
- [ ] Cloud API
- [ ] Webhook
- [ ] Idempotency
- [ ] Inbox
- [ ] Campaign
- [ ] Queue
- [ ] Delivery/read tracking
- [ ] Opt-out

## AI
- [ ] OpenAI server-side
- [ ] Knowledge base
- [ ] Structured outputs
- [ ] Controlled tools
- [ ] Pricing guardrails
- [ ] Qualification
- [ ] Scoring
- [ ] Handoff
- [ ] Limits
- [ ] Cost monitoring
- [ ] Evaluation suite

## Tally
- [ ] Connector
- [ ] Mapping
- [ ] Invoice
- [ ] Outstanding
- [ ] Payment
- [ ] Retry
- [ ] Reconciliation

## Analytics
- [ ] Campaign funnel
- [ ] Objections
- [ ] Product interest
- [ ] Human handoff
- [ ] Conversion
- [ ] Revenue attribution
- [ ] AI quality

## Deployment
- [ ] Cloudflare Worker
- [ ] D1
- [ ] R2
- [ ] Queues
- [ ] Secrets
- [ ] Backups
- [ ] Monitoring
- [ ] Free-tier quota alerts

---

# 50A. WHATSAPP POLICY / TEMPLATE GOVERNANCE

The system must distinguish:

- Marketing messages
- Utility messages
- Customer-service replies
- AI replies
- Human replies

Template records must store:

```text
template_id
provider_template_id
name
language
category
status
variables_schema
campaign_eligible
last_synced_at
```

The application must never assume that any text can be sent as a free-form marketing message. WhatsApp/Meta eligibility and template rules must be validated through the current provider configuration.

## 50B. CONSENT / OPT-OUT

Store:

```text
marketing_opt_in
marketing_opt_in_source
marketing_opt_in_at
marketing_opt_out
marketing_opt_out_at
opt_out_reason
```

Campaign audience generation must exclude opted-out contacts.

## 50C. AI COST + BUSINESS COST SEPARATION

Track at least:

```text
whatsapp_message_cost
openai_cost
hosting_cost
storage_cost
campaign_cost
```

Dashboard:

```text
Campaign Cost
Qualified Lead Cost
Human Handoff Cost
AI Cost
Cost / Conversion
Revenue / Campaign
```

## 50D. DATA RETENTION

Raw WhatsApp conversations and media can grow faster than CRM master data.

Use configurable retention:

```text
Active CRM data       → long-term
Chat history          → configurable
AI run logs           → configurable
Webhook raw payloads  → short-term
Media                 → configurable/archive
Audit logs            → long-term
Campaign events       → long-term/aggregated
```

Before deleting raw data, preserve required aggregate/business events.

## 50E. DATA EXPORT / EXIT PLAN

Admin must be able to export core business data:

- Customers
- Leads
- Deals
- Activities
- Campaigns
- Campaign events
- Product master
- AI qualification results
- Tally mappings

This prevents lock-in.

## 50F. NO SINGLE POINT OF FAILURE

The platform must continue operating in degraded mode:

```text
OpenAI DOWN
→ Human WhatsApp inbox still works

Tally DOWN
→ CRM still works; sync waits

Google Sheets DOWN
→ CRM analytics still works

WhatsApp webhook DELAYED
→ raw event/job state remains retryable

AI LIMIT REACHED
→ human handoff
```

## 50G. 5,000-CONTACT CAMPAIGN CAPACITY TEST

Before first real 5,000-contact campaign:

- Test with 10 contacts
- Test with 100 contacts
- Test with 500 contacts
- Test with 1,000 contacts
- Only then enable 5,000

At each stage verify:

- API errors
- queue/job backlog
- duplicate sends
- webhook duplicates
- DB writes
- AI cost
- delivery events
- opt-outs
- retry behavior
- dashboard counts

# 51. FINAL PRODUCT DEFINITION

This is not simply a CRM.

It is a:

> **WhatsApp-first AI Sales Automation + CRM + TallyPrime Sales Intelligence Platform**

with the business loop:

```text
CAMPAIGN
   ↓
CUSTOMER RESPONSE
   ↓
AI CONVERSATION
   ↓
QUALIFICATION
   ↓
CRM
   ↓
SALESPERSON
   ↓
QUOTATION / DEAL
   ↓
TALLY
   ↓
PAYMENT
   ↓
FOLLOW-UP
   ↓
REPEAT SALES
```

The architecture must remain modular so each external dependency can be replaced without rebuilding the whole product.


# 52. FINAL REVIEW DECISIONS

This version intentionally makes the following decisions:

1. **Supabase is the first-choice backend for Lovable compatibility.**
2. **Cloudflare D1/Workers are not required for the MVP.**
3. **Database-backed jobs + Supabase Cron are the default background mechanism.**
4. **Supabase Queues/PGMQ is optional and should be introduced only when workload justifies it.**
5. **CRM database is the operational source of truth.**
6. **TallyPrime is the accounting source of truth.**
7. **Google Sheets is a reporting/export layer.**
8. **OpenAI is a controlled AI layer with tool access, not an unrestricted database agent.**
9. **AI pricing/discount/payment answers must come from verified business tools/data.**
10. **Human handoff is a first-class workflow.**
11. **Campaign analytics must be event-based, not inferred from chat text.**
12. **5,000-recipient testing must be staged before real production sending.**
13. **Free deployment is a target, not an unlimited-capacity guarantee.**
14. **All external services must be replaceable through integration boundaries.**
15. **GitHub version control and phase-by-phase development are mandatory for production work.**

# 53. IMPLEMENTATION HANDOFF INSTRUCTION

The developer should treat this document as the product/architecture contract.

Before coding:

```text
1. Review entire document.
2. List ambiguities.
3. Propose schema.
4. Propose RLS/permissions.
5. Propose integration boundaries.
6. Confirm free-tier constraints.
7. Build Phase 1 only.
```

Do not silently remove requirements.

If a requirement conflicts with a platform limitation:

```text
STOP
→ Explain limitation
→ Propose 2 alternatives
→ Get approval
→ Implement
```

The developer must never replace a business requirement with a simpler implementation without documenting the trade-off.

