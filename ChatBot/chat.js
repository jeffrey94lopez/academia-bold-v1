const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat');
const typingIndicator = document.getElementById('typing');

const N8N_WEBHOOK_URL = 'https://n8n.mplasesores.com/webhook/bold-pos-chat';
const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ';
const ABANDON_URL = 'https://n8n.mplasesores.com/webhook/bodi-abandon';

let history = JSON.parse(localStorage.getItem('bold_history')) || [];
let conversationId = null;
let _creatingConversation = false;
let sessionMessages = [];

window.onload = () => {
    if (history.length > 0) {
        history.forEach(msg => appendMsg(msg.role === 'user' ? 'user' : 'bot', msg.content));
    }
};

async function createConversation() {
    if (_creatingConversation) return;
    _creatingConversation = true;
    const sessionId = localStorage.getItem('bold_session_id') || crypto.randomUUID();
    localStorage.setItem('bold_session_id', sessionId);
    const id = crypto.randomUUID();
    try {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/bodi_conversations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ id, session_id: sessionId, messages: [], status: 'active' })
        });
        if (!res.ok) throw new Error(`Supabase POST failed: ${res.status}`);
        conversationId = id;
    } catch (e) {
        console.warn('createConversation failed:', e.message);
        conversationId = null;
    } finally {
        _creatingConversation = false;
    }
}

async function upsertConversation(patch) {
    if (!conversationId) return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/bodi_conversations?id=eq.${conversationId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(patch)
        });
    } catch (_) {}
}

async function resolveConversation(resolved, btnsEl) {
    btnsEl.remove();
    await upsertConversation({
        resolved,
        status: 'completed',
        ended_at: new Date().toISOString()
    });
    conversationId = null;
    sessionMessages = [];
}

async function sendMessage(text = null) {
    const message = text || userInput.value.trim();
    if (!message) return;

    if (!conversationId) await createConversation();

    appendMsg('user', message);
    userInput.value = '';
    typingIndicator.style.display = 'block';

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': 'BoldBodi-2026-K9xMvP7q' },
            body: JSON.stringify({ message, history })
        });

        const data = await response.json();
        typingIndicator.style.display = 'none';

        const reply = data.response || 'No pude procesar tu pregunta. Intenta de nuevo.';
        appendMsg('bot', reply, true);
        if (data.media && data.media.length) appendMedia(data.media);
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: reply });
        localStorage.setItem('bold_history', JSON.stringify(history.slice(-20)));
        sessionMessages.push({ role: 'user', content: message });
        sessionMessages.push({ role: 'assistant', content: reply });

        await upsertConversation({
            messages: sessionMessages,
            topic: data.topic || null,
            sentiment: data.sentiment ?? 'neutro',
            support_redirected: data.support_redirected || false
        });
    } catch (error) {
        typingIndicator.style.display = 'none';
        appendMsg('bot', 'Error de conexión con el servidor.');
    }
}

function appendMsg(type, text, showResolution = false) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerText = text;
    chatBox.appendChild(div);

    if (type === 'bot' && showResolution) {
        document.querySelectorAll('.resolution-btns').forEach(el => el.remove());
        const btns = document.createElement('div');
        btns.className = 'resolution-btns';
        btns.innerHTML = `
            <span class="resolution-label">¿Logré resolver tu duda?</span>
            <button class="res-btn res-yes">✓ Sí</button>
            <button class="res-btn res-no">✗ No</button>
        `;
        btns.querySelector('.res-yes').onclick = () => resolveConversation(true, btns);
        btns.querySelector('.res-no').onclick  = () => resolveConversation(false, btns);
        chatBox.appendChild(btns);
    }

    chatBox.scrollTop = chatBox.scrollHeight;
}

function appendMedia(mediaItems) {
    if (!mediaItems || !mediaItems.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-media';

    mediaItems.forEach(function(item) {
        if (item.type === 'image' && item.url) {
            const imgWrap = document.createElement('div');
            imgWrap.className = 'chat-img-wrap';
            const img = document.createElement('img');
            img.src = item.url;
            img.alt = item.caption || '';
            img.onclick = () => openLightbox(item.url, item.caption || '');
            imgWrap.appendChild(img);
            if (item.caption) {
                const cap = document.createElement('p');
                cap.className = 'chat-media-caption';
                cap.textContent = item.caption;
                imgWrap.appendChild(cap);
            }
            wrap.appendChild(imgWrap);

        } else if (item.type === 'video' && item.url) {
            let embedUrl = null;
            try {
                const u = new URL(item.url);
                if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) {
                    embedUrl = 'https://www.youtube.com/embed/' + u.searchParams.get('v');
                } else if (u.hostname === 'youtu.be') {
                    embedUrl = 'https://www.youtube.com/embed/' + u.pathname.slice(1);
                } else if (u.hostname.includes('youtube.com') && u.pathname.startsWith('/embed/')) {
                    embedUrl = item.url;
                }
            } catch(_) {}
            if (!embedUrl) return;
            const vidWrap = document.createElement('div');
            vidWrap.className = 'chat-video-wrap';
            const iframe = document.createElement('iframe');
            iframe.src = embedUrl;
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
            iframe.allowFullscreen = true;
            vidWrap.appendChild(iframe);
            if (item.label) {
                const lbl = document.createElement('p');
                lbl.className = 'chat-media-caption';
                lbl.textContent = item.label;
                vidWrap.appendChild(lbl);
            }
            wrap.appendChild(vidWrap);
        }
    });

    if (wrap.children.length) {
        chatBox.appendChild(wrap);
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

function openLightbox(url, caption) {
    let lb = document.getElementById('bodi-lightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'bodi-lightbox';
        lb.innerHTML = `
            <div id="bodi-lb-backdrop"></div>
            <div id="bodi-lb-content">
                <img id="bodi-lb-img" src="" alt="">
                <p id="bodi-lb-caption"></p>
                <div id="bodi-lb-actions">
                    <button id="bodi-lb-download" title="Descargar">⬇ Descargar</button>
                    <button id="bodi-lb-close" title="Cerrar">✕ Cerrar</button>
                </div>
            </div>`;
        document.body.appendChild(lb);
        lb.querySelector('#bodi-lb-backdrop').onclick = closeLightbox;
        lb.querySelector('#bodi-lb-close').onclick = closeLightbox;
        lb.querySelector('#bodi-lb-download').onclick = () => downloadImage(
            lb.querySelector('#bodi-lb-img').src,
            lb.querySelector('#bodi-lb-img').alt || 'imagen'
        );
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
    }
    lb.querySelector('#bodi-lb-img').src = url;
    lb.querySelector('#bodi-lb-img').alt = caption;
    lb.querySelector('#bodi-lb-caption').textContent = caption;
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('bodi-lightbox');
    if (lb) lb.style.display = 'none';
    document.body.style.overflow = '';
}

async function downloadImage(url, name) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const ext = blob.type.split('/')[1] || 'jpg';
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.' + ext;
        a.click();
        URL.revokeObjectURL(a.href);
    } catch(_) {
        window.open(url, '_blank');
    }
}

window.addEventListener('beforeunload', () => {
    if (!conversationId) return;
    navigator.sendBeacon(
        ABANDON_URL,
        new Blob([JSON.stringify({ conversationId })], { type: 'application/json' })
    );
});

function quickQuery(q) { sendMessage(q); }
sendBtn.onclick = () => sendMessage();
userInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
newChatBtn.onclick = () => {
    localStorage.removeItem('bold_history');
    conversationId = null;
    sessionMessages = [];
    location.reload();
};
