import { describe, it } from "@std/testing/bdd";
import { registerSchema, loginSchema } from "../validators/auth.ts";
import { reportSchema, updateReportSchema } from "../validators/report.ts";
import { claimSchema } from "../validators/claim.ts";
import { assertEquals, assert } from "@std/assert";

describe("auth validators", () => {
  describe("registerSchema", () => {
    it("accepts valid registration", () => {
      const result = registerSchema.safeParse({
        name: "John Doe",
        email: "john@example.com",
        password: "password123",
      });
      assert(result.success);
    });

    it("rejects short name", () => {
      const result = registerSchema.safeParse({
        name: "J",
        email: "john@example.com",
        password: "password123",
      });
      assertEquals(result.success, false);
    });

    it("rejects invalid email", () => {
      const result = registerSchema.safeParse({
        name: "John",
        email: "not-an-email",
        password: "password123",
      });
      assertEquals(result.success, false);
    });

    it("rejects short password", () => {
      const result = registerSchema.safeParse({
        name: "John",
        email: "john@example.com",
        password: "123",
      });
      assertEquals(result.success, false);
    });
  });

  describe("loginSchema", () => {
    it("accepts valid login", () => {
      const result = loginSchema.safeParse({ email: "john@example.com", password: "password123" });
      assert(result.success);
    });

    it("rejects empty password", () => {
      const result = loginSchema.safeParse({ email: "john@example.com", password: "" });
      assertEquals(result.success, false);
    });
  });
});

describe("report validators", () => {
  describe("reportSchema", () => {
    it("accepts a valid LOST report", () => {
      const result = reportSchema.safeParse({
        type: "LOST",
        title: "Black Wallet",
        category: "Wallet",
        description: "A black leather wallet with a silver clasp",
        location: "Student Union",
        dateTime: new Date().toISOString(),
        privateDetails: "Contains a single house key",
        currentLocation: "Lost and Found office",
      });
      assert(result.success);
    });

    it("rejects invalid type", () => {
      const result = reportSchema.safeParse({
        type: "BANANA",
        title: "Black Wallet",
        category: "Wallet",
        description: "A black leather wallet with a silver clasp",
        location: "Student Union",
        dateTime: new Date().toISOString(),
      });
      assertEquals(result.success, false);
    });

    it("rejects short title", () => {
      const result = reportSchema.safeParse({
        type: "LOST",
        title: "W",
        category: "Wallet",
        description: "A black leather wallet with a silver clasp",
        location: "Student Union",
        dateTime: new Date().toISOString(),
      });
      assertEquals(result.success, false);
    });

    it("rejects short description", () => {
      const result = reportSchema.safeParse({
        type: "LOST",
        title: "Wallet",
        category: "Wallet",
        description: "Too short",
        location: "Student Union",
        dateTime: new Date().toISOString(),
      });
      assertEquals(result.success, false);
    });
  });

  describe("updateReportSchema", () => {
    it("accepts partial updates", () => {
      const result = updateReportSchema.safeParse({ location: "Library" });
      assert(result.success);
    });

    it("accepts empty object", () => {
      const result = updateReportSchema.safeParse({});
      assert(result.success);
    });

    it("rejects invalid field", () => {
      const result = updateReportSchema.safeParse({ title: "x" });
      assertEquals(result.success, false);
    });
  });
});

describe("claim validator", () => {
  it("accepts valid claim", () => {
    const result = claimSchema.safeParse({
      matchId: "abc-123",
      verificationDetails: "Serial number on the device is ABC123",
    });
    assert(result.success);
  });

  it("rejects missing matchId", () => {
    const result = claimSchema.safeParse({ verificationDetails: "Some verification details here" });
    assertEquals(result.success, false);
  });

  it("rejects short verification details", () => {
    const result = claimSchema.safeParse({ matchId: "abc", verificationDetails: "too short" });
    assertEquals(result.success, false);
  });
});