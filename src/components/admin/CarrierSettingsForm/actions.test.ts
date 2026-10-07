import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearFanCourierTokenCache } from "@/lib/fancourier";
import { getCarrierConfig } from "@/server/data/carrier-config";
import { updateCarrierSettingsAction } from "@/components/admin/CarrierSettingsForm/actions";
import { createAdmin, createBuyer, sessionFor } from "@test/helpers";

// redirect() throws in real Next; the stub does the same so a guarded action stops at the guard.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = auth as unknown as Mock;

const input = {
  carrier: "fancourier" as const,
  environment: "test" as const,
  apiUsername: "my-user",
  clientId: "7032158",
  apiPassword: "my-password",
};

function mockFanCourier(loginOk = true) {
  return vi.spyOn(global, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes("/login")) {
      return loginOk
        ? Response.json({ status: "success", data: { token: "tok", expiresAt: "2099-01-01 00:00:00" } })
        : Response.json({ status: "error" }, { status: 401 });
    }
    if (u.includes("/reports/services")) return Response.json({ status: "success", data: [] });
    return new Response("unexpected " + u, { status: 500 });
  });
}

describe("updateCarrierSettingsAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearFanCourierTokenCache();
  });
  afterEach(() => vi.restoreAllMocks());

  it("sends anonymous visitors to the login page and saves nothing", async () => {
    authMock.mockResolvedValue(null);
    await expect(updateCarrierSettingsAction(input)).rejects.toThrow(/NEXT_REDIRECT:\/auth\/login/);
    expect(await prisma.carrierConfig.count()).toBe(0);
  });

  it("refuses non-admins", async () => {
    const buyer = await createBuyer();
    authMock.mockResolvedValue(sessionFor({ id: buyer.id, role: "buyer" }));
    await expect(updateCarrierSettingsAction(input)).rejects.toThrow(/NEXT_REDIRECT/);
    expect(await prisma.carrierConfig.count()).toBe(0);
  });

  it("rejects a non-numeric client id before calling FAN Courier", async () => {
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));
    const fetchSpy = mockFanCourier();

    const result = await updateCarrierSettingsAction({ ...input, clientId: "abc" });

    expect(result).toEqual({ ok: false, error: "Invalid input." });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires a password the first time", async () => {
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));
    mockFanCourier();

    const result = await updateCarrierSettingsAction({ ...input, apiPassword: "" });

    expect(result).toEqual({ ok: false, error: "API password is required." });
    expect(await prisma.carrierConfig.count()).toBe(0);
  });

  it("saves nothing when FAN Courier rejects the login", async () => {
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));
    mockFanCourier(false);

    const result = await updateCarrierSettingsAction(input);

    expect(result.ok).toBe(false);
    expect(await prisma.carrierConfig.count()).toBe(0);
  });

  it("verifies, saves encrypted, and refreshes the page on success", async () => {
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));
    mockFanCourier();

    const result = await updateCarrierSettingsAction(input);

    expect(result).toEqual({ ok: true });
    const raw = await prisma.carrierConfig.findFirstOrThrow();
    expect(raw.apiPassword).not.toContain("my-password");
    expect(raw.lastVerifiedAt).not.toBeNull();
    expect(await getCarrierConfig("fancourier", "test")).toMatchObject({
      apiUsername: "my-user",
      apiPassword: "my-password",
      clientId: "7032158",
    });
    const { revalidatePath } = await import("next/cache");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/carrier-settings");
  });

  it("keeps the stored password when the field is left blank on a later save", async () => {
    const admin = await createAdmin();
    authMock.mockResolvedValue(sessionFor({ id: admin.id, role: "admin" }));
    mockFanCourier();
    await updateCarrierSettingsAction(input);

    clearFanCourierTokenCache();
    const fetchSpy = mockFanCourier();
    const result = await updateCarrierSettingsAction({ ...input, apiUsername: "renamed-user", apiPassword: "" });

    expect(result).toEqual({ ok: true });
    const loginCalls = fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes("/login"));
    expect(loginCalls.some((u) => u.includes("username=renamed-user") && u.includes("password=my-password"))).toBe(true);
    expect(await getCarrierConfig("fancourier", "test")).toMatchObject({
      apiUsername: "renamed-user",
      apiPassword: "my-password",
    });
  });
});
