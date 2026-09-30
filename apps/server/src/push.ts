import webpush from "web-push";
import type { GameStore, PushSubscriptionRecord } from "./store";

/** Sends browser notifications (Web Push). Replaced by a spy in tests. */
export interface PushSender {
  /** Public VAPID key the browser subscribes with; null when notifications are off. */
  readonly publicKey: string | null;
  /** "gone": the browser dropped the subscription, forget it. */
  send(sub: PushSubscriptionRecord, payload: { title: string; body: string; tag: string }): Promise<"ok" | "gone" | "failed">;
}

export const NO_PUSH: PushSender = { publicKey: null, send: async () => "failed" };

const SETTING_KEY = "vapid";

/**
 * Web Push with the VAPID keys of the environment (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY), or keys
 * generated once and kept in the database, so that no secret has to be set up by hand.
 */
export async function createWebPush(
  store: GameStore,
  env: { publicKey?: string; privateKey?: string; subject?: string },
  log: (msg: string) => void,
): Promise<PushSender> {
  let keys = env.publicKey && env.privateKey ? { publicKey: env.publicKey, privateKey: env.privateKey } : null;
  if (!keys) {
    const saved = await store.getSetting(SETTING_KEY);
    if (saved) keys = JSON.parse(saved) as { publicKey: string; privateKey: string };
    else {
      keys = webpush.generateVAPIDKeys();
      await store.setSetting(SETTING_KEY, JSON.stringify(keys));
      log("generated the Web Push keys (kept in the database)");
    }
  }
  const details = { subject: env.subject || "https://github.com/Kromiss/mycelium", ...keys };
  return {
    publicKey: keys.publicKey,
    async send(sub, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { vapidDetails: details, TTL: 3600, urgency: "normal", timeout: 10_000 },
        );
        return "ok";
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "gone";
        log(`push failed (${status ?? String(err)})`);
        return "failed";
      }
    },
  };
}
