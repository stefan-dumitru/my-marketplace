import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getActiveCarrierConfig,
  getAllCarrierConfigs,
  getCarrierConfig,
  upsertCarrierConfig,
} from "@/server/data/carrier-config";

describe("carrier config storage", () => {
  const originalEnv = process.env.CARRIER_ENVIRONMENT;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CARRIER_ENVIRONMENT;
    else process.env.CARRIER_ENVIRONMENT = originalEnv;
  });

  it("stores username and password encrypted but returns them decrypted", async () => {
    await upsertCarrierConfig("fancourier", "test", "my-username", "my-password", "7032158");

    const raw = await prisma.carrierConfig.findFirstOrThrow();
    expect(raw.apiUsername.startsWith("enc:v1:")).toBe(true);
    expect(raw.apiPassword.startsWith("enc:v1:")).toBe(true);
    expect(raw.apiUsername).not.toContain("my-username");
    expect(raw.apiPassword).not.toContain("my-password");
    expect(raw.clientId).toBe("7032158");

    const config = await getCarrierConfig("fancourier", "test");
    expect(config).toMatchObject({ apiUsername: "my-username", apiPassword: "my-password", clientId: "7032158" });
  });

  it("updates in place instead of creating a duplicate for the same environment", async () => {
    await upsertCarrierConfig("fancourier", "test", "u1", "p1", "1");
    await upsertCarrierConfig("fancourier", "test", "u2", "p2", "2");

    expect(await prisma.carrierConfig.count()).toBe(1);
    expect(await getCarrierConfig("fancourier", "test")).toMatchObject({ apiUsername: "u2", apiPassword: "p2", clientId: "2" });
  });

  it("keeps test and production credentials separate", async () => {
    await upsertCarrierConfig("fancourier", "test", "test-user", "test-pw", "1");
    await upsertCarrierConfig("fancourier", "production", "prod-user", "prod-pw", "2");

    expect((await getCarrierConfig("fancourier", "test"))?.apiUsername).toBe("test-user");
    expect((await getCarrierConfig("fancourier", "production"))?.apiUsername).toBe("prod-user");
  });

  it("never exposes the password in the admin listing", async () => {
    await upsertCarrierConfig("fancourier", "test", "my-username", "my-password", "7032158");

    const [row] = await getAllCarrierConfigs();

    expect(row.apiUsername).toBe("my-username");
    expect(JSON.stringify(row)).not.toContain("my-password");
    expect("apiPassword" in row).toBe(false);
  });

  it("selects the credential set from CARRIER_ENVIRONMENT, defaulting to test", async () => {
    await upsertCarrierConfig("fancourier", "test", "test-user", "p", "1");
    await upsertCarrierConfig("fancourier", "production", "prod-user", "p", "2");

    delete process.env.CARRIER_ENVIRONMENT;
    expect((await getActiveCarrierConfig())?.apiUsername).toBe("test-user");
    process.env.CARRIER_ENVIRONMENT = "something-else";
    expect((await getActiveCarrierConfig())?.apiUsername).toBe("test-user");
    process.env.CARRIER_ENVIRONMENT = "production";
    expect((await getActiveCarrierConfig())?.apiUsername).toBe("prod-user");
  });

  it("returns null when nothing is configured", async () => {
    expect(await getCarrierConfig("fancourier", "test")).toBeNull();
    expect(await getAllCarrierConfigs()).toEqual([]);
  });
});
