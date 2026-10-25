
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_MP = "https://api.mercadopago.com";

// =========================
// CORS — PERMITIR O GITHUB PAGES
// =========================
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// =========================
// CONFIGURAÇÕES DO EXPRESS
// =========================
app.use(express.json());
app.use(express.static("public"));

function tokenValido() {
  return Boolean(process.env.MP_TOKEN);
}

// =========================
// TESTE DA API / ACORDAR RENDER
// =========================
app.get("/", (req, res) => {
  return res.status(200).json({
    online: true,
    mensagem: "API de pagamentos online",
    endpoints: [
      "POST /create-payment",
      "GET /check-payment/:id",
      "POST /webhook"
    ]
  });
});

// =========================
// CRIAR PAGAMENTO PIX
// Compatível com pix.html e aguarde.html
// =========================
app.post("/create-payment", async (req, res) => {
  try {
    console.log("📩 Requisição recebida:", {
      transaction_amount: req.body?.transaction_amount,
      payment_method_id: "pix",
      description: req.body?.description
    });

    // Verificar token
    if (!tokenValido()) {
      console.error("❌ MP_TOKEN não configurado no Render.");

      return res.status(500).json({
        error: "MP_TOKEN não está configurado no servidor."
      });
    }

    // Aceitar os mesmos campos usados pelo primeiro código
    const valor = Number(req.body?.transaction_amount);
    const descricao =
      typeof req.body?.description === "string" &&
      req.body.description.trim()
        ? req.body.description.trim()
        : "Pagamento PIX";

    // Validar valor
    if (!Number.isFinite(valor) || valor <= 0) {
      return res.status(400).json({
        error: "Informe um valor válido para o pagamento."
      });
    }

    // Criar pagamento no Mercado Pago
    const respostaMP = await fetch(
      `${API_MP}/v1/payments`,
      {
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
            ? {
                notification_url: process.env.WEBHOOK_URL
              }
            : {})
        })
      }
    );

    // Ler resposta sem presumir que seja JSON
    const texto = await respostaMP.text();
    let dados;

    try {
      dados = JSON.parse(texto);
    } catch {
      console.error(
        "❌ Resposta inválida do Mercado Pago:",
        respostaMP.status,
        texto.slice(0, 500)
      );

      return res.status(502).json({
        error: "Resposta inválida recebida do Mercado Pago.",
        status: respostaMP.status
      });
    }

    console.log("💰 RESPOSTA MERCADO PAGO:", {
      httpStatus: respostaMP.status,
      id: dados.id,
      status: dados.status,
      message: dados.message,
      cause: dados.cause
    });

    // Manter a resposta de erro detalhada para diagnóstico
    if (!respostaMP.ok) {
      return res.status(respostaMP.status).json({
        error: "Erro no Mercado Pago",
        details: dados
      });
    }

    // Retornar os dados originais do pagamento.
    // aguarde.html pode usar:
    // point_of_interaction.transaction_data.ticket_url
    return res.status(200).json(dados);

  } catch (err) {
    console.error("❌ ERRO INTERNO AO CRIAR PAGAMENTO:", err);

    return res.status(500).json({
      error: "Erro interno ao criar o pagamento."
    });
  }
});

// =========================
// CONSULTAR STATUS DO PAGAMENTO
// GET /check-payment/ID
// =========================
app.get("/check-payment/:id", async (req, res) => {
  try {
    if (!tokenValido()) {
      return res.status(500).json({
        error: "MP_TOKEN não está configurado no servidor."
      });
    }

    const paymentId = req.params.id;

    if (!paymentId) {
      return res.status(400).json({
        error: "Informe o ID do pagamento."
      });
    }

    const respostaMP = await fetch(
      `${API_MP}/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const texto = await respostaMP.text();
    let dados;

    try {
      dados = JSON.parse(texto);
    } catch {
      console.error(
        "❌ Resposta inválida ao consultar pagamento:",
        respostaMP.status
      );

      return res.status(502).json({
        error: "Resposta inválida ao consultar pagamento."
      });
    }

    console.log("🔍 STATUS DO PAGAMENTO:", {
      id: dados.id,
      status: dados.status
    });

    return res.status(respostaMP.status).json(dados);

  } catch (err) {
    console.error("❌ ERRO AO CONSULTAR PAGAMENTO:", err);

    return res.status(500).json({
      error: "Erro ao verificar o pagamento."
    });
  }
});

// =========================
// WEBHOOK MERCADO PAGO
// POST /webhook
// =========================
app.post("/webhook", async (req, res) => {
  // Responder rapidamente para evitar novas tentativas
  res.sendStatus(200);

  try {
    console.log("🔔 WEBHOOK RECEBIDO:", {
      type: req.body?.type,
      action: req.body?.action,
      data: req.body?.data
    });

    const tipo = req.body?.type;
    const paymentId = req.body?.data?.id;

    if (tipo !== "payment" || !paymentId) {
      return;
    }

    if (!tokenValido()) {
      console.error(
        "❌ Não foi possível consultar o pagamento: MP_TOKEN ausente."
      );
      return;
    }

    // Consultar o status real no Mercado Pago
    const respostaMP = await fetch(
      `${API_MP}/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.MP_TOKEN}`
        }
      }
    );

    const pagamento = await respostaMP.json();

    if (!respostaMP.ok) {
      console.error(
        "❌ Erro ao consultar pagamento do webhook:",
        pagamento
      );
      return;
    }

    console.log("📊 STATUS FINAL:", {
      id: pagamento.id,
      status: pagamento.status,
      status_detail: pagamento.status_detail
    });

    if (pagamento.status === "approved") {
      console.log("✅ PAGAMENTO APROVADO:", pagamento.id);

      // IMPORTANTE:
      // Aqui você pode liberar a consulta ou serviço.
      // Antes de liberar, confirme que o pagamento corresponde
      // ao pedido correto do cliente e que ainda não foi processado.
    }

  } catch (err) {
    console.error("❌ ERRO AO PROCESSAR WEBHOOK:", err);
  }
});

// =========================
// TRATAMENTO DE ROTAS INEXISTENTES
// =========================
app.use((req, res) => {
  return res.status(404).json({
    error: "Rota não encontrada.",
    path: req.path
  });
});

// =========================
// INICIAR SERVIDOR
// =========================
app.listen(PORT, () => {
  console.log("🚀 Servidor rodando na porta", PORT);
  console.log("🔑 MP_TOKEN:", tokenValido() ? "Configurado" : "AUSENTE");
});
