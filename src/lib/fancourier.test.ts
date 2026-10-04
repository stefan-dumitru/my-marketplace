import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFanCourierClient, clearFanCourierTokenCache, mapEventToStatus } from "@/lib/fancourier";
import { matchCounty, matchName, normalizeName } from "@/lib/fancourier-address";

function mockFetch(handlers: Record<string, () => Response>) {
  return vi.spyOn(global, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    for (const [key, make] of Object.entries(handlers)) if (url.includes(key)) return make();
    return new Response("unexpected " + url, { status: 500 });
  });
}

const login = () => Response.json({ status: "success", data: { token: "tok", expiresAt: "2099-01-01 00:00:00" } });

describe("mapEventToStatus", () => {
  it("maps FAN Courier event ids to coarse statuses", () => {
    expect(mapEventToStatus(undefined)).toBe("REGISTERED");
    expect(mapEventToStatus("H4")).toBe("IN_TRANSIT");
    expect(mapEventToStatus("C0")).toBe("IN_TRANSIT");
    expect(mapEventToStatus("C1")).toBe("OUT_FOR_DELIVERY");
    expect(mapEventToStatus("S1")).toBe("OUT_FOR_DELIVERY");
    expect(mapEventToStatus("S2")).toBe("DELIVERED");
    expect(mapEventToStatus("S12")).toBe("EXCEPTION");
    expect(mapEventToStatus("S43")).toBe("RETURNED");
  });
});

describe("address matching", () => {
  it("ignores diacritics, case and administrative prefixes", () => {
    expect(normalizeName("Județul Brașov")).toBe("brasov");
    expect(normalizeName("Municipiul Cluj-Napoca")).toBe("cluj napoca");
    expect(normalizeName("Sector 3")).toBe("");
  });
  it("maps buyer-typed names to FAN Courier's names", () => {
    expect(matchCounty(["Bucuresti", "Cluj"], "București")).toBe("Bucuresti");
    expect(matchCounty(["Bucuresti", "Cluj"], "Bucharest")).toBe("Bucuresti");
    expect(matchName(["Cluj-Napoca", "Aghiresu"], "Cluj")).toBe("Cluj-Napoca");
    expect(matchName(["Razoare(jud Cluj)"], "Răzoare")).toBe("Razoare(jud Cluj)");
    expect(matchName(["Cluj-Napoca", "Cluj-Sud"], "Cluj")).toBeNull();
    expect(matchCounty(["Cluj"], "Atlantis")).toBeNull();
  });
});

describe("FanCourierClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearFanCourierTokenCache();
  });

  it("rejects bad credentials in verifyCredentials", async () => {
    mockFetch({ "/login": () => Response.json({ status: "error" }, { status: 401 }) });
    expect(await createFanCourierClient("u", "bad", "1").verifyCredentials()).toBe(false);
  });

  it("accepts the older login response shape { token }", async () => {
    mockFetch({
      "/login": () => Response.json({ token: "420|abc" }),
      "/reports/services": () => Response.json({ status: "success", data: [] }),
    });
    expect(await createFanCourierClient("u", "p", "1").verifyCredentials()).toBe(true);
  });

  it("logs in once and reuses the token", async () => {
    const spy = mockFetch({
      "/login": login,
      "/reports/services": () => Response.json({ status: "success", data: [] }),
    });
    const client = createFanCourierClient("u", "p", "1");
    expect(await client.verifyCredentials()).toBe(true);
    expect(await client.verifyCredentials()).toBe(true);
    expect(spy.mock.calls.filter(([u]) => String(u).includes("/login"))).toHaveLength(1);
  });

  it("re-logs in once when a request returns 401", async () => {
    let first = true;
    const spy = mockFetch({
      "/login": login,
      "/reports/services": () => {
        if (first) {
          first = false;
          return new Response("expired", { status: 401 });
        }
        return Response.json({ status: "success", data: [] });
      },
    });
    expect(await createFanCourierClient("u", "p", "1").verifyCredentials()).toBe(true);
    expect(spy.mock.calls.filter(([u]) => String(u).includes("/login"))).toHaveLength(2);
  });

  it("throws with the API's errors when shipment creation is rejected", async () => {
    mockFetch({
      "/login": login,
      "/reports/counties": () => Response.json({ status: "success", data: [{ name: "Cluj" }] }),
      "/reports/localities": () => Response.json({ status: "success", data: [{ name: "Cluj-Napoca" }] }),
      "/intern-awb": () => Response.json({ response: [{ awbNumber: null, errors: { county: "invalid" } }] }),
    });
    await expect(
      createFanCourierClient("u", "p", "1").generateShipment({
        recipient: { name: "A", phone: "0700000000", county: "Cluj", city: "Cluj", address: "Z 1" },
        pieces: 1,
        weight: 1,
      })
    ).rejects.toThrow(/county/);
  });

  it("derives status from the latest tracking event regardless of order", async () => {
    mockFetch({
      "/login": login,
      "/reports/awb/tracking": () =>
        Response.json({
          status: "success",
          data: [
            {
              awbNumber: "123",
              events: [
                { id: "S2", name: " Delivered ", location: "B", date: "2026-10-03 12:00:00" },
                { id: "H4", name: " Sorted ", location: "B", date: "2026-10-02 08:00:00" },
              ],
            },
          ],
        }),
    });
    const t = await createFanCourierClient("u", "p", "1").getTracking("123");
    expect(t.status).toBe("DELIVERED");
    expect(t.events[0].status).toBe("H4");
  });
});

describe("resolveAddress", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearFanCourierTokenCache();
  });

  it("explains which part of the address is unknown", async () => {
    mockFetch({
      "/login": login,
      "/reports/counties": () => Response.json({ status: "success", data: [{ name: "Cluj" }] }),
      "/reports/localities": () => Response.json({ status: "success", data: [{ name: "Cluj-Napoca" }] }),
    });
    const client = createFanCourierClient("u", "p", "1");
    await expect(client.resolveAddress("Atlantis", "x")).rejects.toThrow(/County "Atlantis"/);
    await expect(client.resolveAddress("Cluj", "Nowhere")).rejects.toThrow(/City "Nowhere".*Cluj/);
    expect(await client.resolveAddress("Județul Cluj", "Cluj")).toEqual({ county: "Cluj", locality: "Cluj-Napoca" });
  });
});
