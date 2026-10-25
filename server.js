
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_MP = "https://api.mercadopago.com";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());
app.use(express.static("public"));

function tokenValido() {
  return Boolean(process.env.MP_TOKEN);
}

// Resposta para acordar e verificar o Render
app.get("/", (req, res) => {
  res.json({
    online: true,
    mensagem: "API de pagamentos online"
  });
});

// =========================
// CRIAR PAGAMENTO PIX
// =========================
app.post("/create-payment", async (req, res) => {
  try {
    if (!tokenValido()) {
      return res.status(500).json({
        error: "MP_TOKEN não está configurado no Render."
      });
    }

    const valor = Number(req.body.transaction_amount);
    const descricao = req.body.description;

    if (!Number.isFinite(valor) || valor <= 0 || !descricao) {
      return res.status(400).json({
        error: "Informe um valor válido e uma descrição."
      });
    }

    console.log("📩 Solicitação de pagamento:", {
      valor,
      descricao
    });

    const response = await fetch(`${API_MP}/v1/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_TOKEN}`,
        "X-Idempotency-Key": randomUUID()
      },
      body: JSON.stringify({
        transaction_amount: valor,
        payment_method_id: "pix",
        description: descricao,
        payer: {
          email: "marciodoxosse@gmail.com"
        },
        ...(process.env.WEBHOOK_URL
          ? { notification_url: process.env.WEBHOOK_URL }
          : {})
      })
    });

    const texto = await response.text();

    let dados;

    try {
      dados = JSON.parse(texto);
    } catch {
      console.error(
        "❌ Resposta não JSON do Mercado Pago:",
        response.status,
        texto.slice(0, 500)
      );

      return res.status(502).json({
        error: "Resposta inválida recebida do Mercado Pago.",
        status: response.status
      });
    }

    console.log("💰 Resposta Mercado Pago:", {
      statusHTTP: response.status,
      id: dados.id,
      status: dados.status,
      mensagem: dados.message
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro no Mercado Pago",
        details: dados
      });
    }

    return res.status(201).json(dados);

  } catch (err) {
    console.error("❌ Erro ao criar pagamento:", err);

    return res.status(500).json({
      error: "Erro interno ao criar pagamento."
    });
  }
});

// =========================
// CONSULTAR PAGAMENTO
// =========================
app.get("/check-payment/:id", async (req, res) => {
  try {
    if (!tokenValido()) {
      return res.status(500).json({
        error: "MP_TOKEN não está configurado."
      });
    }

    const response = await fetch(
      `${API_MP}/v1/payments/${encodeURIComponent(req.params.id)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const texto = await response.text();

    let dados;

    try {
      dados = JSON.parse(texto);
    } catch {
      return res.status(502).json({
        error: "Resposta inválida ao consultar pagamento."
      });
    }

    return res.status(response.status).json(dados);

  } catch (err) {
    console.error("❌ Erro ao consultar pagamento:", err);

    return res.status(500).json({
      error: "Erro ao verificar pagamento."
    });
  }
});

// =========================
// WEBHOOK DO MERCADO PAGO
// =========================
app.post("/webhook", async (req, res) => {
  try {
    // Responde rapidamente ao Mercado Pago.
    res.sendStatus(200);

    const paymentId = req.body?.data?.id;

    if (
      req.body?.type !== "payment" ||
      !paymentId ||
      !tokenValido()
    ) {
      return;
    }

    const response = await fetch(
      `${API_MP}/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const pagamento = await response.json();

    console.log("🔔 Webhook:", {
      id: pagamento.id,
      status: pagamento.status
    });

    if (pagamento.status === "approved") {
      console.log("✅ PAGAMENTO APROVADO:", pagamento.id);

      // Aqui você pode liberar o serviço
      // após confirmar o pagamento e o pedido correspondente.
    }

  } catch (err) {
    console.error("❌ Erro no webhook:", err);
  }
});

app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
