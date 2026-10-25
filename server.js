
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_MP = "https://api.mercadopago.com";
const ORIGEM_PERMITIDA =
  "https://onlinecartomantes-dotcom.github.io";

// =========================
// CORS - GITHUB PAGES
// =========================
app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    ORIGEM_PERMITIDA
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// =========================
// MIDDLEWARES
// =========================
app.use(express.json());
app.use(express.static("public"));

// =========================
// VERIFICAR TOKEN
// =========================
if (!process.env.MP_TOKEN) {
  console.error("ERRO: MP_TOKEN NÃO DEFINIDO NO RENDER");
}

// =========================
// ROTA INICIAL
// =========================
app.get("/", (req, res) => {
  res.json({
    online: true,
    mensagem: "API de pagamentos online",
    rotas: [
      "POST /create-payment",
      "GET /check-payment/:id",
      "POST /webhook"
    ]
  });
});

// =========================
// CRIAR PAGAMENTO PIX
// =========================
app.post("/create-payment", async (req, res) => {
  try {
    if (!process.env.MP_TOKEN) {
      return res.status(500).json({
        error: "Token do Mercado Pago não configurado."
      });
    }

    const valor = Number(req.body?.transaction_amount);
    const descricao =
      String(req.body?.description || "Pagamento PIX").trim();

    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({
        error: "Valor do pagamento inválido."
      });
    }

    console.log("REQUISIÇÃO DE PAGAMENTO:", {
      valor,
      descricao
    });

    const corpo = {
      transaction_amount: valor,
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
      `${API_MP}/v1/payments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.MP_TOKEN}`,
          "X-Idempotency-Key": randomUUID()
        },
        body: JSON.stringify(corpo)
      }
    );

    const texto = await response.text();

    let data;

    try {
      data = JSON.parse(texto);
    } catch {
      data = {
        message: "Resposta inválida do Mercado Pago."
      };
    }

    console.log("RESPOSTA MERCADO PAGO:", {
      httpStatus: response.status,
      id: data.id || null,
      status: data.status || null,
      message: data.message || null,
      cause: data.cause || null
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro ao criar pagamento no Mercado Pago.",
        details: data
      });
    }

    // Dados necessários para o checkout e o QR Code.
    const transacao =
      data?.point_of_interaction?.transaction_data || {};

    return res.status(200).json({
      ...data,
      pix: {
        ticket_url: transacao.ticket_url || null,
        qr_code: transacao.qr_code || null,
        qr_code_base64: transacao.qr_code_base64 || null
      }
    });

  } catch (err) {
    console.error("ERRO AO CRIAR PAGAMENTO:", err);

    return res.status(500).json({
      error: "Erro interno ao criar pagamento."
    });
  }
});

// =========================
// VERIFICAR PAGAMENTO
// =========================
app.get("/check-payment/:id", async (req, res) => {
  try {
    if (!process.env.MP_TOKEN) {
      return res.status(500).json({
        error: "Token do Mercado Pago não configurado."
      });
    }

    const id = encodeURIComponent(req.params.id);

    const response = await fetch(
      `${API_MP}/v1/payments/${id}`,
      {
        headers: {
          "Authorization": `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const data = await response.json();

    console.log("STATUS DO PAGAMENTO:", {
      id: data.id || req.params.id,
      status: data.status || null
    });

    return res.status(response.status).json(data);

  } catch (err) {
    console.error("ERRO AO CONSULTAR PAGAMENTO:", err);

    return res.status(500).json({
      error: "Erro ao verificar pagamento."
    });
  }
});

// =========================
// WEBHOOK MERCADO PAGO
// =========================
app.post("/webhook", async (req, res) => {
  // Responder rapidamente para confirmar o recebimento.
  res.sendStatus(200);

  try {
    console.log("WEBHOOK RECEBIDO:", req.body);

    if (!process.env.MP_TOKEN) {
      console.error("MP_TOKEN não configurado.");
      return;
    }

    const tipo = req.body?.type || req.query?.type;

    const paymentId =
      req.body?.data?.id ||
      req.query?.["data.id"];

    if (tipo !== "payment" || !paymentId) {
      console.log("Notificação sem ID de pagamento.");
      return;
    }

    const response = await fetch(
      `${API_MP}/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        headers: {
          "Authorization": `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const paymentData = await response.json();

    if (!response.ok) {
      console.error(
        "ERRO AO CONSULTAR PAGAMENTO DO WEBHOOK:",
        paymentData
      );
      return;
    }

    console.log("STATUS REAL DO PAGAMENTO:", {
      id: paymentData.id,
      status: paymentData.status,
      valor: paymentData.transaction_amount
    });

    if (paymentData.status === "approved") {
      console.log("PAGAMENTO APROVADO:", paymentData.id);

      // Integre aqui seu banco de dados ou liberação de serviço.
      // Não considere um pagamento aprovado apenas por dados enviados
      // pelo navegador; confirme sempre o status consultando o Mercado Pago.
    }

  } catch (err) {
    console.error("ERRO AO PROCESSAR WEBHOOK:", err);
  }
});

// =========================
// ROTA NÃO ENCONTRADA
// =========================
app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada.",
    rota: req.path
  });
});

// =========================
// INICIAR SERVIDOR
// =========================
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
