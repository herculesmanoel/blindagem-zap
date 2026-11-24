const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');

const app = express();
app.use(express.json());

const CHAVE_INTERNA = process.env.ZAP_SECRET || 'blindagem_zap_2026';

let sock = null;
let qrAtual = null;
let conectado = false;

async function iniciarZap() {
  const { state, saveCreds } = await useMultiFileAuthState('./sessao_zap');
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrAtual = qr;
      conectado = false;
    }
    if (connection === 'open') {
      conectado = true;
      qrAtual = null;
      console.log('WhatsApp conectado:', sock.user?.id);
    }
    if (connection === 'close') {
      conectado = false;
      const reconectar = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if (reconectar) setTimeout(iniciarZap, 3000);
    }
  });
}

app.get('/', async (req, res) => {
  if (conectado) {
    return res.send('<body style="background:#050507;color:#34d399;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh"><h1>✅ WhatsApp Blindagem Social Conectado!</h1><a href="/testar" style="margin-top:16px;padding:12px 20px;background:#fbbf24;color:#000;border-radius:10px;text-decoration:none;font-weight:bold">Enviar Mensagem de Teste Agora</a></body>');
  }
  if (!qrAtual) {
    return res.send('<body style="background:#050507;color:#fbbf24;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh"><h2>Gerando QR Code... atualize em 3 segundos.</h2><script>setTimeout(()=>location.reload(),3000)</script></body>');
  }
  const img = await QRCode.toDataURL(qrAtual);
  res.send(`<body style="background:#050507;color:#fff;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh"><h2>Escaneie com seu WhatsApp</h2><img src="${img}" style="border:6px solid #fbbf24;border-radius:16px;margin-top:16px"><script>setTimeout(()=>location.reload(),15000)</script></body>`);
});

// Botão de teste direto na tela
app.get('/testar', async (req, res) => {
  try {
    if (!conectado || !sock?.user?.id) return res.send('WhatsApp desconectado.');
    const meuJid = jidNormalizedUser(sock.user.id);
    await sock.sendMessage(meuJid, { text: '👑 *Teste Blindagem Social:* Seu sistema de notificações no WhatsApp está funcionando 100%!' });
    res.send(`✅ Mensagem enviada com sucesso para ${meuJid}! Confira seu WhatsApp.`);
  } catch (e) {
    res.status(500).send('Erro ao enviar: ' + e.message);
  }
});

// Rota interna chamada pelo painel.php
app.post('/notificar', async (req, res) => {
  try {
    if (req.headers['x-secret'] !== CHAVE_INTERNA) {
      return res.status(401).json({ erro: 'Nao autorizado' });
    }
    const texto = req.body.mensagem || '';
    if (!conectado || !sock?.user?.id || !texto) {
      return res.status(400).json({ erro: 'Zap desconectado ou vazio' });
    }
    const meuJid = jidNormalizedUser(sock.user.id);
    await sock.sendMessage(meuJid, { text: texto });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  }
});

iniciarZap();
app.listen(process.env.PORT || 3000, () => console.log('Servidor Zap rodando'));
