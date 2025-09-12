// server.js
import express from "express";
import WebSocket, { WebSocketServer } from "ws";
import http from "http";

const app = express();
const PORT = process.env.PORT || 3000;

const POCKET_WS_URL =
  "wss://api.pocketoption.com:8085/socket.io/?EIO=3&transport=websocket";

let pocketWS;
let ativosSelecionados = [];
let candlesCache = {};

// Criar servidor HTTP + WS interno
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Lista de clientes conectados no nosso WS
let clientes = [];

// ====== FUNÇÃO PARA CONECTAR NA POCKET OPTION ======
function conectarPocketOption() {
  pocketWS = new WebSocket(POCKET_WS_URL);

  pocketWS.on("open", () => {
    console.log("📡 Conectado à Pocket Option WebSocket");

    // Pedir lista de ativos disponíveis
    pocketWS.send('42["assets_status"]');
  });

  pocketWS.on("message", (msg) => {
    const raw = msg.toString();
    if (!raw.startsWith("42")) return;

    let data;
    try {
      data = JSON.parse(raw.slice(2));
    } catch (e) {
      return;
    }

    // LISTA DE ATIVOS
    if (data[0] === "assets_status") {
      selecionarAtivos(data[1]);
    }

    // RESPOSTA DE CANDLES
    if (data[0] === "candles") {
      const asset = data[1][0]?.asset;
      if (asset) {
        candlesCache[asset] = data[1];
        console.log(`📊 Candles recebidos de ${asset}`);

        // Enviar candles atualizados para todos clientes conectados
        broadcast({ type: "candles", asset, data: data[1] });
      }
    }
  });

  pocketWS.on("close", () => {
    console.log("⚠️ Desconectado da Pocket Option. Tentando reconectar...");
    setTimeout(conectarPocketOption, 5000);
  });

  pocketWS.on("error", (err) => {
    console.error("❌ Erro no WebSocket:", err.message);
  });
}

// ====== FUNÇÃO PARA SELECIONAR ATIVOS ======
function selecionarAtivos(lista) {
  console.log("📋 Ativos recebidos:", lista.length);

  // Separar OTC
  const otc = lista.filter((a) => a.symbol.includes("_otc")).slice(0, 10);

  // Separar mercado aberto com payot >= 85%
  const abertos = lista
    .filter((a) => !a.symbol.includes("_otc") && a.payoff >= 0.85)
    .slice(0, 5);

  ativosSelecionados = [...otc, ...abertos];
  console.log(
    "✅ Ativos selecionados:",
    ativosSelecionados.map((a) => a.symbol)
  );

  // Pedir candles de cada ativo
  ativosSelecionados.forEach((asset) => {
    pocketWS.send(
      `42["candles",{"asset":"${asset.symbol}","tf":60,"cnt":10}]`
    );
  });
}

// ====== ATUALIZA LISTA DE ATIVOS A CADA 60s ======
setInterval(() => {
  if (pocketWS && pocketWS.readyState === WebSocket.OPEN) {
    console.log("🔄 Atualizando lista de ativos...");
    pocketWS.send('42["assets_status"]');
  }
}, 60000); // 60 segundos

// ====== BROADCAST PARA CLIENTES WEBSOCKET ======
function broadcast(msg) {
  clientes.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  });
}

// ====== ROTA HTTP PARA RETORNAR CANDLES ======
app.get("/candles", (req, res) => {
  res.json(candlesCache);
});

// ====== ROTA DE STATUS ======
app.get("/", (req, res) => {
  res.json({ status: "API PocketOption rodando ✅" });
});

// ====== GERENCIAR CLIENTES WEBSOCKET ======
wss.on("connection", (ws) => {
  console.log("🔌 Cliente conectado ao WebSocket interno");
  clientes.push(ws);

  // Envia candles atuais imediatamente
  ws.send(JSON.stringify({ type: "snapshot", data: candlesCache }));

  ws.on("close", () => {
    clientes = clientes.filter((c) => c !== ws);
    console.log("❌ Cliente desconectado");
  });
});

// ====== INICIAR SERVIDOR ======
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  conectarPocketOption();
});
