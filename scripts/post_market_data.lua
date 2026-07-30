wrk.method = "POST"
wrk.body = '{"symbol": "BTCUSDT", "price": 50000, "volume": 1.5, "timestamp": ' .. os.time() .. '}'
wrk.headers["Content-Type"] = "application/json"
