import { NextResponse } from "next/server";
import { withRequestLog } from "@/lib/security/request-log";

const errorResponse = { $ref: "#/components/responses/Error" };

export const GET = withRequestLog(function GET() {
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "Future Atlas client API",
      version: "2026-09-28",
      description: "Study-abroad AI for domain-restricted FA_AiT_ API keys. A written guide is in docs/client-api.md.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/api-keys": {
        post: {
          summary: "Create one FA_AiT_ API key",
          description: "Requires the website sign-in session. Returns the complete key once. Does not issue an access token or a refresh token.",
          responses: { "201": { description: "API key" }, "400": errorResponse, "401": errorResponse, "403": errorResponse, "429": errorResponse },
        },
        get: {
          summary: "List API keys for the signed-in account",
          description: "Returns prefixes and status. Never returns the secret or its hash.",
          responses: { "200": { description: "API key list" }, "401": errorResponse },
        },
        delete: {
          summary: "Revoke one API key",
          responses: { "200": { description: "Revocation result" }, "400": errorResponse, "401": errorResponse, "404": errorResponse },
        },
      },
      "/api/v1/ai": {
        post: {
          summary: "Generate a study-abroad answer",
          security: [{ apiKey: [] }],
          parameters: [
            { in: "header", name: "Idempotency-Key", required: false, schema: { type: "string", minLength: 8, maxLength: 128 }, description: "Send the same key only when retrying the same request." },
            { in: "header", name: "X-Client-Origin", required: true, schema: { type: "string", format: "uri" }, description: "Exact registered website origin when calling from a server." },
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AIRequest" } } },
          },
          responses: {
            "200": { description: "Completed answer. Structured modes return data. Mentor returns response." },
            "400": errorResponse,
            "401": errorResponse,
            "403": errorResponse,
            "409": errorResponse,
            "413": errorResponse,
            "429": errorResponse,
            "502": errorResponse,
            "503": errorResponse,
          },
        },
      },
      "/api/v1/health": {
        get: {
          summary: "Readiness check that does not call the model",
          responses: { "200": { description: "Ready" }, "503": { description: "Degraded" } },
        },
      },
      "/api/v1/openapi": {
        get: { summary: "This document", responses: { "200": { description: "OpenAPI 3.1 document" } } },
      },
    },
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key from POST /api/api-keys. It starts with FA_AiT_ and is the only credential for this API.",
        },
      },
      schemas: {
        AIRequest: {
          type: "object",
          required: ["mode", "message"],
          properties: {
            mode: { enum: ["mentor", "cost", "country", "eligibility", "scholarship", "university"] },
            message: { type: "string", minLength: 1, maxLength: 8000 },
            inputs: { type: "object" },
            responseFormat: { enum: ["structured"] },
            history: { type: "array", maxItems: 6 },
            stream: { type: "boolean" },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string" },
                message: { type: "string" },
                retryable: { type: "boolean" },
                retryAfter: { type: "integer" },
                requestId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        Error: {
          description: "Request failed",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
  });
});
