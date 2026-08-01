# Heimdall — Backend Architecture & ML Evolution Roadmap

## Purpose & Architectural Framing

> [!IMPORTANT]
> **Status: Future Considerations & Architectural Proposals**  
> This roadmap documents technical design paths and architectural considerations for scaling Heimdall beyond its current monolithic and single-node surveillance pipeline.  
> These items represent deliberate, prospective engineering considerations—**not claims of current system capabilities**. All architectural transitions should be evaluated against empirical throughput and latency bottlenecks.

---

## 1. High-Throughput Stream Ingestion (Kafka / Redpanda)

### Current Architecture vs. Scale Bottleneck
- **Current State:** Direct REST polling and single-producer ingestion pipelines persisting directly into the relational database.
- **Bottleneck:** High-frequency tick data (>10,000 events/sec across multiple asset classes) introduces write contention, database lock escalation, and coupled ingestion-to-detection pipelines.

### Proposed Evolution: Distributed Event Log
1. **Partitioning Strategy:**
   - Partition topics by `market` and `symbol` (e.g., `market-events.crypto.btcusdt`, `market-events.equities.aapl`) to guarantee strict per-symbol chronological order.
2. **Backpressure & Decoupling:**
   - Decouple raw market data producers (Binance, Alpaca, IEX) from surveillance consumers.
   - Buffer burst volumes during extreme market volatility without dropping ticks or delaying REST API client requests.
3. **Consumer Groups & Parallelism:**
   - Dedicated consumer groups for real-time anomaly detection, tick aggregation/candle building, and cold-storage archiving.
   - Exactly-once semantics (EOS) via idempotent consumer commits and transactional outbox patterns.

---

## 2. Distributed Task Orchestration (Celery / RabbitMQ / Redis)

### Current Architecture vs. Scale Bottleneck
- **Current State:** Synchronous and lightweight FastAPI background task execution within the main web server process.
- **Bottleneck:** CPU-heavy tasks (e.g., historical replay, batch model scoring across 90-day intervals, MAR report PDF generation) compete with HTTP request handling and WebSocket broadcasting.

### Proposed Evolution: Asynchronous Worker Fleet
1. **Separation of Concerns:**
   - Offload heavy compute workloads to decoupled worker pools managed via Celery and RabbitMQ/Redis.
2. **Specialized Worker Queues:**
   - `queue.realtime`: Low-latency lightweight pattern verification (<50ms SLA).
   - `queue.batch`: Bulk historical anomaly scanning and multi-day correlation analysis.
   - `queue.reports`: Regulatory export formatting, MAR document rendering, and signed audit bundle generation.
   - `queue.retraining`: Periodic offline ML model fitting and evaluation flywheel tasks.
3. **Dead Letter Queues (DLQ) & Circuit Breaking:**
   - Automatic exponential backoff, failure telemetry, and isolation of poisoned payloads.

---

## 3. Advanced Surveillance ML: Graph Neural Networks (GNNs) & Temporal Models

### Current Architecture vs. Detection Horizon
- **Current State:** Isolation Forest multivariate baseline paired with rule-based heuristics (pump-and-dump volume surge, wash trading price/volume symmetry, spoofing orderbook imbalance).
- **Detection Horizon:** Coordinated multi-entity market manipulation—such as distributed wash trading networks, syndicate pump-and-dumps across synthetic sub-accounts, and layer-spoofing across correlated instruments.

### Proposed ML Evolution:
1. **Cross-Entity Graph Representation (GNNs):**
   - Model the market as a heterogeneous dynamic graph:
     - **Nodes:** Accounts, Wallets/Brokers, Orders, Instruments.
     - **Edges:** Fund Transfers, Order Placements, Matched Executions, Counterparty Trades.
   - Employ Temporal Graph Networks (TGN) or Relational Graph Convolutional Networks (R-GCN) to detect cyclic order flow (wash trading rings) and coordinated spoofing clusters that evade isolated time-series detectors.
2. **Deep Temporal Sequence Models:**
   - Transformer-based sequence encoders (e.g., Temporal Fusion Transformers) for tick-level orderbook dynamics to capture microstructural anomalies prior to major price dislocations.
3. **Continuous Evaluation & Shadow Scoring:**
   - Shadow-mode deployment allowing new model versions to score live streams in parallel with production models to measure false-positive rates (FPR) before traffic cutover.

---

## 4. Tiered Storage & Analytical Data Lake (Parquet + OLAP Engine)

### Current Architecture vs. Analytical Scale
- **Current State:** Relational tables (PostgreSQL/SQLite) storing raw market data, anomalies, cases, and audit logs.
- **Bottleneck:** Relational databases degrade when running multi-month analytical queries across billions of tick rows alongside real-time OLTP workloads.

### Proposed Evolution: Cold Storage & OLAP Architecture
1. **Tiered Storage Lifecycle:**
   - **Hot Tier (0–7 Days):** PostgreSQL / TimescaleDB optimized for low-latency point queries, recent anomaly inspection, and active case management.
   - **Warm Tier (8–90 Days):** Columnar OLAP engine (e.g., ClickHouse or DuckDB) for rapid historical queries, backtesting, and cohort analysis.
   - **Cold Tier (90+ Days):** Partitioned Parquet archives in object storage (AWS S3 / Google Cloud Storage) partitioned by `year/month/day/market/symbol` with zstandard compression.
2. **Analytical Query Engine:**
   - DuckDB/ClickHouse interface for fast investigative querying across multi-year historical logs without impacting live surveillance throughput.
3. **Regulatory Audit Retention:**
   - Immutable write-once-read-many (WORM) storage policies compliant with regulatory mandates (SEC Rule 17a-4 / MiFID II recordkeeping).

---

## 5. High Availability, Security & Deployment Topology

### Production Infrastructure Topology
1. **Container Orchestration (Kubernetes / GKE):**
   - Horizontal Pod Autoscalers (HPA) driven by Kafka lag and queue depth metrics.
   - Separate deployments for Ingestion, API Gateway, Real-time Detection, and Async Workers.
2. **Database Connection Pooling & Read Replicas:**
   - PgBouncer connection pooling to handle high-concurrency client connections.
   - Dedicated read-replicas for analyst workstation dashboards, search indexing, and export operations.
3. **Zero-Trust Security & Observability:**
   - Mutual TLS (mTLS) across internal microservice communication.
   - Structured JSON logging with trace context (OpenTelemetry/W3C standard) propagating from market ingestion to case creation for full end-to-end provenance.
