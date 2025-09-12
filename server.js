// server.js
import express from "express";
import cors from "cors";

const app = express();

// Middleware
app.use(cors()); // 🔥 Libera acesso de qualquer origem (frontend consegue chamar a API)
app.use(express.json());

// Rota teste (pra verificar se está online)
app.get("/", (req, res) => {
  res.json({ status: "API PocketOption rodando ✅" });
});

// Exemplo de rota de saldo (simulada por enquanto)
app.get("/saldo", (req, res) => {
  res.json({ saldo: 1234.56, moeda: "USD" });
});

// Render usa PORT automática
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
