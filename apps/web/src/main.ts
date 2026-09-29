import { GAME_NAME, type ServerMessage } from "@mycelium/shared";
import "./style.css";

const statusEl = document.getElementById("status")!;
const versionEl = document.getElementById("version")!;

versionEl.textContent = `${GAME_NAME} v${__APP_VERSION__}`;

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${protocol}://${location.host}/ws`);

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(String(event.data)) as ServerMessage;
    if (msg.type === "welcome") {
      statusEl.textContent = `Connected — server v${msg.version}`;
    }
  });

  ws.addEventListener("close", () => {
    statusEl.textContent = "Disconnected, retrying…";
    setTimeout(connect, 2000);
  });
}

connect();
