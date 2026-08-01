<div align="center">

# 🛡️ HEIMDALL
### Institutional Market Surveillance & Regulatory Intelligence Platform

<p align="center">
  <img src="docs/assets/heimdall_hero_banner.png" alt="Heimdall Market Surveillance Platform Banner" width="100%" style="border-radius: 12px; border: 1px solid #1F2329; box-shadow: 0 20px 40px rgba(0,0,0,0.8);" />
</p>

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.2+-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_15-FDB515?style=for-the-badge&logo=postgresql&logoColor=black)](https://www.timescale.com)
[![Redis](https://img.shields.io/badge/Redis-Streams_7.x-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io)
[![TradingView](https://img.shields.io/badge/TradingView-Lightweight_Charts_v5-2962FF?style=for-the-badge&logo=tradingview&logoColor=white)](https://www.tradingview.com)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-v4.x-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-D4A63A?style=for-the-badge)](LICENSE)

<p align="center">
  <b>Sub-second anomaly detection</b> across high-frequency crypto and equity feeds, an institutional <b>forensic investigation workspace</b>, and automated <b>Market Abuse Regulation (MAR / MiFID II)</b> compliance audit trails.
</p>

---

### ⚡ Quick Navigation

[**Platform Overview**](#-platform-overview) •
[**Live Investigation Workspace**](#-investigation-workspace--charting) •
[**ML Anomaly Engine**](#-algorithmic-detection-matrix) •
[**Architecture**](#-architecture--data-pipeline) •
[**Quick Start**](#-quick-start) •
[**API Reference**](#-api-endpoints) •
[**Test Suites**](#-testing-suite)

---

</div>

## 🌐 Platform Overview

Heimdall is an institutional market surveillance platform designed for high-frequency trading desks, crypto exchanges, and compliance officers. It continuously ingests order-book and trade-level market feeds, evaluates statistical and heuristic pattern models in sub-milliseconds, and dispatches actionable alerts to a real-time investigation terminal.

### 💎 Key Highlights

- **⚡ Real-Time Streaming Ingestion**: Dual-worker pipeline consuming from **Binance WebSocket** (Crypto) and **Alpaca/Finnhub** (US Equities) via **Redis Streams 7.x**.
- **🧠 Hybrid AI Detection Engine**: Merges unsupervised **Isolation Forest** outlier scoring with supervised **Multi-Pattern Heuristics** (Pump & Dump, Spoofing, Wash Trading, Layering, Momentum Ignition).
- **🔬 Deep Investigation Workspace**: Interactive **TradingView Lightweight Charts v5** with synchronized volume histograms, alert markers, evidence pinning, and status progression.
- **⌨️ Global Command Palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>)**: Instant fuzzy search across active investigations, flagged anomalies, market tickers, and quick navigation routes.
- **📋 Regulatory Compliance & Audit Trails**: Tamper-evident, timestamped MAR audit logging tracking every status change, analyst note, and triage action.

---

## 🔍 Investigation Workspace & Charting

<p align="center">
  <img src="docs/assets/workspace_mockup.png" alt="Heimdall Forensic Investigation Workspace" width="100%" style="border-radius: 10px; border: 1px solid #232A31; box-shadow: 0 16px 32px rgba(0,0,0,0.6);" />
</p>

When an anomaly triggers or a case is escalated, analysts enter the **Forensic Investigation Workspace**:

- **Synchronized Candlestick & Volume Charts**: Powered by Lightweight Charts v5 with custom brand themes (`#0A0A0A` obsidian surface, `#4FBF7A` / `#E8604C` OHLC candles, and institutional gold `#D4A63A` anomaly markers).
- **Relational Evidence Dossier**: Direct inspection of correlated market ticks, multi-pattern score breakdowns, and historical volatility baselines.
- **Lifecycle State Machine**: Strict governance workflow (`OPEN` ➔ `IN_REVIEW` ➔ `ESCALATED` ➔ `RESOLVED` / `DISMISSED`).
- **Analyst Note Stream**: Timestamped, user-attributed investigation logs for multi-analyst handoffs.

---

## 🧠 Algorithmic Detection Matrix

<p align="center">
  <img src="docs/assets/detection_matrix.png" alt="Heimdall Anomaly Detection Matrix" width="100%" style="border-radius: 10px; border: 1px solid #232A31; box-shadow: 0 16px 32px rgba(0,0,0,0.6);" />
</p>

Heimdall runs a dual-layer detection pipeline evaluating incoming ticks against historical baselines:

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 HEIMDALL ANOMALY ENGINE                                     │
├───────────────────────────────┬─────────────────────────────────────────────────────────────┤
│ Pattern Detector              │ Detection Method & Signals                                  │
├───────────────────────────────┼─────────────────────────────────────────────────────────────┤
│ 🚀 Pump & Dump                │ Parabolic volume velocity + sharp price spike + sell runoff │
│ 👻 Spoofing                   │ Extreme bid/ask size asymmetry followed by rapid cancel     │
│ 🥞 Layering                   │ Multi-level non-bona fide orders shifting book depth        │
│ 🔄 Wash Trading               │ High volume with near-zero net price impact (circular flow) │
│ ⚡ Momentum Ignition          │ Aggressive aggressive market orders triggering stop losses  │
│ 🌲 Isolation Forest           │ Unsupervised feature-space outlier isolation                │
└───────────────────────────────┴─────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Architecture & Data Pipeline

```mermaid
flowchart TD
    subgraph S1["1. Market Ingestion Layer"]
        A1["📡 Binance WebSocket (Crypto)"] -->|Raw Trades| W1["crypto_worker.py"]
        A2["📈 Alpaca / Finnhub Stream (US)"] -->|Raw Trades| W2["us_worker.py"]
        W1 -->|"XADD market:ticks"| RS[("⚡ Redis Streams 7.x")]
        W2 -->|"XADD market:ticks"| RS
    end

    subgraph S2["2. Real-Time Detection & Storage"]
        RS -->|"XREADGROUP consumer"| ML["⚙️ ML Engine (run_engine.py)"]
        ML -->|"Feature Extraction"| IF["🌲 Isolation Forest"]
        ML -->|"Pattern Scoring"| MP["🎯 Multi-Pattern Heuristics"]
        ML -->|"Persist OHLCV & Detections"| TS[("🗄️ TimescaleDB / PostgreSQL 15")]
        ML -->|"Publish Anomaly Events"| RS
    end

    subgraph S3["3. Gateway & API Server"]
        TS <--> API["🚀 FastAPI Backend Server"]
        RS -->|"SSE Stream: /api/v1/alerts/stream"| API
        API <--> RC[("🔒 Redis Session Cache")]
    end

    subgraph S4["4. Analyst Terminal UI"]
        API -->|"REST + SSE Alert Feed"| UI["🖥️ Heimdall React 19 Frontend"]
        UI -->|"Ctrl+K Search Palette"| API
        UI -->|"Case Lifecycle & Notes"| API
        UI -->|"MAR Compliance Audit Export"| API
    end

    classDef darkBox fill:#12161A,stroke:#232A31,stroke-width:1.5px,color:#ECEFF1;
    classDef goldBox fill:#1F1B12,stroke:#D4A63A,stroke-width:2px,color:#FFD54F;
    classDef accentBox fill:#0D1F18,stroke:#4FBF7A,stroke-width:1.5px,color:#A5D6A7;
    class S1,S2,S3,S4 darkBox;
    class ML,API,UI goldBox;
    class RS,TS,RC accentBox;
```

---

## 🚀 Quick Start

### 1. Clone & Configure

```bash
git clone https://github.com/prathamkariya/market-surveillance.git
cd market-surveillance

# Create environment configuration
cp .env.example .env
```

### 2. Launch with Docker Compose

```bash
# Start TimescaleDB, Redis, API, Engine, and Ingestion Workers
docker-compose up --build -d
```

### 3. Run Migrations & Seed Demo Data

```bash
# Run database schema migrations
docker-compose exec api alembic upgrade head

# Seed initial accounts, watchlists, historical candles, and active investigations
docker-compose exec api python scripts/seed_demo_data.py
```

### 4. Launch Frontend Terminal

```bash
cd heimdall-frontend
npm install
npm run dev
```

Navigate to: **`http://localhost:5173`**

---

## 🔑 Pre-Seeded Demo Credentials

| Role | Username / Email | Password | Access Level |
| :--- | :--- | :--- | :--- |
| **Lead Analyst** | `analyst_1` (`analyst@heimdall.io`) | `Password123!` | Case investigations, anomaly triage, custom watchlists |
| **Administrator** | `admin` (`admin@heimdall.io`) | `AdminPassword123!` | System parameters, full MAR compliance audit logs, users |

---

## ⌨️ Command Palette & Keyboard Shortcuts

Press <kbd>Ctrl</kbd> + <kbd>K</kbd> (or <kbd>Cmd</kbd> + <kbd>K</kbd> on macOS) anywhere to open the **Command Palette**:

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Open / Close Universal Command Palette | Global |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate search results and case rows | Palette / Tables |
| <kbd>Enter</kbd> | Select item, open case, or execute action | Palette |
| <kbd>Esc</kbd> | Close modal / dismiss inspection drawer | Global |
| <kbd>Tab</kbd> | Switch between Investigation tabs | Workspace |

---

## 📡 API Endpoints

### 🔐 Authentication (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Register a new analyst/admin account
- `POST /api/v1/auth/login` — Exchange credentials for JWT access + refresh tokens
- `POST /api/v1/auth/refresh` — Rotate access token
- `POST /api/v1/auth/logout` — Invalidate refresh token session

### 📊 Market Data & Anomalies (`/api/v1`)
- `GET /api/v1/market-data` — Query OHLCV candle series with symbol & time filters
- `GET /api/v1/anomalies` — Query detected market anomalies with confidence scoring
- `GET /api/v1/alerts/stream` — **Server-Sent Events (SSE)** real-time alert feed

### 📁 Case Management (`/api/v1/cases`)
- `GET /api/v1/cases` — List active investigations with status, priority, and assignee filters
- `POST /api/v1/cases` — Escalate an anomaly into a full investigation dossier
- `GET /api/v1/cases/{id}` — Fetch detailed case record with linked anomalies & notes
- `PATCH /api/v1/cases/{id}` — Update case status (`OPEN`, `IN_REVIEW`, `ESCALATED`, `RESOLVED`, `CLOSED`)
- `POST /api/v1/cases/{id}/notes` — Append an analyst investigation note
- `GET /api/v1/cases/analysts` — List all assignable investigators

### 🔎 Search & Compliance Reports (`/api/v1`)
- `GET /api/v1/search?q={query}` — Unified fuzzy search across cases, tickers, and anomalies
- `GET /api/v1/reports/mar` — Generate Market Abuse Regulation (MAR) audit summaries

---

## 🧪 Testing Suite

### Frontend Tests (Vitest & Playwright)
```bash
cd heimdall-frontend
npm test                 # Run 10 unit & component tests (Vitest)
npm run build            # Verify TypeScript compilation and Vite bundle
npm run test:e2e         # Execute Playwright E2E browser automation
```

### Backend & ML Tests (Pytest)
```bash
cd backend
pytest -v                # Integration & API route tests
pytest ml/tests/ -v      # 300+ ML unit tests (Isolation Forest, ARIMA, LSTM, Calibration)
```

---

## 📂 Repository Structure

```
market-surveillance/
├── backend/                        # FastAPI Backend & Surveillance Services
│   ├── alembic/                    # Database migrations (001–005 + Case Management)
│   ├── app/
│   │   ├── core/                   # Security, JWT tokens, exceptions, database engine
│   │   ├── routers/                # REST endpoints (auth, anomalies, cases, search, reports)
│   │   ├── services/               # Core business & anomaly processing services
│   │   ├── models.py               # SQLAlchemy ORM models (TimescaleDB)
│   │   └── schemas.py              # Pydantic v2 schemas
│   ├── ml/                         # Standalone ML package (Isolation Forest, Weak Labeling, Forecasting)
│   ├── scripts/                    # Ingestion workers (crypto_worker, us_worker), engine loop, seed scripts
│   └── tests/                      # Pytest backend test suite
├── heimdall-frontend/              # React 19 + TypeScript Terminal UI
│   ├── src/
│   │   ├── brand/                  # Brand SVG components (Logo, Wordmark, LogoLockup)
│   │   ├── components/             # AnomalyDetail, CaseWorkspace, CommandPalette, LiveEventRow
│   │   ├── layout/                 # Sidebar Rail, Header, Navigation
│   │   ├── lib/                    # API client, SSE stream connection, formatters
│   │   ├── routes/                 # LiveFeed, Anomalies, Investigations, Watchlists, Audit
│   │   └── theme/                  # Design tokens, color palette, typography definitions
│   ├── package.json
│   └── vite.config.ts
├── docs/                           # Documentation & visual brand assets
│   └── assets/                     # Hero banners, workspace mockups, detection matrix
├── docker-compose.yml              # Local multi-service orchestration
├── docker-compose.prod.yml         # Production deployment configuration
├── nginx.conf                      # Reverse proxy & SSE streaming configuration
└── README.md
```

---

## 🛡️ Regulatory Compliance & Disclaimer

Heimdall is designed to support surveillance obligations under **EU Market Abuse Regulation (MAR - Regulation (EU) No 596/2014)**, **MiFID II**, and **SEC/FINRA Rule 6127**. All audit records, case notes, and anomaly signals are stored with cryptographic integrity for compliance record-keeping.

---

<div align="center">
  <sub>Built with precision for institutional market integrity. Distributed under the MIT License.</sub>
</div>
