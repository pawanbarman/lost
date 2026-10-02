import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertInstanceOf } from "@std/assert";
import { translateRaisedError } from "../_shared/rpc.ts";
import { ApiError } from "../_shared/error.ts";

describe("translateRaisedError", () => {
  it("turns a RAISE's DETAIL status into an ApiError", () => {
    const err = translateRaisedError({
      message: "Conversation already exists",
      details: "409",
    });
    assertInstanceOf(err, ApiError);
    assertEquals(err.statusCode, 409);
    assertEquals(err.message, "Conversation already exists");
  });

  it("maps 403 from a blocked or non-participant raise", () => {
    const err = translateRaisedError({ message: "Not a participant", details: "403" });
    assertInstanceOf(err, ApiError);
    assertEquals(err.statusCode, 403);
  });

  it("falls back to a generic message when the raise carries none", () => {
    const err = translateRaisedError({ message: "", details: "400" });
    assertInstanceOf(err, ApiError);
    assertEquals(err.message, "Request failed");
  });

  it("passes through anything that is not a numeric status", () => {
    const original = { message: "boom", details: "connection failure" };
    assertEquals(translateRaisedError(original), original);
  });

  it("passes through statuses outside the HTTP range", () => {
    const original = { message: "weird", details: "700" };
    assertEquals(translateRaisedError(original), original);
  });

  it("passes through an error with no details at all", () => {
    const original = { message: "syntax error at or near \"r.userid\"" };
    assertEquals(translateRaisedError(original), original);
  });
});