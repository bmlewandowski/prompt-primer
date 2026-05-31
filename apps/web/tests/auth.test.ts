import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { checkWriteAuth } from "../lib/auth";
import { NextRequest } from "next/server";

describe("checkWriteAuth", () => {
  const originalEnv = process.env.ADMIN_SECRET;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.ADMIN_SECRET = originalEnv;
    } else {
      delete process.env.ADMIN_SECRET;
    }
  });

  describe("when ADMIN_SECRET is not set", () => {
    beforeEach(() => {
      delete process.env.ADMIN_SECRET;
    });

    it("allows requests without Authorization header", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });

    it("allows requests with any Authorization header", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "authorization": "Bearer random-token",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });

    it("still enforces body size limit even without auth", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "200000", // 200 KB
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(413);
    });
  });

  describe("when ADMIN_SECRET is set", () => {
    beforeEach(() => {
      process.env.ADMIN_SECRET = "test-secret-123";
    });

    it("allows requests with correct Bearer token", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "authorization": "Bearer test-secret-123",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });

    it("rejects requests without Authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);

      const body = await result?.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("rejects requests with incorrect Bearer token", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "authorization": "Bearer wrong-token",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);

      const body = await result?.json();
      expect(body).toEqual({ error: "Unauthorized" });
    });

    it("rejects requests with malformed Authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "authorization": "test-secret-123", // Missing "Bearer " prefix
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it("rejects requests with empty Authorization header", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "authorization": "",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it("is case-sensitive for Bearer token", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "authorization": "bearer test-secret-123", // lowercase bearer
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });
  });

  describe("body size limit", () => {
    beforeEach(() => {
      delete process.env.ADMIN_SECRET;
    });

    it("rejects requests with Content-Length > 100KB", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "100001",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(413);

      const body = await result?.json();
      expect(body).toEqual({ error: "Request body too large (max 100 KB)" });
    });

    it("allows requests with Content-Length = 100KB exactly", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "100000",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });

    it("allows requests with Content-Length < 100KB", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "50000",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });

    it("allows requests without Content-Length header", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-type": "application/json",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });

    it("handles malformed Content-Length gracefully", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "not-a-number",
        }),
      });

      const result = checkWriteAuth(req);
      // parseInt("not-a-number") returns NaN, which is not > 100000
      expect(result).toBeNull();
    });

    it("handles empty Content-Length header", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });
  });

  describe("combined auth and size checks", () => {
    beforeEach(() => {
      process.env.ADMIN_SECRET = "test-secret-123";
    });

    it("checks body size before auth (413 takes precedence)", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "200000",
          "authorization": "Bearer test-secret-123",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(413);

      const body = await result?.json();
      expect(body).toEqual({ error: "Request body too large (max 100 KB)" });
    });

    it("checks auth after body size passes", async () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "50000",
          "authorization": "Bearer wrong-token",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).not.toBeNull();
      expect(result?.status).toBe(401);
    });

    it("allows valid requests with both checks", () => {
      const req = new NextRequest("http://localhost:3000/api/test", {
        method: "POST",
        headers: new Headers({
          "content-length": "50000",
          "authorization": "Bearer test-secret-123",
        }),
      });

      const result = checkWriteAuth(req);
      expect(result).toBeNull();
    });
  });
});
