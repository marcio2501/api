import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// 🔥 VERIFICA TOKEN
if (!process.env.MP_TOKEN) {
  console.error("❌ MP_TOKEN NÃO DEFINIDO");
}

// =========================
// CRIAR PAGAMENTO
// =========================
app.post("/create-payment", async (req, res) => {
  try {
    console.log("📩 Requisição recebida:", req.body);

    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_TOKEN}`,
        "X-Idempotency-Key": Date.now().toString() // 🔥 obrigatório
      },
      body: JSON.stringify({
        transaction_amount: Number(req.body.transaction_amount),
        payment_method_id: "pix",
        description: req.body.description || "Pagamento PIX",
        payer: {
          email: "marciodoxosse@gmail.com"
        },
        notification_url: process.env.WEBHOOK_URL
          ? process.env.WEBHOOK_URL
          : undefined
      }),
    });

    const data = await response.json();

    console.log("💰 RESPOSTA MERCADO PAGO:", data);

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro no Mercado Pago",
        details: data
      });
    }

    res.json(data);

  } catch (err) {
    console.error("❌ ERRO INTERNO:", err);
    res.status(500).json({ error: "Erro interno no servidor" });
  }
});

// =========================
// VERIFICAR PAGAMENTO
// =========================
app.get("/check-payment/:id", async (req, res) => {
  try {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${req.params.id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`,
        },
      }
    );

    const data = await response.json();

    console.log("🔍 STATUS PAGAMENTO:", data.status);

    res.json(data);

  } catch (err) {
    console.error("❌ ERRO CHECK:", err);
    res.status(500).json({ error: "Erro ao verificar pagamento" });
  }
});

// =========================
// WEBHOOK (IMPORTANTE)
// =========================
app.post("/webhook", async (req, res) => {
  try {
    console.log("🔔 WEBHOOK RECEBIDO:", req.body);

    if (req.body.type === "payment") {
      const paymentId = req.body.data.id;

      console.log("💰 ID PAGAMENTO:", paymentId);

      // 🔥 BUSCAR STATUS REAL NO MP
      const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_TOKEN}`,
          },
        }
      );

      const paymentData = await response.json();

      console.log("📊 STATUS FINAL:", paymentData.status);

      if (paymentData.status === "approved") {
        console.log("✅ PAGAMENTO APROVADO!");

        // 👉 AQUI você pode:
        // salvar no banco
        // liberar acesso
        // enviar email
      }
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("❌ ERRO WEBHOOK:", err);
    res.sendStatus(500);
  }
});

// =========================
// START SERVER
// =========================
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
});
