const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat');
const typingIndicator = document.getElementById('typing');

const N8N_WEBHOOK_URL = 'https://n8n.mplasesores.com/webhook/bold-pos-chat';
let history = JSON.parse(localStorage.getItem('bold_history')) || [];

window.onload = () => {
    if (history.length > 0) {
        history.forEach(msg => appendMsg(msg.role === 'user' ? 'user' : 'bot', msg.content));
    }
};

async function sendMessage(text = null) {
    const message = text || userInput.value.trim();
    if (!message) return;

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

        if (data.response) {
            appendMsg('bot', data.response);
            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: data.response });
            localStorage.setItem('bold_history', JSON.stringify(history.slice(-20)));
        }
    } catch (error) {
        typingIndicator.style.display = 'none';
        appendMsg('bot', 'Error de conexión con el servidor.');
    }
}

function appendMsg(type, text) {
    const div = document.createElement('div');
    div.className = `msg ${type}`;
    div.innerText = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function quickQuery(q) { sendMessage(q); }
sendBtn.onclick = () => sendMessage();
userInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
newChatBtn.onclick = () => { localStorage.removeItem('bold_history'); location.reload(); };