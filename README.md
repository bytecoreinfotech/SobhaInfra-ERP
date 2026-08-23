# SobhaInfra ERP

Enterprise Infra & Real Estate WhatsApp Automation, AI CRM, Field Operations, and TallyPrime Accounting Suite.

---

## 🏗️ Overview

SobhaInfra ERP is a modern enterprise management platform combining:
- **WhatsApp Cloud API Integration**: Real-time two-way messaging, campaigns, template sync, interactive quick replies, and human agent handoff.
- **AI Sales Assistant & Auto-Reply**: OpenAI GPT-4o powered conversational agent with business guardrails and auto-qualifying leads.
- **Lead & CRM Management**: Kanban pipeline, customer 360 profile, multi-channel lead capture (Facebook Lead Ads, Webhook, CSV).
- **Field Operations & GPS Tracking**: Live agent check-ins, geo-tagged photo proof, route logs, and client visit logs.
- **Payment & Accounts Follow-up**: Automated payment reminders, ledger statements, UPI QR code generation, and invoice tracking.
- **TallyPrime Bi-directional Sync**: Local connector bridge for automated sync of ledgers, vouchers, outstanding balances, and inventory items.
- **Multi-Tenant & Role-Based Access (RBAC)**: Super Admin, Manager, Sales Executive, Field Agent, and Accounts roles with custom permissions.

---

## 🚀 Tech Stack

- **Frontend**: React 19, Vite, React Router v7, Lucide Icons, Leaflet (Maps)
- **Backend / Serverless**: Netlify Serverless Functions (Node.js)
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS) and Realtime WebSockets
- **Accounting Engine**: TallyPrime XML Server Bridge (Python / Node.js)
- **AI Engine**: OpenAI GPT-4o API
- **Messaging**: Meta WhatsApp Cloud API (v20.0+)

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Copy `.env.example` to `.env` and fill in the required API keys and credentials:
```bash
cp .env.example .env
```

### 3. Run Development Server
```bash
npm run dev
```

### 4. Build for Production
```bash
npm run build
```

---

## 📂 Project Structure

```
├── netlify/functions/     # Serverless backend functions (webhooks, sync, AI engine)
├── public/                # Static assets, icons, manifest
├── scripts/               # TallyPrime local connector bridge scripts
├── src/
│   ├── components/        # Reusable UI components (Sidebar, Modals, Header, Maps)
│   ├── context/           # React Contexts (Auth, Theme, Company, LiveCounts)
│   ├── lib/               # Database client, Supabase integration, API handlers
│   ├── pages/             # Application views (CRM, WhatsApp, Tasks, Finance, etc.)
│   └── main.jsx           # Application entry point
├── supabase/
│   ├── migrations/        # SQL migration files for Supabase
│   └── seed/              # Initial seed data for test tenants and users
└── tally-sync.py          # Standalone Python daemon for TallyPrime synchronization
```

---

## 🛡️ License

Proprietary — Bytecore Infotech / SobhaInfra ERP. All Rights Reserved.
