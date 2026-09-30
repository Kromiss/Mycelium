import { PUSH_KINDS, type ClientMessage, type PushKind } from "@mycelium/shared";
import { lang, t, type MessageKey } from "./i18n";

const KINDS_KEY = "mycelium.pushKinds";

type Status = "on" | "off" | "unsupported" | "denied" | "unavailable" | "failed";

/**
 * Browser notifications (M7, decided: Web Push only, opt-in). The service worker shows them; the
 * server sends them only while the player is away, at most one per kind every 30 min.
 */
export class NotifyView {
  private kinds: Set<PushKind>;
  private status: Status = "off";
  private busy = false;

  constructor(
    private readonly el: {
      overlay: HTMLElement;
      kinds: HTMLElement;
      status: HTMLElement;
      toggle: HTMLButtonElement;
    },
    private readonly send: (msg: ClientMessage) => void,
  ) {
    this.kinds = loadKinds();
    el.toggle.addEventListener("click", () => void (this.status === "on" ? this.disable() : this.enable()));
  }

  open(): void {
    this.el.overlay.hidden = false;
    void this.refresh();
  }

  close(): void {
    this.el.overlay.hidden = true;
  }

  /** After (re)connecting: the server may have forgotten the subscription (new language, new kinds). */
  async resubscribe(): Promise<void> {
    const sub = await currentSubscription();
    if (sub) this.sendSubscription(sub);
  }

  /** Language changed: the server writes notifications in the language given here. */
  render(): void {
    this.el.kinds.replaceChildren(
      ...PUSH_KINDS.map((kind) => {
        const label = document.createElement("label");
        label.className = "auto-row";
        const text = document.createElement("span");
        text.textContent = t(`notify.kind.${kind}` as MessageKey);
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = this.kinds.has(kind);
        box.addEventListener("change", () => {
          if (box.checked) this.kinds.add(kind);
          else this.kinds.delete(kind);
          saveKinds(this.kinds);
          void this.resubscribe();
        });
        label.append(text, box);
        return label;
      }),
    );
    this.el.status.textContent = t(`notify.status.${this.status}` as MessageKey);
    this.el.toggle.textContent = t(this.status === "on" ? "notify.disable" : "notify.enable");
    this.el.toggle.disabled = this.busy || this.status === "unsupported" || this.status === "unavailable" || this.status === "denied";
  }

  private async refresh(): Promise<void> {
    if (!supported()) this.status = "unsupported";
    else if (Notification.permission === "denied") this.status = "denied";
    else this.status = (await currentSubscription()) ? "on" : "off";
    this.render();
  }

  private async enable(): Promise<void> {
    this.busy = true;
    this.render();
    try {
      const key = await fetchKey();
      if (!key) {
        this.status = "unavailable";
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        this.status = Notification.permission === "denied" ? "denied" : "off";
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) });
      this.sendSubscription(sub);
      this.status = "on";
    } catch {
      this.status = "failed";
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async disable(): Promise<void> {
    const sub = await currentSubscription();
    if (sub) {
      this.send({ type: "pushUnsubscribe", endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => false);
    }
    this.status = "off";
    this.render();
  }

  private sendSubscription(sub: PushSubscription): void {
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
    this.send({ type: "pushSubscribe", endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, lang: lang(), kinds: [...this.kinds] });
  }
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function fetchKey(): Promise<string | null> {
  const res = await fetch("/api/push/key");
  if (!res.ok) return null;
  return ((await res.json()) as { key: string | null }).key;
}

function loadKinds(): Set<PushKind> {
  try {
    const raw = JSON.parse(localStorage.getItem(KINDS_KEY) ?? "null") as unknown;
    if (Array.isArray(raw)) return new Set(PUSH_KINDS.filter((k) => raw.includes(k)));
  } catch {
    // Defaults below.
  }
  return new Set(PUSH_KINDS);
}

function saveKinds(kinds: Set<PushKind>): void {
  try {
    localStorage.setItem(KINDS_KEY, JSON.stringify([...kinds]));
  } catch {
    // Kept for this session only.
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
