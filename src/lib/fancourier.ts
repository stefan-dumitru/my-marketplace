/**
 * FAN Courier API v2.0 client (https://api.fancourier.ro). Authenticates with a bearer token from
 * POST /login (valid 24h, cached in memory and refreshed on 401). There is no separate sandbox
 * host: "test" vs "production" only means which set of credentials is used.
 */

import { logger } from "@/lib/logger";

export type FanCourierEnvironment = "test" | "production";

const BASE_URL = "https://api.fancourier.ro";
// The token is valid for 24h; refresh well inside that window rather than parsing `expiresAt`
// (the API doesn't state its timezone). A 401 also forces a refresh.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const tokenCache = new Map<string, { token: string; fetchedAt: number }>();

export function clearFanCourierTokenCache() {
  tokenCache.clear();
}

export interface FanCourierShipmentRequest {
  recipient: {
    name: string;
    phone: string;
    email?: string;
    county: string;
    city: string;
    address: string; // street + number (single line)
    postalCode?: string;
  };
  pieces: number;
  weight: number; // kg
  content?: string;
  instructions?: string;
  dimensions?: { length: number; width: number; height: number }; // cm
}

export interface FanCourierShipmentResponse {
  awbNumber: string;
  status: string;
}

export type FanCourierTrackingStatus =
  | "REGISTERED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION"
  | "RETURNED";

export interface FanCourierTrackingResponse {
  awbNumber: string;
  status: FanCourierTrackingStatus;
  lastUpdate: Date;
  events: Array<{ timestamp: Date; status: string; description: string }>;
}

export class FanCourierAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = "FanCourierAPIError";
  }
}

const DELIVERED_EVENTS = new Set(["S2"]);
const OUT_FOR_DELIVERY_EVENTS = new Set(["C1", "S1", "S8", "S35", "S46"]);
const RETURNED_EVENTS = new Set(["S16", "S33", "S43"]);

/** Maps FAN Courier's latest event id (see GET /reports/awb-events) to our coarse status. */
export function mapEventToStatus(eventId: string | undefined): FanCourierTrackingStatus {
  if (!eventId) return "REGISTERED";
  if (DELIVERED_EVENTS.has(eventId)) return "DELIVERED";
  if (RETURNED_EVENTS.has(eventId)) return "RETURNED";
  if (OUT_FOR_DELIVERY_EVENTS.has(eventId)) return "OUT_FOR_DELIVERY";
  if (eventId.startsWith("S")) return "EXCEPTION";
  return "IN_TRANSIT";
}

class FanCourierClient {
  constructor(
    private username: string,
    private password: string,
    private clientId: string
  ) {}

  private async login(): Promise<string> {
    const cacheKey = this.username;
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < TOKEN_TTL_MS) return cached.token;

