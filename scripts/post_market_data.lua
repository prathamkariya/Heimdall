wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"

math.randomseed(os.time())
local thread_id = math.random(1000, 9999)
local counter = 0

request = function()
  counter = counter + 1
  local symbol = string.format("SYM%d%05d", thread_id, counter)
  local body = string.format('{"symbol": "%s", "open": 50000, "high": 50500, "low": 49500, "close": 50200, "volume": 1.5, "timestamp": "2026-07-30T12:00:00Z"}', symbol)
  return wrk.format(nil, nil, nil, body)
end
