import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Ajuste se souber a URL correta
const WS_URL = "wss://api.pocketoption.com:8085/socket.io/?EIO=3&transport=websocket";

const EMAIL = process.env.PO_EMAIL;
const PASSWORD = process.env.PO_PASSWORD;

// Função para parsear mensagens estilo socket.io
function parseSocketMessage(raw) {
  try {
    const s = raw.toString();
    if (!s.startsWith("42")) return null;
    return JSON.parse(s.slice(2));
  } catch {
    return null;
  }
}

// Função que envia um evento e espera a resposta
function sendSocketEvent(ws, eventName, payload = {}, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeListener("message", handler);
      reject(new Error("timeout waiting for " + eventName));
    }, timeout);

    function handler(raw) {
      const parsed = parseSocketMessage(raw);
      if (!parsed) return;
      const [evt, data] = parsed;
      if (String(evt).toLowerCase().includes(eventName.toLowerCase())) {
        clearTimeout(timer);
        ws.removeListener("message", handler);
        resolve({ evt, data });
      }
    }

    ws.on("message", handler);
    ws.send("42" + JSON.stringify([eventName, payload]));
  });
}

// Conectar e autenticar
function conectar() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);

    ws.on("open", () => {
      console.log("Conectado ao WS, autenticando...");
      ws.send("42" + JSON.stringify(["auth", { email: EMAIL, password: PASSWORD }]));
    });

    ws.on("message", (raw) => {
      const parsed = parseSocketMessage(raw);
      if (!parsed) return;
      const [evt, data] = parsed;

      if (String(evt).toLowerCase().includes("auth")) {
        console.log("Autenticado com sucesso");
        resolve(ws);
      } else if (data && data.error) {
        reject(new Error("Erro de autenticação: " + JSON.stringify(data)));
      }
    });

    ws.on("error", reject);
  });
}

// Rotas -------------------------

app.get("/saldo", async (req, res) => {
  try {
    if (!EMAIL || !PASSWORD) throw new Error("Defina PO_EMAIL e PO_PASSWORD no .env");
    const ws = await conectar();
    const resp = await sendSocketEvent(ws, "balance", {}, 5000);
    ws.close();
    res.json({ success: true, data: resp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/ordem", async (req, res) => {
  try {
    const { asset, amount, direction = "buy", duration = 1 } = req.body;
    if (!asset || !amount) throw new Error("asset e amount obrigatórios");

    const ws = await conectar();
    const payload = { asset, amount, action: direction, duration, option_type: "turbo" };
    const resp = await sendSocketEvent(ws, "open_order", payload, 8000);
    ws.close();
    res.json({ success: true, data: resp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/candles", async (req, res) => {
  try {
    const { asset, timeframe = 60, count = 10 } = req.query;
    if (!asset) throw new Error("asset é obrigatório");

    const ws = await conectar();
    const payload = { asset, tf: Number(timeframe), cnt: Number(count) };
    const resp = await sendSocketEvent(ws, "candles", payload, 8000);
    ws.close();
    res.json({ success: true, data: resp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
