import json
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import (
    Alert,
    AlertStatus,
    Anomaly,
    Case,
    CaseAnomaly,
    CaseEvent,
    CaseNote,
    CaseStatus,
    MarketData,
    User,
    Watchlist,
    WatchlistSymbol,
)
from app.services.auth_service import hash_password


def seed():
    db = SessionLocal()
    try:
        # 1. Admin user
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                email="admin@heimdall.io",
                username="admin",
                hashed_password=hash_password("Password123!"),
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.flush()
            print(f"Created admin user: {admin.username} (id={admin.id})")
        
        # 2. Analyst user
        analyst = db.query(User).filter(User.username == "analyst_1").first()
        if not analyst:
            analyst = User(
                email="analyst@heimdall.io",
                username="analyst_1",
                hashed_password=hash_password("Password123!"),
                role="analyst",
                is_active=True,
            )
            db.add(analyst)
            db.flush()
            print(f"Created analyst user: {analyst.username} (id={analyst.id})")

        # 3. Watchlists
        wl = db.query(Watchlist).filter(Watchlist.name == "High Risk Crypto Surveillance").first()
        if not wl:
            wl = Watchlist(
                user_id=analyst.id,
                name="High Risk Crypto Surveillance",
                description="Real-time monitoring for pump-and-dump and spoofing patterns across major DEX/CEX pairs.",
            )
            db.add(wl)
            db.flush()
            for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT"]:
                ws = WatchlistSymbol(watchlist_id=wl.id, symbol=sym)
                db.add(ws)
            print(f"Created watchlist: {wl.name}")

        admin_wl = db.query(Watchlist).filter(Watchlist.user_id == admin.id).first()
        if not admin_wl:
            admin_wl = Watchlist(
                user_id=admin.id,
                name="Global Risk Feed",
                description="Default surveillance watchlist for administrator.",
            )
            db.add(admin_wl)
            db.flush()
            for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "NVDA", "AAPL"]:
                ws = WatchlistSymbol(watchlist_id=admin_wl.id, symbol=sym)
                db.add(ws)
            print(f"Created admin watchlist: {admin_wl.name}")

        # 4. Market Data & Anomalies
        now = datetime.now(timezone.utc)
        symbols_data = [
            ("BTCUSDT", 68500.0, "CRYPTO", 0.94, '{"pump_and_dump": 0.95, "wash_trading": 0.12, "spoofing": 0.88}'),
            ("ETHUSDT", 3450.0, "CRYPTO", 0.89, '{"wash_trading": 0.91, "spoofing": 0.45}'),
            ("SOLUSDT", 185.0, "CRYPTO", 0.76, '{"layering": 0.82, "momentum_ignition": 0.74}'),
            ("NVDA", 128.5, "US_EQUITIES", 0.92, '{"spoofing": 0.94, "quote_stuffing": 0.87}'),
            ("AAPL", 224.0, "US_EQUITIES", 0.45, '{"normal": 0.95}'),
        ]

        created_anomalies = []
        import random
        for i, (sym, price, market, score, patterns) in enumerate(symbols_data):
            for t_offset in range(20, -1, -1):
                ts = now - timedelta(minutes=t_offset * 10)
                md = db.query(MarketData).filter(MarketData.symbol == sym, MarketData.timestamp == ts).first()
                if not md:
                    # Generate some random walk for price
                    current_price = price * (1 + random.uniform(-0.02, 0.02))
                    md = MarketData(
                        user_id=analyst.id,
                        symbol=sym,
                        timestamp=ts,
                        open=current_price * 0.99,
                        high=current_price * 1.01,
                        low=current_price * 0.98,
                        close=current_price,
                        volume=1500000.0 * random.uniform(0.8, 1.2),
                        market=market,
                    )
                    db.add(md)
                    db.flush()

                    # Only make the latest point (or random points) an anomaly
                    is_anom = (t_offset == 0) and (score >= 0.7)
                    if is_anom:
                        anomaly = Anomaly(
                            market_data_id=md.id,
                            anomaly_score=score,
                            is_anomaly=True,
                            isolation_forest_score=score * 0.9,
                            pattern_scores=patterns,
                        )
                        db.add(anomaly)
                        db.flush()
                        created_anomalies.append(anomaly)

                        alert = Alert(
                            user_id=analyst.id,
                            anomaly_id=anomaly.id,
                            status=AlertStatus.ACTIVE if score >= 0.9 else AlertStatus.PENDING,
                            message=f"Suspicious activity detected on {sym}: Anomaly score {score:.2f}",
                        )
                        db.add(alert)

        # 5. Cases
        case1 = db.query(Case).filter(Case.title == "Operation Ironclad: Coordinated BTC/NVDA Spoofing").first()
        if not case1:
            case1 = Case(
                title="Operation Ironclad: Coordinated BTC/NVDA Spoofing",
                status=CaseStatus.IN_REVIEW,
                assigned_to_user_id=analyst.id,
                created_by_user_id=admin.id,
            )
            db.add(case1)
            db.flush()

            note1 = CaseNote(
                case_id=case1.id,
                author_user_id=admin.id,
                body="Observed massive fake bid walls placed on order books and cancelled within 400ms prior to execution.",
            )
            note2 = CaseNote(
                case_id=case1.id,
                author_user_id=analyst.id,
                body="Correlated high order-to-trade ratio with offshore liquidity provider accounts.",
            )
            db.add_all([note1, note2])

            if created_anomalies:
                for anom in created_anomalies[:2]:
                    ca = CaseAnomaly(case_id=case1.id, anomaly_id=anom.id)
                    db.add(ca)

            event = CaseEvent(
                case_id=case1.id,
                event_type="STATUS_CHANGE",
                actor_user_id=admin.id,
                detail="Case moved to IN_REVIEW and assigned to analyst_1",
            )
            db.add(event)
            print("Created initial investigation case.")

        db.commit()

        # 6. Seed Redis live_alerts stream with recent anomalies so live feed is immediately populated
        try:
            from app.services.redis_service import STREAM_ALERTS, get_sync_redis
            r = get_sync_redis()
            for sym, price, market, score, patterns in symbols_data:
                if score >= 0.7:
                    sev = "CRITICAL" if score >= 0.9 else ("HIGH" if score >= 0.8 else "MEDIUM")
                    pat_dict = json.loads(patterns)
                    primary_sig = max(pat_dict.items(), key=lambda x: x[1])[0].upper().replace("_", " ") if pat_dict else "ANOMALY"
                    alert_payload = {
                        "event_id": f"SEED_{sym}_{int(now.timestamp()*1000)}",
                        "symbol": sym,
                        "timestamp_ms": int(now.timestamp() * 1000),
                        "price": price,
                        "volume": 250000.0,
                        "market": market,
                        "source": "SEED_GENERATOR",
                        "anomaly_score": score,
                        "severity": sev,
                        "primary_signal": primary_sig,
                        "low_confidence": False,
                        "sentiment_score": 0.0,
                        "isolation_forest_score": score * 0.9,
                        "multi_pattern_max_score": score,
                        "pattern_scores": pat_dict,
                        "features": {"volatility_20d": 0.08, "volume_ratio_20d": 3.4},
                        "model_version": "v1.0.0-seed",
                        "detector_agreement": 1.0,
                        "weak_label_confidence": score,
                    }
                    r.xadd(STREAM_ALERTS, {"data": json.dumps(alert_payload)}, maxlen=1000)
            print("Seeded Redis live_alerts stream.")
        except Exception as re_err:
            print(f"Warning: Could not seed Redis stream: {re_err}")

        print("Demo seed complete!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed()
