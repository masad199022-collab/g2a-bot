const fetch = require('node-fetch');

const CONFIG = {
  G2A_EMAIL:    process.env.G2A_EMAIL,
  G2A_PASSWORD: process.env.G2A_PASSWORD,
  TG_TOKEN:     process.env.TG_TOKEN,
  TG_CHAT_ID:   process.env.TG_CHAT_ID,
  CHECK_INTERVAL: 60 * 1000,
  TOKEN_TTL:    23 * 60 * 60 * 1000,
};

let cachedToken = null;
let tokenExpiry  = 0;
let lastOrders   = null;
let lastMsgs     = null;
let checkCount   = 0;

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString('ar-SA', {hour12:false})}] ${msg}`);
}

async function tg(text) {
  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: CONFIG.TG_CHAT_ID, text, parse_mode: 'HTML' })
    });
  } catch(e) { log('خطأ تيليجرام: ' + e.message); }
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  log('جارٍ تجديد جلسة G2A...');
  try {
    const r = await fetch('https://api.g2a.com/v1/users/sign_in', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email: CONFIG.G2A_EMAIL, password: CONFIG.G2A_PASSWORD })
    });
    if (!r.ok) { log('فشل: ' + r.status); return null; }
    const d = await r.json();
    const token = d?.access_token || d?.token;
    if (token) { cachedToken = token; tokenExpiry = Date.now() + CONFIG.TOKEN_TTL; log('تم تجديد الجلسة ✓'); }
    return token;
  } catch(e) { log('خطأ: ' + e.message); return null; }
}

async function check() {
  checkCount++;
  log(`فحص #${checkCount}...`);
  const token = await getToken();
  if (!token) return;
  const h = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
  try {
    const or = await fetch('https://api.g2a.com/v1/seller/orders?status=pending&per_page=10', { headers: h });
    if (or.ok) {
      const d = await or.json();
      const orders = d?.orders || d?.data || [];
      const ids = orders.map(o => Stri
