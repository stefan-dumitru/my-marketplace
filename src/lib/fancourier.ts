/**
 * FanCourier API client wrapper. Handles authentication, request/response formatting, and error
 * handling. Supports both test (sandbox) and production modes.
 *
 * API docs: https://www.fancourier.ro/api (credentials required).
 * Authentication: HTTP Basic Auth with username/password from CarrierConfig.
 */

import { logger } from "@/lib/logger";

export type FanCourierEnvironment = "test" | "production";

const BASE_URLS: Record<FanCourierEnvironment, string> = {
  test: "https://dev.fancourier.ro/api/v1",
  production: "https://api.fancourier.ro/v1",
};

export interface FanCourierShipmentRequest {
  awbNumber?: string; // Pre-assigned AWB (optional)
  recipient: {
    name: string;
    phone: string;
    email?: string;
    city: string;
    postalCode: string;
    address: string;
    county: string; // Romanian county
  };
  pieces: number;
  weight: number; // kg
  instructions?: string;
  cod?: number; // Cash on delivery amount (RON), if applicable
  isDeclared?: boolean;
}

export interface FanCourierShipmentResponse {
  awbNumber: string; // The real FanCourier tracking number
  labelUrl: string; // URL to the PDF label (expires after a time, so store locally)
  status: string; // e.g., "REGISTERED", "IN_TRANSIT", etc.
}

export interface FanCourierTrackingResponse {
  awbNumber: string;
  status: string; // "PENDING", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "EXCEPTION", etc.
  lastUpdate: Date;
  events?: Array<{
    timestamp: Date;
    status: string;
    description: string;
  }>;
}

class FanCourierClient {
  private baseUrl: string;
  private username: string;
  private password: string;
  private environment: FanCourierEnvironment;

  constructor(
    username: string,
    password: string,
    environment: FanCourierEnvironment = "test"
  ) {
    this.username = username;
    this.password = password;
    this.environment = environment;
    this.baseUrl = BASE_URLS[environment];
  }

  private getAuthHeader(): string {
    return "Basic " + Buffer.from(`${this.username}:${this.password}`).toString("base64");
  }

  private async makeRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        Authorization: this.getAuthHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error(
          { status: response.status, errorBody, endpoint, environment: this.environment },
          "FanCourier API error"
        );
        throw new FanCourierAPIError(
          `FanCourier API error: ${response.status} ${errorBody.slice(0, 200)}`,
          response.status
        );
      }

      return response.json() as Promise<T>;
    } catch (err) {
      if (err instanceof FanCourierAPIError) throw err;
      logger.error({ err, endpoint, environment: this.environment }, "FanCourier request failed");
      throw new FanCourierAPIError("FanCourier request failed: " + String(err));
    }
  }

  async generateShipment(request: FanCourierShipmentRequest): Promise<FanCourierShipmentResponse> {
    const response = await this.makeRequest<{
      success: boolean;
      data?: {
        awb_number: string;
        label_url: string;
        status: string;
      };
      error?: string;
    }>("POST", "/shipments", request);

    if (!response.success || !response.data) {
      throw new FanCourierAPIError(`Shipment creation failed: ${response.error || "unknown error"}`);
    }

    return {
      awbNumber: response.data.awb_number,
      labelUrl: response.data.label_url,
      status: response.data.status,
    };
  }

  async getTracking(awbNumber: string): Promise<FanCourierTrackingResponse> {
    const response = await this.makeRequest<{
      success: boolean;
      data?: {
        awb_number: string;
        status: string;
        last_update: string;
        events?: Array<{
          timestamp: string;
          status: string;
          description: string;
        }>;
      };
      error?: string;
    }>("GET", `/shipments/${awbNumber}/tracking`);

    if (!response.success || !response.data) {
      throw new FanCourierAPIError(`Tracking lookup failed: ${response.error || "unknown error"}`);
    }

    return {
      awbNumber: response.data.awb_number,
      status: response.data.status,
      lastUpdate: new Date(response.data.last_update),
      events: response.data.events?.map((e) => ({
        timestamp: new Date(e.timestamp),
        status: e.status,
        description: e.description,
      })),
    };
  }

  async verifyCredentials(): Promise<boolean> {
    try {
      // Simple test: fetch account info or a test endpoint
      await this.makeRequest("GET", "/account");
      return true;
    } catch {
      return false;
    }
  }
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

/**
 * Create a FanCourier client for the given credentials and environment. Used by the carrier
 * service to make API calls.
 */
export function createFanCourierClient(
  username: string,
  password: string,
  environment: FanCourierEnvironment = "test"
): FanCourierClient {
  return new FanCourierClient(username, password, environment);
}
