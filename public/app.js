const socket = io();

let myDeviceId = localStorage.getItem('catchmind_uid');
if (!myDeviceId) {
    myDeviceId = Math.random().toString(36).substr(2, 10);
    localStorage.setItem('catchmind_uid', myDeviceId);
}

const screenHome = document.getElementById('screen-home');
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');
const screenResult = document.getElementById('screen-result'); 

const btnCreateRoom = document.getElementById('btn-create-room');
const inviteBox = document.getElementById('invite-box');
const btnCopy = document.getElementById('btn-copy');
const btnStartGame = document.getElementById('btn-start-game');
const lobbyPlayerList = document.getElementById('lobby-player-list');
const lobbySettings = document.getElementById('lobby-settings');
const inputRounds = document.getElementById('input-rounds');
const maxWordsSpan = document.getElementById('max-words-span');
const resultLeaderboard = document.getElementById('result-leaderboard'); 

const btnHostRetry = document.getElementById('btn-host-retry'); 
const btnPlayerExit = document.getElementById('btn-player-exit'); 

const canvas = document.getElementById('board'); const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status'); const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input'); const scoreList = document.getElementById('score-list');
const leftToolbar = document.getElementById('left-toolbar'); const palette = document.getElementById('palette');
const eraserBtn = document.getElementById('eraser-btn'); const passBtn = document.getElementById('pass-btn');
const refPanel = document.getElementById('host-reference-panel'); const refImg = document.getElementById('reference-img');
const noRefText = document.getElementById('no-ref-text');

let currentRoomId = null; let myId = null; let amIHost = false;
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
const actionParam = urlParams.get('action');

socket.on('connect', () => {
    myId = socket.id;
    if (roomParam) { currentRoomId = roomParam; socket.emit('join_room', currentRoomId, myDeviceId); showScreen(screenLobby); } 
    else if (actionParam === 'host_retry') { socket.emit('create_room'); window.history.replaceState({}, '', '/'); }
});

function showScreen(screen) {
    screenHome.classList.remove('active-screen'); screenLobby.classList.remove('active-screen'); 
    screenGame.classList.remove('active-screen'); screenResult.classList.remove('active-screen');
    screen.classList.add('active-screen');
}

btnCreateRoom.onclick = () => { socket.emit('create_room'); };
socket.on('room_created', (roomId) => {
    currentRoomId = roomId; window.history.pushState({}, '', `?room=${roomId}`);
    socket.emit('join_room', roomId, myDeviceId); showScreen(screenLobby);
});
btnCopy.onclick = () => { navigator.clipboard.writeText(window.location.href); btnCopy.innerText = "복사 완료!"; setTimeout(() => btnCopy.innerText = "링크 복사", 2000); };

btnStartGame.onclick = () => { socket.emit('start_game', currentRoomId, parseInt(inputRounds.value)); };

btnHostRetry.onclick = () => {
    socket.emit('host_retry_action', currentRoomId);
    window.location.href = '/?action=host_retry';
};
btnPlayerExit.onclick = () => { window.location.href = '/'; };

socket.on('go_to_main', (msg) => { alert(msg); window.location.href = '/'; });

socket.on('update_room_state', (data) => {
    amIHost = (data && socket.id === data.hostId);
    if (!data) return;
    
    if (data.state === 'lobby') {
        showScreen(screenLobby);
        inviteBox.innerText = window.location.href;
        
        if (amIHost) {
            btnStartGame.style.display = 'block'; lobbySettings.style.display = 'block';
            inputRounds.max = data.totalWords; maxWordsSpan.innerText = data.totalWords;
        } else {
            btnStartGame.style.display = 'none'; lobbySettings.style.display = 'none';
        }
        
        lobbyPlayerList.innerHTML = '';
        for (const id in data.players) {
            const p = data.players[id]; const isMe = (id === socket.id); const isHost = (id === data.hostId);
            const nameSpan = isMe ? `<span class="my-name-highlight">${isHost ? '👑 ' : '👤 '} ${p.name} (나)</span>` : `<span>${isHost ? '👑 ' : '👤 '} ${p.name}</span>`;
            let html = `<li class="lobby-player-item">${nameSpan}<div>`;
            if (isMe || amIHost) html += `<button class="btn btn-small" onclick="changeName('${id}')">이름변경</button>`;
            if (amIHost && !isMe) html += `<button class="btn btn-small btn-danger" onclick="kickPlayer('${id}')">강퇴</button>`;
            html += `</div></li>`; lobbyPlayerList.innerHTML += html;
        }
    } 
    else if (data.state === 'playing') {
        showScreen(screenGame);
        scoreList.innerHTML = '';
        for (const id in data.players) {
            const p = data.players[id]; const isMe = (id === socket.id);
            const hostTag = (id === data.hostId) ? '🎨 ' : '👤 ';
            const nameRender = isMe ? `<span class="my-name-highlight">${hostTag}${p.name} (나)</span>` : `<span>${hostTag}${p.name}</span>`;
            let html = `<div class="player-item"><div>${nameRender} <strong>${p.score} 점</strong></div>`;
            if (amIHost && !isMe) html += `<button class="btn btn-small btn-danger" onclick="kickPlayer('${id}')">강퇴</button>`;
            html += `</div>`; scoreList.innerHTML += html;
        }

        if (amIHost) { leftToolbar.style.visibility = 'visible'; passBtn.style.display = 'block'; refPanel.style.display = 'block'; } 
        else { leftToolbar.style.visibility = 'hidden'; passBtn.style.display = 'none'; refPanel.style.display = 'none'; statusText.innerText = "그림을 보고 정답을 맞춰보세요!"; }
    }
});

