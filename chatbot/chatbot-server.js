// ============================================
// ZYENX AI: Chatbot Server
// Supports: text, image uploads, reference URLs
// ============================================

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const AGENCY_URL = process.env.AGENCY_URL || 'https://zyenx-agency-production.up.railway.app';

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));

// ============================================
// SYSTEM PROMPT
// ============================================
const SYSTEM_PROMPT = `You are Zya, the AI assistant for Zyenx AI Agency.
You are friendly, professional, and helpful.

ABOUT ZYENX AI:
- AI agent creation and automation agency
- Specialized AI agents build business automations 24/7
- Fast delivery, honest pricing, quality guaranteed

OUR SERVICES AND PRICES:
- Starter AI Agent: $197 one time — website chat widget, lead capture, Discord notifications
- Business AI Agent: $397 one time — all Starter + Google Sheets CRM + appointment booking
- Advanced AI Agent: $697 one time — all Business + WhatsApp + Google Calendar + payments
- WhatsApp AI Agent: $497 one time — full WhatsApp automation
- Custom AI Agent: starting $997 — custom automations and integrations
- Monthly Maintenance: $49/month optional — updates and monitoring

OUR POLICIES:
- 50% advance payment before work starts
- 1 month free support after delivery
- Full refund if deadline is missed
- We do not build gambling or adult content

CONTACT:
- Email: zyenxai@gmail.com
- WhatsApp: +923216830225

YOUR JOB:
Collect ALL of these things ONE BY ONE in a natural conversation. Ask each question separately — never ask two things at once:

STEP 1: Their full name
STEP 2: Their email address
STEP 3: Which AI agent service they want
STEP 4: Their business/project name
STEP 5: What does their business do and what process should be automated?

--- BUSINESS AUTOMATION QUESTIONS ---

A1: Where should the agent run? (website chat widget, WhatsApp, or both)
A2: What services/products does your business offer?
A3: What business hours should the agent follow?
A4: Should it book appointments, capture leads, take orders, or all?
A5: What must the agent always do and never do?

--- CONTINUE FOR ALL SERVICES ---

STEP 6: Contact details — phone number, WhatsApp, social media links (Instagram, Facebook, TikTok, etc.)
STEP 7: Color preference (dark, white, colorful, luxury, minimal)
STEP 8: Reference URL or image (optional) — any style/tone reference they like
STEP 9: Logo text, tagline, and any special features (booking form, live chat, payment, Google Maps, etc.)

After collecting everything, summarize it all back and ask "Is everything correct? Shall I place your order?"

REPLY STYLE:
- ALWAYS reply in 1-2 short sentences only
- One idea per reply
- Never use bullet points or lists
- Always end with one short question

ORDER SUBMISSION RULE:
Once the client CONFIRMS everything is correct, append this tag on its own line at the very end of your reply:
[ORDER:{"name":"FULL_NAME","email":"EMAIL","service":"SERVICE_NAME","requirements":"COMPLETE_REQUIREMENTS_INCLUDING_BUSINESS_NAME_PAGES_CONTENT_COLORS_PHONE_SOCIAL_LINKS_SPECIAL_FEATURES","referenceUrl":"URL_OR_NONE"}]

In the requirements field, include ALL collected info: business name, what it does, automation goals, channel, services, hours, phone, social links, color preferences, and special features. Make it a complete detailed brief.
Only add the tag when the client explicitly confirms.

IMPORTANT: After the ORDER tag, do NOT say "agents are building now". The client will be given a content form link. Do not mention agents starting yet.`;

// ============================================
// DETECT AND FETCH REFERENCE URL FROM TEXT
// ============================================
async function fetchUrlContext(message) {
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return null;

  const url = urlMatch[0];
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZyenxAI/1.0)' },
      signal: controller.signal
    });
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 2500);

    return { url, text };
  } catch {
    return null;
  }
}

