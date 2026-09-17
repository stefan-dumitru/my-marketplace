import pino from "pino";

// Structured JSON logging per operations.md > Observability. Never log PII (full name, email,
// address, phone) as top-level fields on info/debug logs — pass identifiers (userId) instead.
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
});