socket.on('game_over', (sortedPlayers) => {
    showScreen(screenResult);
    resultLeaderboard.innerHTML = '';

    sortedPlayers.forEach((player, index) => {
        const rank = index + 1; let medal = '👤 '; let rowClass = '';
        if (rank === 1) { medal = '🥇 '; rowClass = 'class="result-item rank-1"'; }
        else if (rank === 2) { medal = '🥈 '; rowClass = 'class="result-item"'; }
        else if (rank === 3) { medal = '🥉 '; rowClass = 'class="result-item"'; }
        else { rowClass = 'class="result-item"'; }

        const isMe = (player.id === socket.id);
        const nameRender = isMe ? `<span class="my-name-highlight">${player.name} (나)</span>` : `<span>${player.name}</span>`;

        resultLeaderboard.innerHTML += `<div ${rowClass}><span><strong>${medal} ${rank}위:</strong> ${nameRender}</span><strong>${player.score} 점</strong></div>`;
    });

    if (amIHost) { btnHostRetry.style.display = 'block'; btnPlayerExit.style.display = 'none'; } 
    else { btnHostRetry.style.display = 'none'; btnPlayerExit.style.display = 'block'; }
});

socket.on('host_secret', (data) => {
    if (amIHost) {
        statusText.innerText = data.msg;
        if (data.imageUrl) { refImg.src = data.imageUrl; refImg.style.display = 'block'; noRefText.style.display = 'none'; } 
        else { refImg.src = ''; refImg.style.display = 'none'; noRefText.style.display = 'block'; }
    }
});

socket.on('error_msg', (msg) => { alert(msg); window.location.href = '/'; });
socket.on('room_closed', (msg) => { alert(msg); window.location.href = '/'; });

window.changeName = (targetId) => {
    const newName = prompt("새로운 닉네임을 입력하세요 (최대 10자)");
    if (newName && newName.trim().length > 0) socket.emit('change_name', currentRoomId, targetId, newName);
};
window.kickPlayer = (targetId) => {
    if (confirm("정말 강퇴하시겠습니까? (해당 방에 영구적으로 재입장 불가능)")) socket.emit('kick_player', currentRoomId, targetId);
};

let isDrawing = false; let lastX = 0; let lastY = 0;
let currentColor = '#000000'; let currentWidth = 1;

const colors = ['#000000', '#555555', '#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3', '#ffc0cb', '#8b4513', '#00ffff', '#32cd32', '#ff00ff', '#008080', '#000080'];
colors.forEach((color, i) => {
    const div = document.createElement('div'); div.className = 'color-swatch'; div.style.backgroundColor = color;
    if (i === 0) div.classList.add('active');
    div.onclick = () => { 
        document.querySelectorAll('.color-swatch').forEach(e => e.classList.remove('active'));
        eraserBtn.style.background = 'white'; eraserBtn.style.color = 'black';
        div.classList.add('active'); currentColor = color; currentWidth = 1; 
    };
    palette.appendChild(div);
});

eraserBtn.onclick = () => { 
    document.querySelectorAll('.color-swatch').forEach(e => e.classList.remove('active'));
    eraserBtn.style.background = '#555'; eraserBtn.style.color = 'white';
    currentColor = '#ffffff'; currentWidth = 20; 
};

passBtn.onclick = () => { socket.emit('pass_round', currentRoomId); };
ctx.lineCap = 'round';

socket.on('clear_board', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); });
canvas.addEventListener('mousedown', (e) => { if (!amIHost) return; isDrawing = true; [lastX, lastY] = [e.offsetX, e.offsetY]; });
canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !amIHost) return;
    drawLine(lastX, lastY, e.offsetX, e.offsetY, currentColor, currentWidth);
    socket.emit('draw', { roomId: currentRoomId, x0: lastX, y0: lastY, x1: e.offsetX, y1: e.offsetY, color: currentColor, width: currentWidth });
    [lastX, lastY] = [e.offsetX, e.offsetY];
});
canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

socket.on('draw', (d) => { drawLine(d.x0, d.y0, d.x1, d.y1, d.color, d.width); });

// 💡 중요 버그 수정 완료: 브라우저가 ctx.stroke를 인식하도록 스코프 명시 검수 완료
function drawLine(x0, y0, x1, y1, color, width) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.closePath();
}

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('chat', { roomId: currentRoomId, msg: chatInput.value });
        chatInput.value = '';
        chatInput.disabled = true; chatInput.classList.add('disabled'); chatInput.placeholder = "2초 대기...";
        setTimeout(() => { chatInput.disabled = false; chatInput.classList.remove('disabled'); chatInput.placeholder = "정답 입력"; chatInput.focus(); }, 2000);
    }
});

socket.on('chat', (data) => { chatBox.innerHTML += `<div><b>${data.name}</b>: ${data.msg}</div>`; chatBox.scrollTop = chatBox.scrollHeight; });
socket.on('system', (msg) => { chatBox.innerHTML += `<div class="system-msg">${msg}</div>`; chatBox.scrollTop = chatBox.scrollHeight; });