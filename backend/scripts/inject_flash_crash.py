import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.schemas.streaming import Market, UnifiedTradeEvent
from app.services.redis_service import publish_trade_sync


def inject_flash_crash(symbol="DOGEUSDT"):
    print(f"Injecting massive flash crash for {symbol}...")
    
    # Send a sequence of trades to simulate a pump and dump / flash crash
    base_price = 0.1500
    base_vol = 1000.0
    
    events = []
    
    # 1. Normal trading (25 ticks)
    for i in range(25):
        events.append((base_price, base_vol))
        
    # 2. Sudden massive pump (5 ticks)
    for i in range(5):
        events.append((base_price * (1.1 + (i*0.1)), base_vol * 50))
        
    # 3. Sudden dump (5 ticks)
    for i in range(5):
        events.append((base_price * 0.8, base_vol * 100))
        
    for i, (price, vol) in enumerate(events):
        ts = int(time.time() * 1000)
        event = UnifiedTradeEvent(
            event_id=f"INJECT_{symbol}_{ts}_{i}",
            timestamp_ms=ts,
            symbol=symbol,
            price=price,
            volume=vol,
            notional_value=price * vol,
            market=Market.CRYPTO,
            source="BINANCE"
        )
        print(f"Publishing: {price:.4f} | Vol: {vol:.1f}")
        publish_trade_sync(event)
        time.sleep(0.1)  # small delay so timestamps are distinct
        
    print("Done! Check your Live Feed.")

if __name__ == "__main__":
    inject_flash_crash()