    const qs = new URLSearchParams({ username: this.username, password: this.password });
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/login?${qs}`, { method: "POST", headers: { Accept: "application/json" } });
    } catch (err) {
      logger.error({ err }, "FanCourier login request failed");
      throw new FanCourierAPIError("Could not reach FAN Courier.");
    }
    // Older API docs show `{ token }`, newer ones `{ status: "success", data: { token } }`.
    const json = (await res.json().catch(() => null)) as {
      status?: string;
      token?: string;
      data?: { token?: string };
    } | null;
    const token = json?.data?.token ?? json?.token;
    if (!res.ok || !token || (json?.status && json.status !== "success")) {
      logger.warn({ status: res.status }, "FanCourier login rejected");
      throw new FanCourierAPIError("FAN Courier login failed. Check the username and password.", res.status);
    }
    tokenCache.set(cacheKey, { token, fetchedAt: Date.now() });
    return token;
  }

  private async request(method: string, path: string, init?: { query?: URLSearchParams; body?: unknown }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.login();
      const qs = init?.query ? `?${init.query}` : "";
      let res: Response;
      try {
        res = await fetch(`${BASE_URL}${path}${qs}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            ...(init?.body ? { "Content-Type": "application/json" } : {}),
          },
          body: init?.body ? JSON.stringify(init.body) : undefined,
        });
      } catch (err) {
        logger.error({ err, path }, "FanCourier request failed");
        throw new FanCourierAPIError("Could not reach FAN Courier.");
      }
      if (res.status === 401 && attempt === 0) {
        tokenCache.delete(this.username);
        continue;
      }
      return res;
    }
    throw new FanCourierAPIError("FAN Courier authentication failed.", 401);
  }

  private async failure(res: Response, what: string): Promise<never> {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, body: text.slice(0, 500), what }, "FanCourier API error");
    let detail = "";
    try {
      const j = JSON.parse(text) as { message?: string; errors?: unknown };
      detail = j.message ?? (j.errors ? JSON.stringify(j.errors) : "");
    } catch {
      /* non-JSON body */
    }
    throw new FanCourierAPIError(`${what} failed${detail ? `: ${detail.slice(0, 300)}` : ""}`, res.status);
  }

  async generateShipment(req: FanCourierShipmentRequest): Promise<FanCourierShipmentResponse> {
    const dims = req.dimensions ?? { length: 30, width: 20, height: 10 };
    const res = await this.request("POST", "/intern-awb", {
      body: {
        clientId: Number(this.clientId),
        shipments: [
          {
            info: {
              service: "Standard",
              packages: { parcel: req.pieces, envelope: 0 },
              weight: req.weight,
              payment: "sender",
              observation: req.instructions ?? "",
              content: req.content ?? "",
              dimensions: dims,
            },
            recipient: {
              name: req.recipient.name,
              phone: req.recipient.phone,
              ...(req.recipient.email ? { email: req.recipient.email } : {}),
              address: {
                county: req.recipient.county,
                locality: req.recipient.city,
                street: req.recipient.address,
                ...(req.recipient.postalCode ? { zipCode: req.recipient.postalCode } : {}),
              },
            },
          },
        ],
      },
    });
    if (!res.ok) await this.failure(res, "Shipment creation");

    const json = (await res.json()) as {
      response?: Array<{ awbNumber?: number | string; errors?: unknown }>;
    };
    const item = json.response?.[0];
    if (!item || item.errors || item.awbNumber == null) {
      logger.error({ errors: item?.errors }, "FanCourier shipment rejected");
      throw new FanCourierAPIError(
        `Shipment creation failed${item?.errors ? `: ${JSON.stringify(item.errors).slice(0, 300)}` : ""}`
      );
    }
    return { awbNumber: String(item.awbNumber), status: "REGISTERED" };
  }

  /** Returns the label as PDF bytes. */
  async getLabelPdf(awbNumber: string): Promise<ArrayBuffer> {
    const query = new URLSearchParams({ clientId: this.clientId, pdf: "1", language: "en", format: "A6" });
    query.append("awbs[]", awbNumber);
    const res = await this.request("GET", "/awb/label", { query });
    if (!res.ok) await this.failure(res, "Label download");
    return res.arrayBuffer();
  }

  async getTracking(awbNumber: string): Promise<FanCourierTrackingResponse> {
    const query = new URLSearchParams({ clientId: this.clientId, language: "en" });
    query.append("awb[]", awbNumber);
    const res = await this.request("GET", "/reports/awb/tracking", { query });
    if (!res.ok) await this.failure(res, "Tracking lookup");

    const json = (await res.json()) as {
      data?: Array<{
        awbNumber?: string;
        events?: Array<{ id: string; name: string; date: string }>;
      }>;
    };
    const entry = json.data?.[0];
    if (!entry) throw new FanCourierAPIError("Tracking lookup failed: AWB not found.");

    const events = (entry.events ?? [])
      .map((e) => ({ id: e.id, timestamp: new Date(e.date.replace(" ", "T")), description: e.name.trim() }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const last = events[events.length - 1];

    return {
      awbNumber: entry.awbNumber ?? awbNumber,
      status: mapEventToStatus(last?.id),
      lastUpdate: last?.timestamp ?? new Date(),
      events: events.map((e) => ({ timestamp: e.timestamp, status: e.id, description: e.description })),
    };
  }

  /** Logs in and checks the client id is usable by listing services. */
  async verifyCredentials(): Promise<boolean> {
    try {
      const res = await this.request("GET", "/reports/services");
      return res.ok;
    } catch {
      return false;
    }
  }
}

export function createFanCourierClient(username: string, password: string, clientId: string): FanCourierClient {
  return new FanCourierClient(username, password, clientId);
}
