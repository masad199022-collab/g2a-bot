const fetch = require('node-fetch');

const CONFIG = {
  G2A_CLIENT_ID:     process.env.G2A_CLIENT_ID,
  G2A_CLIENT_SECRET: process.env.G2A_CLIENT_SECRET,
  TG_TOKEN:          process.env.TG_TOKEN,
  TG_CHAT_ID:        process.env.TG_CHAT_ID,
  CHECK_INTERVAL:    60 * 1000,
  TOKEN_TTL:         23 * 60 * 60 * 1000,
};

let cachedToken = null;
let tokenExpiry = 0;
let lastOrders = null;
let lastMsgs = null;
let lastReviews = null;
let checkCount = 0;

function log(msg) {
  console.log('[' + new Date().toISOString() + '] ' + msg);
}

async function tg(text) {
  try {
    await fetch('https://api.telegram.org/bot' + CONFIG.TG_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ chat_id: CONFIG.TG_CHAT_ID, text: text, parse_mode: 'HTML' })
    });
  } catch(e) { log('TG Error: ' + e.message); }
}

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  log('Refreshing G2A token...');
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', CONFIG.G2A_CLIENT_ID);
    params.append('client_secret', CONFIG.G2A_CLIENT_SECRET);

    const r = await fetch('https://api.g2a.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    log('Token status: ' + r.status);
    const text = await r.text();
    log('Token response: ' + text.substring(0, 300));

    const d = JSON.parse(text);
    const token = d.access_token || d.token;
    if (token) {
      cachedToken = token;
      tokenExpiry = Date.now() + CONFIG.TOKEN_TTL;
      log('Token OK');
    }
    return token;
  } catch(e) { log('Token error: ' + e.message); return null; }
}

async function check() {
  checkCount++;
  log('Check #' + checkCount);
  const token = await getToken();
  if (!token) { log('No token, skip'); return; }

  const h = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  try {
    const or = await fetch('https://api.g2a.com/v1/seller/orders?status=pending&per_page=10', { headers: h });
    log('Orders status: ' + or.status);
    if (or.ok) {
      const d = await or.json();
      const orders = d.orders || d.data || [];
      const ids = orders.map(function(o) { return String(o.id); }).join(',');
      if (lastOrders !== null && ids !== lastOrders) {
        const prev = lastOrders ? lastOrders.split(',') : [];
        for (const o of orders) {
          if (!prev.includes(String(o.id))) {
            await tg(
              '🛒 <b>طلب جديد!</b>\n\n' +
              '📦 المنتج: ' + (o.product_name || 'غير محدد') + '\n' +
              '🔢 رقم الطلب: #' + o.id + '\n' +
              '💰 السعر: ' + (o.price || '') + ' ' + (o.currency || '') + '\n' +
              '⏰ ' + new Date().toLocaleTimeString('ar-SA', {hour12:false}) + '\n\n' +
              '👉 <a href="https://dashboard.g2a.com/store/your-offers">افتح لوحة G2A</a>'
            );
            log('New order: #' + o.id);
          }
        }
      }
      lastOrders = ids;
    }

    const mr = await fetch('https://api.g2a.com/v1/seller/conversations?status=unread&per_page=10', { headers: h });
    log('Messages status: ' + mr.status);
    if (mr.ok) {
      const d = await mr.json();
      const msgs = d.conversations || d.data || [];
      const ids = msgs.map(function(m) { return String(m.id); }).join(',');
      if (lastMsgs !== null && ids !== lastMsgs) {
        const prev = lastMsgs ? lastMsgs.split(',') : [];
        for (const m of msgs) {
          if (!prev.includes(String(m.id))) {
            await tg(
              '💬 <b>رسالة جديدة من عميل!</b>\n\n' +
              '👤 العميل: ' + (m.buyer_username || 'غير محدد') + '\n' +
              '⏰ ' + new Date().toLocaleTimeString('ar-SA', {hour12:false}) + '\n\n' +
              '👉 <a href="https://dashboard.g2a.com/store/your-offers">افتح لوحة G2A</a>'
            );
            log('New message from: ' + (m.buyer_username || 'buyer'));
          }
        }
      }
      lastMsgs = ids;
    }

    const rr = await fetch('https://api.g2a.com/v1/seller/reviews?rating=1,2&per_page=10', { headers: h });
    log('Reviews status: ' + rr.status);
    if (rr.ok) {
      const d = await rr.json();
      const reviews = d.reviews || d.data || [];
      const ids = reviews.map(function(r) { return String(r.id); }).join(',');
      if (lastReviews !== null && ids !== lastReviews) {
        const prev = lastReviews ? lastReviews.split(',') : [];
        for (const r of reviews) {
          if (!prev.includes(String(r.id))) {
            const stars = r.rating == 1 ? '⭐' : '⭐⭐';
            await tg(
              '⚠️ <b>تقييم سلبي جديد!</b>\n\n' +
              stars + ' التقييم: ' + r.rating + '/5\n' +
              '👤 العميل: ' + (r.reviewer_username || 'غير محدد') + '\n' +
              '📝 التعليق: ' + (r.comment || 'بدون تعليق') + '\n' +
              '⏰ ' + new Date().toLocaleTimeString('ar-SA', {hour12:false}) + '\n\n' +
              '👉 <a href="https://dashboard.g2a.com/store/your-offers">افتح لوحة G2A</a>'
            );
            log('Negative review: ' + r.id);
          }
        }
      }
      lastReviews = ids;
    }

    log('Check OK');
  } catch(e) { log('Check error: ' + e.message); }
}

async function start() {
  log('G2A Bot started - KeyZon Ventures');
  await tg('🟢 <b>بوت G2A يعمل الآن!</b>\n\nيراقب:\n🛒 الطلبات الجديدة\n💬 رسائل العملاء\n⚠️ التقييمات السلبية\n\nفحص كل دقيقة.');
  await check();
  setInterval(check, CONFIG.CHECK_INTERVAL);
}

process.on('uncaughtException', function(e) { log('Exception: ' + e.message); });
process.on('unhandledRejection', function(e) { log('Rejection: ' + e); });

start();
