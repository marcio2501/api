
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import crypto from "node:crypto";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

// Permitir chamadas da página de pagamento
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const PORT = process.env.PORT || 3000;

if (!process.env.MP_TOKEN) {
  console.error("ERRO: MP_TOKEN não está configurado no Render.");
}

// Testar se o servidor está ativo
app.get("/", (req, res) => {
  res.json({ status: "online", mensagem: "API de pagamento PIX ativa" });
});

// CRIAR PAGAMENTO PIX
app.post("/create-payment", async (req, res) => {
  try {
    console.log("Solicitação de pagamento recebida.");

    if (!process.env.MP_TOKEN) {
      return res.status(500).json({
        error: "MP_TOKEN não está configurado no Render."
      });
    }

    const valor = Number(req.body.transaction_amount);
    const descricao = String(req.body.description || "Pagamento PIX");

    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({
        error: "Valor inválido. Envie transaction_amount maior que zero."
      });
    }

    const corpo = {
      transaction_amount: Math.round(valor * 100) / 100,
      payment_method_id: "pix",
      description: descricao,
      payer: {
        email: "marciodoxosse@gmail.com"
      }
    };

    if (process.env.WEBHOOK_URL) {
      corpo.notification_url = process.env.WEBHOOK_URL;
    }

    const response = await fetch(
      "https://api.mercadopago.com/v1/payments",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MP_TOKEN}`,
          "X-Idempotency-Key": crypto.randomUUID()
        },
        body: JSON.stringify(corpo)
      }
    );

    const texto = await response.text();
    let data;

    try {
      data = JSON.parse(texto);
    } catch {
      data = { mensagem: texto };
    }

    if (!response.ok) {
      // Não registrar o token secreto nos logs.
      console.error("Erro retornado pelo Mercado Pago:", {
        status: response.status,
        resposta: data
      });

      return res.status(response.status).json({
        error: "O Mercado Pago recusou a criação do pagamento.",
        details: data
      });
    }

    console.log("Pagamento criado. ID:", data.id);

    return res.json(data);

  } catch (err) {
    console.error("Erro interno ao criar pagamento:", err.message);

    return res.status(500).json({
      error: "Erro interno ao criar pagamento.",
      details: err.message
    });
  }
});

// CONSULTAR PAGAMENTO
app.get("/check-payment/:id", async (req, res) => {
  try {
    if (!process.env.MP_TOKEN) {
      return res.status(500).json({
        error: "MP_TOKEN não está configurado."
      });
    }

    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(req.params.id)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro na consulta:", response.status, data);
      return res.status(response.status).json({
        error: "Não foi possível consultar o pagamento.",
        details: data
      });
    }

    return res.json(data);

  } catch (err) {
    console.error("Erro ao consultar pagamento:", err.message);

    return res.status(500).json({
      error: "Erro ao consultar pagamento."
    });
  }
});

// WEBHOOK DO MERCADO PAGO
app.post("/webhook", async (req, res) => {
  try {
    console.log("Notificação recebida no webhook.");

    const paymentId = req.body?.data?.id;

    if (req.body?.type === "payment" && paymentId) {
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_TOKEN}`
          }
        }
      );

      const payment = await response.json();

      if (!response.ok) {
        console.error("Erro ao consultar pagamento do webhook:", payment);
        return res.sendStatus(500);
      }

      console.log("ID:", payment.id, "| Status:", payment.status);

      if (payment.status === "approved") {
        console.log("Pagamento aprovado pelo Mercado Pago.");
      }
    }

    return res.sendStatus(200);

  } catch (err) {
    console.error("Erro no webhook:", err.message);
    return res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
