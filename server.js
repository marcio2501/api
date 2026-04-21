import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Criar pagamento
app.post("/create-payment", async (req, res) => {
  try {
    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.MP_TOKEN}`,
      },
      body: JSON.stringify({
        ...req.body,
        notification_url: process.env.WEBHOOK_URL,
      }),
    });

    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verificar pagamento
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
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook
app.post("/webhook", (req, res) => {
  console.log("Webhook recebido:", req.body);
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});