// ============================================
// CHAT ENDPOINT
// ============================================
app.post('/chat', async (req, res) => {
  try {
    const { message = '', history = [], image } = req.body;

    if (!message && !image) {
      return res.status(400).json({ error: 'Message or image required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.json({
        reply: 'Hi! I am Zya from Zyenx AI. Our API is being configured. Please email us at zyenxai@gmail.com for immediate help!'
      });
    }

    // Build user content — supports text + image
    let userContent;
    if (image && image.base64) {
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType || 'image/jpeg',
            data: image.base64
          }
        },
        {
          type: 'text',
          text: message || 'I have shared a reference image for my project.'
        }
      ];
    } else {
      userContent = message;
    }

    // Detect URL in message and fetch context
    let systemPrompt = SYSTEM_PROMPT;
    if (message) {
      const urlContext = await fetchUrlContext(message);
      if (urlContext) {
        systemPrompt += `\n\nCLIENT SHARED REFERENCE WEBSITE (${urlContext.url}):\n${urlContext.text}\n\nAcknowledge you can see this reference website. Tell the client you have analyzed it and it will help build exactly what they want.`;
      }
    }

    const messages = [
      ...history.slice(-10),
      { role: 'user', content: userContent }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: systemPrompt,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Chatbot] API error:', err);
      return res.json({ reply: 'Sorry, having a technical issue. Please WhatsApp us at +923216830225!' });
    }

    const data = await response.json();
    let reply = data.content[0].text;

    // ============================================
    // DETECT ORDER TAG
    // ============================================
    const orderMatch = reply.match(/\[ORDER:(\{[\s\S]*?\})\]/);
    let orderId = null;
    let contentFormUrl = null;

    if (orderMatch) {
      reply = reply.replace(/\[ORDER:[\s\S]*?\]/, '').trim();

      try {
        const orderData = JSON.parse(orderMatch[1]);
        console.log('[Chatbot] Order detected:', orderData);

        const agencyRes = await fetch(`${AGENCY_URL}/api/orders/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientName: orderData.name || '',
            clientEmail: orderData.email || '',
            service: orderData.service || '',
            requirements: orderData.requirements || '',
            referenceUrl: orderData.referenceUrl && orderData.referenceUrl !== 'NONE' ? orderData.referenceUrl : '',
            referenceImages: image ? [{ base64: image.base64, mediaType: image.mediaType }] : [],
            amountPaid: 0,
            paymentStatus: 'pending',
            waitForContent: true
          })
        });

        const agencyData = await agencyRes.json();

        if (agencyData.success) {
          orderId = agencyData.orderId;
          contentFormUrl = `${AGENCY_URL}/content-form.html?projectId=${orderId}&name=${encodeURIComponent(orderData.name || '')}&email=${encodeURIComponent(orderData.email || '')}&service=${encodeURIComponent(orderData.service || '')}`;
          reply = `Your order is registered! Your Order ID is ${orderId}. One last step — please fill the content form below so our agents know your business details and automation rules. It takes about 5 minutes.`;
          console.log('[Chatbot] Order submitted:', orderId);
        } else {
          reply += ' Your order details have been received. We will contact you within 1-2 hours.';
        }

      } catch (e) {
        console.error('[Chatbot] Order submission error:', e.message);
        reply += ' Your order details have been received. We will contact you within 1-2 hours.';
      }
    }

    const historyText = image ? (message || 'Reference image shared') : message;
    const updatedHistory = [
      ...history,
      { role: 'user', content: historyText },
      { role: 'assistant', content: reply }
    ];

    res.json({ reply, history: updatedHistory, orderId, contentFormUrl });

  } catch (error) {
    console.error('[Chatbot] Error:', error.message);
    res.json({ reply: 'Sorry, having trouble. Please WhatsApp us at +923216830225 or email zyenxai@gmail.com!' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'online', bot: 'Zya — Zyenx AI', agencyUrl: AGENCY_URL });
});

// ============================================
// SERVE WIDGET
// ============================================
app.get('/widget.js', (req, res) => {
  const serverUrl = process.env.SERVER_URL || `https://${req.headers.host}`;
  res.setHeader('Content-Type', 'application/javascript');
  res.send(buildWidget(serverUrl));
});

// ============================================
// START
// ============================================
app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  Zyenx AI Chatbot Server: ONLINE');
  console.log('========================================');
  console.log(`  Port:       ${PORT}`);
  console.log(`  Agency:     ${AGENCY_URL}`);
  console.log('========================================\n');
});

