import { describe, expect, it } from "vitest";
import { canReadChat, CHAT, cleanChatText, guardChat, newChatGuard, pushText } from "./chat";

describe("chat messages", () => {
  it("cleans control characters, line breaks and extra spaces", () => {
    expect(cleanChatText("  hello\n\n  world\u0007 ")).toEqual({ ok: true, text: "hello world" });
    expect(cleanChatText("a‮b")).toEqual({ ok: true, text: "a b" });
  });

  it("refuses empty and too long messages", () => {
    expect(cleanChatText(" \n\t ")).toEqual({ ok: false, error: "empty" });
    expect(cleanChatText("x".repeat(CHAT.maxLength)).ok).toBe(true);
    expect(cleanChatText("x".repeat(CHAT.maxLength + 1))).toEqual({ ok: false, error: "too_long" });
    // Counted in characters, not UTF-16 units.
    expect(cleanChatText("🍄".repeat(CHAT.maxLength)).ok).toBe(true);
  });

  it("allows a burst of messages, then waits for the window", () => {
    const g = newChatGuard();
    for (let i = 0; i < CHAT.burst; i++) expect(guardChat(g, `m${i}`, 1000 + i)).toBeNull();
    expect(guardChat(g, "one more", 2000)).toBe("rate_limited");
    expect(guardChat(g, "later", 1000 + CHAT.windowMs + 10)).toBeNull();
  });

  it("refuses the same text twice in a row for a while, whatever the case", () => {
    const g = newChatGuard();
    expect(guardChat(g, "Help!", 0)).toBeNull();
    expect(guardChat(g, "help!", CHAT.windowMs)).toBe("repeated");
    expect(guardChat(g, "other", CHAT.windowMs * 2)).toBeNull();
    expect(guardChat(g, "Help!", CHAT.windowMs * 3)).toBeNull();
    expect(guardChat(g, "Help!", CHAT.windowMs * 3 + CHAT.repeatMs)).toBeNull();
  });

  it("lets only the right people read each channel", () => {
    expect(canReadChat({ channel: "forest", from: "a" }, "z", null)).toBe(true);
    expect(canReadChat({ channel: "dm", from: "a", to: "b" }, "b", null)).toBe(true);
    expect(canReadChat({ channel: "dm", from: "a", to: "b" }, "a", null)).toBe(true);
    expect(canReadChat({ channel: "dm", from: "a", to: "b" }, "c", null)).toBe(false);
    expect(canReadChat({ channel: "pact", from: "a", pact: "p1" }, "b", "p1")).toBe(true);
    expect(canReadChat({ channel: "pact", from: "a", pact: "p1" }, "b", "p2")).toBe(false);
    expect(canReadChat({ channel: "pact", from: "a", pact: "p1" }, "b", null)).toBe(false);
  });
});

describe("notification texts", () => {
  it("speaks the player's language and shortens long messages", () => {
    expect(pushText("heart", "fr", { name: "Mycena" }).body).toBe("Mycena s'en prend à ton Cœur !");
    expect(pushText("attacked", "en", { name: "Mycena" }).body).toBe("Mycena is pushing on your border.");
    const long = pushText("dm", "en", { name: "A", text: "x".repeat(300) }).body;
    expect(long.length).toBeLessThan(130);
    expect(long.endsWith("…")).toBe(true);
  });
});
