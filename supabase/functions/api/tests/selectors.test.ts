import { describe, it } from "@std/testing/bdd";
import { assertEquals, assert } from "@std/assert";
import {
  USER_NARROW,
  USER_WITH_EMAIL,
  fullReportSelect,
} from "../_shared/selectors.ts";

// The owner's email is the one field that must not reach a non-admin viewer. These assertions are
// cheap, but they are the whole gate: if someone reverts GET /reports/:id to FULL_REPORT_SELECT,
// or drops the role check, the leak is silent again.
describe("fullReportSelect", () => {
  it("omits the report owner's email for a normal viewer", () => {
    const select = fullReportSelect("USER");
    assert(select.includes(`user:User(${USER_NARROW})`));
    assert(!select.includes("email"));
  });

  it("keeps the email for an admin", () => {
    assert(fullReportSelect("ADMIN").includes(`user:User(${USER_WITH_EMAIL})`));
  });

  it("treats a missing or unknown role as non-admin", () => {
    for (const role of [undefined, "", "MODERATOR"]) {
      assert(!fullReportSelect(role).includes("email"), `role ${role} leaked the email`);
    }
  });

  it("still returns the full report shape, not just the user", () => {
    const select = fullReportSelect("USER");
    for (const fragment of ["item:Item(", "community:Community(", "event:Event(", "user:User("]) {
      assert(select.includes(fragment), `missing ${fragment}`);
    }
  });
});

describe("select constants", () => {
  it("USER_NARROW really has no email column", () => {
    assertEquals(USER_NARROW.includes("email"), false);
    assert(USER_WITH_EMAIL.includes("email"));
  });
});