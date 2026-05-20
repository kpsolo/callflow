import { describe, expect, it } from "vitest";
import { getNodeHeadline } from "../headline";

describe("getNodeHeadline", () => {
  it("resolves menu_action_transfer headlines", () => {
    expect(getNodeHeadline("menu_action_transfer", { mode: "extension", extension: "100" })).toBe("100");
    expect(getNodeHeadline("menu_action_transfer", { mode: "hunt_group", hunt_group_id: "hg_1", label: "Sales" })).toBe("Sales");
    expect(getNodeHeadline("menu_action_transfer", { mode: "hunt_group", hunt_group_id: "hg_1" })).toBe("hg_1");
    expect(getNodeHeadline("menu_action_transfer", { mode: "sip_uri", uri: "sip:alice@example.com" })).toBe("sip:alice@example.com");
    expect(getNodeHeadline("menu_action_transfer", { mode: "e164", number: "+18005551234" })).toBe("+18005551234");
    expect(getNodeHeadline("menu_action_transfer", { target_node_id: "tgt_1" })).toBe("tgt_1");
  });

  it("returns null when no destination or target is set", () => {
    expect(getNodeHeadline("menu_action_transfer", {})).toBeNull();
  });
});
