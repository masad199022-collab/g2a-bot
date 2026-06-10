const fetch = require('node-fetch');

const CONFIG = {
  G2A_EMAIL:    process.env.G2A_EMAIL,
  G2A_PASSWORD: process.env.G2A_PASSWORD,
  TG_TOKEN:     process.env.TG_TOKEN,
  TG_CHAT_ID:   process.env.TG_CHAT_ID,
  CHECK_INTERVAL: 60 * 1000,
  TOKEN_TTL: 23 * 60 * 60 * 1000,
};

let cachedToken = null;
let tokenExpiry = 0;
let lastOrders = null;
let lastMsgs = null;
let checkCount = 0;

function log(msg) {
  console.log('[' + new Date().toISOString() + '] ' + msg);
}

async function tg(text) {
  try {
    await fetch('https://api.telegram.org/bot' + CONFIG.TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: CONFIG.TG_CHAT_ID,
        text: text,
        parse_mode: 'HTML'
      })
    });
  } catch(e) { log('TG Error: ' + e.message); }
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  log('Refreshing G2A token...');
  try {
    const r = await fetch('https://api.g2a.com/v1/users/sign_in', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email: CONFIG.G2A_EMAIL, password: CONFIG.G2A_PASSWORD })
    });
    if (!r.ok) { log('Login failed: ' + r.status); return null; }
    const d = await r.json();
    const token = d.access_token || d.token;
    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + CONFIG.TOKEN_TTL;
      log('Token refreshed OK');
    }
    return token;
  } catch(e) { log('Error: ' + e.message); return null; }
}

async function check() {
  checkCount++;
  log('Check #' + checkCount);
  const token = await getToken();
  if (!token) return;

  const h = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  try {
    const or = await fetch('https://api.g2a.com/v1/seller/orders?status=pending&per_page=10', { headers: h });
    if (or.ok) {
      const d = await or.json();
      const orders = d.orders || d.data || [];
      const ids = orders.map(function(o) { return String(o.id); }).join(',');
      if (lastOrders !== null && ids !== lastOrders) {
        const prev = lastOrders.split(',');
        for (const o of orders) {
          if (!prev.includes(String(o.id))) {
            const msg = '🛒 <b>New G2A Order!</b>\n\nProduct: ' + (o.product_name || 'N/A') + '\nOrder: #' + o.id + '\nPrice: ' + (o.price || '') + ' ' + (o.currency || '') + '\n\n<a href="https://dashboard.g2a.com/store/your-offers">Open G2A Dashboard</a>';
            await tg(msg);
            log('New order: #' + o.id);
          }
        }
      }
      lastOrders = ids;
    }

    const mr = await fetch('https://api.g2a.com/v1/seller/conversations?status=unread&per_page=10', { headers: h });
    if (mr.ok) {
      const d = await mr.json();
      const msgs = d.conversations || d.data || [];
      const ids = msgs.map(function(m) { return String(m.id); }).join(',');
      if (lastMsgs !== null && ids !== lastMsgs) {
        const prev = lastMsgs.split(',');
        for (const m of msgs) {
          if (!prev.includes(String(m.id))) {
            const msg = '💬 <b>New Message from Buyer!</b>\n\nBuyer: ' + (m.buyer_username || 'N/A') + '\n\n<a href="https://dashboard.g2a.com/store/your-offers">Open G2A Dashboard</a>';
            await tg(msg);
            log('New message from: ' + (m.buyer_username || 'buyer'));
          }
        }
      }
      lastMsgs = ids;
    }

    log('Check OK');
  } catch(e) { log('Check error: ' + e.message); }
}

async function start() {
  log('G2A Bot started - KeyZon Ventures');
  await tg('🟢 <b>G2A Notifier is running!</b>\n\nMonitoring your orders and messages every minute.');
  await check();
  setInterval(check, CONFIG.CHECK_INTERVAL);
}

process.on('uncaughtException', function(e) { log('Exception: ' + e.message); });
process.on('unhandledRejection', function(e) { log('Rejection: ' + e); });

start();
