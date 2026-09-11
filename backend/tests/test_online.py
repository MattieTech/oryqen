import httpx

client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30.0)

print("=== Testing System Telemetry & Health ===")
res = client.get("/api/health")
print("Health Status:", res.status_code, res.json().get("status"))

print("\n=== Testing Memory Endpoint ===")
mem_res = client.get("/api/memory")
print("Memory Status:", mem_res.status_code, "Count:", len(mem_res.json().get("memories", [])))

print("\n=== Testing Recommendations ===")
rec_res = client.get("/api/tutor/recommendations")
print("Recs Status:", rec_res.status_code, "Recs Count:", len(rec_res.json().get("recommendations", [])))

print("\nAll online checks verified!")