// ============================================
// WIDGET CODE
// ============================================
function buildWidget(serverUrl) {
  return `(function() {
  'use strict';

  var CONFIG = {
    apiUrl: '${serverUrl}/chat',
    botName: 'Zya — Zyenx AI',
    welcomeMsg: 'Hi! I am Zya from Zyenx AI. How can I help you today? Ask me about our services or get started with your project!',
    color: '#00ff88',
    dark: '#04040f'
  };

  var chatHistory = [];
  var isOpen = false;
  var attachedImage = null;

  // ---- STYLES ----
  var style = document.createElement('style');
  style.textContent = [
    '#zai-btn{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:' + CONFIG.color + ';color:' + CONFIG.dark + ';border:none;cursor:pointer;font-size:26px;box-shadow:0 4px 20px rgba(0,255,136,0.4);z-index:99999;transition:all .3s;display:flex;align-items:center;justify-content:center}',
    '#zai-btn:hover{transform:scale(1.1)}',
    '#zai-win{position:fixed;bottom:96px;right:24px;width:360px;height:540px;border-radius:20px;background:#0a0a1a;border:1px solid rgba(0,255,136,0.2);box-shadow:0 20px 60px rgba(0,0,0,0.5);z-index:99998;display:none;flex-direction:column;overflow:hidden;font-family:sans-serif}',
    '#zai-win.open{display:flex}',
    '.zh{background:#04040f;border-bottom:1px solid rgba(0,255,136,0.15);padding:14px 18px;display:flex;align-items:center;gap:10px}',
    '.za{width:36px;height:36px;border-radius:50%;background:' + CONFIG.color + ';display:flex;align-items:center;justify-content:center;font-weight:700;color:' + CONFIG.dark + ';font-size:14px;flex-shrink:0}',
    '.zn{font-weight:700;font-size:13px;color:#f0f0ff}',
    '.zs{font-size:11px;color:' + CONFIG.color + '}',
    '.zc{margin-left:auto;background:none;border:none;color:#6b7280;cursor:pointer;font-size:18px;padding:4px}',
    '.zm{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}',
    '.zm::-webkit-scrollbar{width:4px}.zm::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:2px}',
    '.msg{max-width:85%;padding:10px 14px;border-radius:14px;font-size:13px;line-height:1.6;word-break:break-word;white-space:pre-wrap}',
    '.bot{background:rgba(255,255,255,.05);color:#d0d0e8;border:1px solid rgba(255,255,255,.08);align-self:flex-start;border-bottom-left-radius:4px}',
    '.usr{background:' + CONFIG.color + ';color:' + CONFIG.dark + ';font-weight:600;align-self:flex-end;border-bottom-right-radius:4px}',
    '.usr img{max-width:180px;border-radius:8px;display:block;margin-top:6px}',
    '.order-card{background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.3);border-radius:12px;padding:12px 14px;align-self:flex-start;max-width:90%;font-size:13px;color:#00ff88;line-height:1.6}',
    '.typing{display:flex;gap:4px;padding:12px 14px}',
    '.typing span{width:7px;height:7px;background:' + CONFIG.color + ';border-radius:50%;animation:tp 1.2s infinite}',
    '.typing span:nth-child(2){animation-delay:.2s}.typing span:nth-child(3){animation-delay:.4s}',
    '@keyframes tp{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-8px)}}',
    '.zprev{padding:0 12px;display:none;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,.04)}',
    '.zprev.show{display:flex}',
    '.zprev img{height:52px;width:52px;object-fit:cover;border-radius:6px;border:1px solid rgba(0,255,136,.3);margin:6px 0}',
    '.zprev-del{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.3);color:#ef4444;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.zprev-lbl{font-size:11px;color:rgba(0,255,136,.7);flex:1}',
    '.zi{padding:10px 12px;border-top:1px solid rgba(255,255,255,.06);display:flex;gap:8px;align-items:center}',
    '.zplus{width:34px;height:34px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:9px;color:#6b7280;cursor:pointer;font-size:20px;font-weight:300;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;line-height:1}',
    '.zplus:hover{background:rgba(0,255,136,.1);border-color:rgba(0,255,136,.4);color:' + CONFIG.color + '}',
    '.zi input{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:9px 13px;color:#f0f0ff;font-size:13px;outline:none;min-width:0}',
    '.zi input:focus{border-color:rgba(0,255,136,.4)}',
    '.zi input::placeholder{color:#4b5563}',
    '.zb{width:36px;height:36px;background:' + CONFIG.color + ';color:' + CONFIG.dark + ';border:none;border-radius:10px;cursor:pointer;font-size:17px;flex-shrink:0;transition:all .2s;display:flex;align-items:center;justify-content:center}',
    '.zb:hover{background:#00cc6a}',
    '.zp{text-align:center;padding:5px;font-size:10px;color:#374151;border-top:1px solid rgba(255,255,255,.04)}',
    '.zp a{color:' + CONFIG.color + ';text-decoration:none}',
    '@media(max-width:480px){#zai-win{width:calc(100vw - 20px);right:10px;bottom:84px}}'
  ].join('');
  document.head.appendChild(style);

  // ---- BUTTON ----
  var btn = document.createElement('button');
  btn.id = 'zai-btn';
  btn.innerHTML = '&#x1F4AC;';

  // ---- WINDOW ----
  var win = document.createElement('div');
  win.id = 'zai-win';
  win.innerHTML = [
    '<div class="zh">',
      '<div class="za">AI</div>',
      '<div><div class="zn">' + CONFIG.botName + '</div><div class="zs">&#9679; Online</div></div>',
      '<button class="zc" id="zai-close">&#x2715;</button>',
    '</div>',
    '<div class="zm" id="zai-msgs"><div class="msg bot">' + CONFIG.welcomeMsg + '</div></div>',
    '<div class="zprev" id="zai-prev"></div>',
    '<div class="zi">',
      '<button class="zplus" id="zai-attach" title="Attach image or screenshot">+</button>',
      '<input id="zai-inp" placeholder="Ask or paste a reference link..." />',
      '<button class="zb" id="zai-send">&#x27A4;</button>',
    '</div>',
    '<input type="file" id="zai-file" accept="image/*" style="display:none"/>',
    '<div class="zp">Powered by <a href="https://zyenxai.com" target="_blank">Zyenx AI</a></div>'
  ].join('');

  document.body.appendChild(btn);
  document.body.appendChild(win);

  // ---- OPEN / CLOSE ----
  btn.addEventListener('click', function() {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    btn.innerHTML = isOpen ? '&#x2715;' : '&#x1F4AC;';
    if (isOpen) document.getElementById('zai-inp').focus();
  });

  document.getElementById('zai-close').addEventListener('click', function() {
    isOpen = false;
    win.classList.remove('open');
    btn.innerHTML = '&#x1F4AC;';
  });

  // ---- ATTACH IMAGE ----
  document.getElementById('zai-attach').addEventListener('click', function() {
    document.getElementById('zai-file').click();
  });

  document.getElementById('zai-file').addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large. Please use an image under 5MB.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev) {
      var full = ev.target.result;
      var base64 = full.split(',')[1];
      var mediaType = file.type || 'image/jpeg';
      attachedImage = { base64, mediaType };

      var prev = document.getElementById('zai-prev');
      prev.className = 'zprev show';
      prev.innerHTML = '<img src="' + full + '" /><span class="zprev-lbl">Reference image ready to send</span><button class="zprev-del" id="zai-del">&#x2715;</button>';
      document.getElementById('zai-del').addEventListener('click', clearAttached);
    };
    reader.readAsDataURL(file);
  });

  function clearAttached() {
    attachedImage = null;
    var prev = document.getElementById('zai-prev');
    prev.className = 'zprev';
    prev.innerHTML = '';
    document.getElementById('zai-file').value = '';
  }

  // ---- HELPERS ----
  function escHtml(t) {
    return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function addMsg(cls, html) {
    var msgs = document.getElementById('zai-msgs');
    var div = document.createElement('div');
    div.className = 'msg ' + cls;
    div.innerHTML = html;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  // ---- SEND MESSAGE ----
  async function sendMsg() {
    var inp = document.getElementById('zai-inp');
    var text = inp.value.trim();
    if (!text && !attachedImage) return;

    var displayText = escHtml(text || 'Reference image attached');

    // Show user bubble
    if (attachedImage) {
      var imgSrc = 'data:' + attachedImage.mediaType + ';base64,' + attachedImage.base64;
      addMsg('usr', (text ? displayText + '<br/>' : '') + '<img src="' + imgSrc + '" alt="reference"/>');
    } else {
      addMsg('usr', displayText);
    }

    chatHistory.push({ role: 'user', content: text || 'Reference image shared' });
    inp.value = '';

    // Typing indicator
    var tid = 'tp' + Date.now();
    var tp = document.createElement('div');
    tp.className = 'msg bot typing';
    tp.id = tid;
    tp.innerHTML = '<span></span><span></span><span></span>';
    document.getElementById('zai-msgs').appendChild(tp);
    document.getElementById('zai-msgs').scrollTop = 99999;

    // Build request
    var reqBody = {
      message: text || 'I have shared a reference image for my project.',
      history: chatHistory.slice(-10)
    };
    if (attachedImage) {
      reqBody.image = { base64: attachedImage.base64, mediaType: attachedImage.mediaType };
      clearAttached();
    }

    try {
      var r = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      var d = await r.json();
      var reply = d.reply || 'Thank you! We will get back to you soon.';
      var el = document.getElementById(tid);
      if (el) el.remove();

      if (d.orderId) {
        var card = '&#x1F389; Order Confirmed!<br/>&#x1F4CB; Order ID: <strong>' + escHtml(d.orderId) + '</strong><br/><br/>' + escHtml(reply);
        if (d.contentFormUrl) {
          card += '<br/><br/><a href="' + d.contentFormUrl + '" target="_blank" style="display:inline-block;background:#00e87a;color:#04040f;padding:11px 20px;border-radius:8px;font-weight:700;text-decoration:none;font-size:13px;margin-top:4px">Fill Content Form &#x2192;</a>';
        }
        addMsg('order-card', card);
      } else {
        addMsg('bot', escHtml(reply));
      }

      chatHistory.push({ role: 'assistant', content: reply });
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    } catch(e) {
      var el2 = document.getElementById(tid);
      if (el2) el2.remove();
      addMsg('bot', 'Sorry, having trouble connecting. Please WhatsApp us directly!');
    }
  }

  document.getElementById('zai-send').addEventListener('click', sendMsg);
  document.getElementById('zai-inp').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMsg();
  });

})();`;
}
