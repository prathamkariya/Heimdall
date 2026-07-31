wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"

<<<<<<< HEAD
local thread_counter = 0
function setup(thread)
  thread_counter = thread_counter + 1
  thread:set("id", thread_counter)
end

function init(args)
  math.randomseed(os.time() + id)
  req_counter = 0
end

request = function()
  req_counter = req_counter + 1
  local symbol = string.format("SYM%d%05d", id, req_counter)
=======
math.randomseed(os.time())
local thread_id = math.random(1000, 9999)
local counter = 0

request = function()
  counter = counter + 1
  local symbol = string.format("SYM%d%05d", thread_id, counter)
>>>>>>> 3699f0bdd6c6d9df8284c62ce2b5075d197652ae
  local body = string.format('{"symbol": "%s", "open": 50000, "high": 50500, "low": 49500, "close": 50200, "volume": 1.5, "timestamp": "2026-07-30T12:00:00Z"}', symbol)
  return wrk.format(nil, nil, nil, body)
end
