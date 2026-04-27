// ============================================
// Zyenx AI Chatbot Widget — Zyenx AI (Internal)
// Add to any page: <script src="YOUR_SERVER/widget.js"></script>
// ============================================

(function() {
  'use strict';

  const CONFIG = {
    apiUrl: https://zyenx-ai-production.up.railway.app/,
    botName: 'Zyenx AI (Internal) AI Assistant',
    welcomeMsg: 'Hi! 👋 I am the Zyenx AI (Internal) assistant. How can I help you today?',
    primaryColor: '#00ff88',
    darkColor: '#04040f',
    position: 'bottom-right'
  };

  let chatHistory = [];
  let isOpen = false;

  // ── STYLES ─────────────────────────────────
  const css = `
    #zai-toggle {
      position: fixed; bottom: 24px; right: 24px;
      width: 60px; height: 60px; border-radius: 50%;
      background: ${CONFIG.primaryColor}; color: ${CONFIG.darkColor};
      border: none; cursor: pointer; font-size: 28px;
      box-shadow: 0 4px 20px rgba(0,255,136,0.4);
      z-index: 99999; transition: all 0.3s ease;
      display: flex; align-items: center; justify-content: center;
    }
    #zai-toggle:hover { transform: scale(1.1); box-shadow: 0 6px 30px rgba(0,255,136,0.6); }
    #zai-window {
      position: fixed; bottom: 96px; right: 24px;
      width: 360px; height: 520px; border-radius: 20px;
      background: #0a0a1a; border: 1px solid rgba(0,255,136,0.2);
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      z-index: 99998; display: none; flex-direction: column;
      overflow: hidden; font-family: 'DM Sans', 'Segoe UI', sans-serif;
    }
    #zai-window.open { display: flex; animation: zaiSlideUp 0.3s ease; }
    @keyframes zaiSlideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .zai-header {
      background: linear-gradient(135deg, #04040f, #0a0a20);
      border-bottom: 1px solid rgba(0,255,136,0.15);
      padding: 16px 20px; display: flex; align-items: center; gap: 12px;
    }
    .zai-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: ${CONFIG.primaryColor}; display: flex;
      align-items: center; justify-content: center;
      font-size: 18px; font-weight: 700; color: #04040f; flex-shrink: 0;
    }
    .zai-bot-name { font-weight: 700; font-size: 14px; color: #f0f0ff; }
    .zai-status { font-size: 11px; color: ${CONFIG.primaryColor}; display: flex; align-items: center; gap: 5px; }
    .zai-dot { width: 6px; height: 6px; background: ${CONFIG.primaryColor}; border-radius: 50%; animation: blink 1.5s infinite; }
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
    .zai-close { margin-left: auto; background: none; border: none; color: #6b7280; cursor: pointer; font-size: 18px; padding: 4px; }
    .zai-messages {
      flex: 1; overflow-y: auto; padding: 16px;
      display: flex; flex-direction: column; gap: 10px;
      scrollbar-width: thin; scrollbar-color: rgba(0,255,136,0.3) transparent;
    }
    .zai-msg {
      max-width: 85%; padding: 10px 14px; border-radius: 14px;
      font-size: 13px; line-height: 1.5; word-break: break-word;
    }
    .zai-msg.bot {
      background: rgba(255,255,255,0.05); color: #d0d0e8;
      border: 1px solid rgba(255,255,255,0.08);
      align-self: flex-start; border-bottom-left-radius: 4px;
    }
    .zai-msg.user {
      background: ${CONFIG.primaryColor}; color: #04040f;
      font-weight: 600; align-self: flex-end; border-bottom-right-radius: 4px;
    }
    .zai-typing { display: flex; gap: 4px; padding: 12px 14px; }
    .zai-typing span {
      width: 7px; height: 7px; background: ${CONFIG.primaryColor};
      border-radius: 50%; animation: typing 1.2s infinite;
    }
    .zai-typing span:nth-child(2) { animation-delay: 0.2s; }
    .zai-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing { 0%,60%,100%{transform:translateY(0)} 30%{transform:translateY(-8px)} }
    .zai-input-row {
      padding: 14px; border-top: 1px solid rgba(255,255,255,0.06);
      display: flex; gap: 10px; align-items: flex-end;
    }
    .zai-input {
      flex: 1; background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1); border-radius: 10px;
      padding: 10px 14px; color: #f0f0ff; font-size: 13px;
      outline: none; resize: none; max-height: 80px;
      font-family: inherit; line-height: 1.4;
    }
    .zai-input:focus { border-color: rgba(0,255,136,0.4); }
    .zai-input::placeholder { color: #4b5563; }
    .zai-send {
      width: 38px; height: 38px; background: ${CONFIG.primaryColor};
      color: #04040f; border: none; border-radius: 10px;
      cursor: pointer; font-size: 16px; flex-shrink: 0;
      transition: all 0.2s; display: flex; align-items: center; justify-content: center;
    }
    .zai-send:hover { background: #00cc6a; transform: scale(1.05); }
    .zai-powered {
      text-align: center; padding: 6px;
      font-size: 10px; color: #374151; border-top: 1px solid rgba(255,255,255,0.04);
    }
    .zai-powered a { color: ${CONFIG.primaryColor}; text-decoration: none; }
    @media(max-width:480px) {
      #zai-window { width: calc(100vw - 20px); right: 10px; bottom: 80px; }
    }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── HTML ────────────────────────────────────
  const toggle = document.createElement('button');
  toggle.id = 'zai-toggle';
  toggle.innerHTML = '💬';
  toggle.title = 'Chat with us';

  const win = document.createElement('div');
  win.id = 'zai-window';
  win.innerHTML = `
    <div class="zai-header">
      <div class="zai-avatar">AI</div>
      <div>
        <div class="zai-bot-name">${CONFIG.botName}</div>
        <div class="zai-status"><div class="zai-dot"></div>Online — Ready to help</div>
      </div>
      <button class="zai-close" onclick="document.getElementById('zai-window').classList.remove('open');document.getElementById('zai-toggle').innerHTML='💬'">✕</button>
    </div>
    <div class="zai-messages" id="zai-msgs">
      <div class="zai-msg bot">${CONFIG.welcomeMsg}</div>
    </div>
    <div class="zai-input-row">
      <textarea class="zai-input" id="zai-input" placeholder="Ask me anything..." rows="1"></textarea>
      <button class="zai-send" id="zai-send">➤</button>
    </div>
    <div class="zai-powered">Powered by <a href="https://zyenxai.com" target="_blank">Zyenx AI</a></div>
  `;

  document.body.appendChild(toggle);
  document.body.appendChild(win);

  // ── TOGGLE ──────────────────────────────────
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    toggle.innerHTML = isOpen ? '✕' : '💬';
    if (isOpen) document.getElementById('zai-input').focus();
  });

  // ── SEND MESSAGE ────────────────────────────
  async function sendMessage() {
    const input = document.getElementById('zai-input');
    const msgs = document.getElementById('zai-msgs');
    const text = input.value.trim();
    if (!text) return;

    // Show user message
    msgs.innerHTML += `<div class="zai-msg user">${escapeHtml(text)}</div>`;
    input.value = '';
    input.style.height = 'auto';
    msgs.scrollTop = msgs.scrollHeight;

    // Add to history
    chatHistory.push({ role: 'user', content: text });

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    msgs.innerHTML += `<div class="zai-msg bot zai-typing" id="${typingId}">
      <span></span><span></span><span></span>
    </div>`;
    msgs.scrollTop = msgs.scrollHeight;

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: chatHistory.slice(-10) })
      });

      const data = await response.json();
      const reply = data.reply || 'Thank you! We will get back to you shortly.';

      // Remove typing, show reply
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      msgs.innerHTML += `<div class="zai-msg bot">${escapeHtml(reply)}</div>`;

      // Save to history
      chatHistory.push({ role: 'assistant', content: reply });
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    } catch (err) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      msgs.innerHTML += `<div class="zai-msg bot">Sorry, I am having trouble right now. Please WhatsApp us directly for immediate help.</div>`;
    }

    msgs.scrollTop = msgs.scrollHeight;
  }

  // ── EVENTS ──────────────────────────────────
  document.getElementById('zai-send').addEventListener('click', sendMessage);
  document.getElementById('zai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  document.getElementById('zai-input').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

})();