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

const btnModeSolo = document.getElementById('btn-mode-solo');
const btnModeTurn = document.getElementById('btn-mode-turn');
const btnHostRetry = document.getElementById('btn-host-retry'); 
const btnPlayerExit = document.getElementById('btn-player-exit'); 

const canvas = document.getElementById('board'); const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status'); const chatBox = document.getElementById('chat-box');
const chatInput = document.getElementById('chat-input'); const scoreList = document.getElementById('score-list');
const leftToolbar = document.getElementById('left-toolbar'); const palette = document.getElementById('palette');
const eraserBtn = document.getElementById('eraser-btn'); const passBtn = document.getElementById('pass-btn');
const refPanel = document.getElementById('host-reference-panel'); const refImg = document.getElementById('reference-img');
const noRefText = document.getElementById('no-ref-text');

const widthSlider = document.getElementById('width-slider');
const clearBtn = document.getElementById('clear-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const customCursor = document.getElementById('custom-cursor');

// 💡 방장 권한(amIHost)과 그리기 권한(amIDrawer)을 철저하게 분리
let currentRoomId = null; let myId = null; 
let amIHost = false; 
let amIDrawer = false; 

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

btnModeSolo.onclick = () => { if (amIHost) socket.emit('change_mode', currentRoomId, 'solo'); };
btnModeTurn.onclick = () => { if (amIHost) socket.emit('change_mode', currentRoomId, 'turn'); };
btnStartGame.onclick = () => { socket.emit('start_game', currentRoomId, parseInt(inputRounds.value)); };

btnHostRetry.onclick = () => { socket.emit('host_retry_action', currentRoomId); window.location.href = '/?action=host_retry'; };
btnPlayerExit.onclick = () => { window.location.href = '/'; };

socket.on('go_to_main', (msg) => { alert(msg); window.location.href = '/'; });

socket.on('update_room_state', (data) => {
    if (!data) return;
    
    // 💡 방장인지, 그리고 현재 차례(그리는 사람)인지 갱신
    amIHost = (socket.id === data.hostId);
    amIDrawer = (socket.id === data.drawerId);
    
    if (data.state === 'lobby') {
        showScreen(screenLobby);
        inviteBox.innerText = window.location.href;
        
        if (amIHost) {
            btnStartGame.style.display = 'block'; lobbySettings.style.display = 'block';
            inputRounds.max = data.totalWords; maxWordsSpan.innerText = data.totalWords;
            btnModeSolo.disabled = false; btnModeTurn.disabled = false; 
        } else {
            btnStartGame.style.display = 'none'; lobbySettings.style.display = 'none';
            btnModeSolo.disabled = true; btnModeTurn.disabled = true; 
        }

        if (data.gameMode === 'solo') {
            btnModeSolo.classList.add('active'); btnModeTurn.classList.remove('active');
        } else {
            btnModeTurn.classList.add('active'); btnModeSolo.classList.remove('active');
        }
        
        lobbyPlayerList.innerHTML = '';
        for (const id in data.players) {
            const p = data.players[id]; const isMe = (id === socket.id); const isHost = (id === data.hostId);
            const nameSpan = isMe ? `<span class="my-name-highlight">${isHost ? '👑 ' : '👤 '} ${p.name} (나)</span>` : `<span>${isHost ? '👑 ' : '👤 '} ${p.name}</span>`;
            let html = `<li class="lobby-player-item">${nameSpan}<div>`;
            if (isMe || amIHost) html += `<button class="btn btn-small" onclick="changeName('${id}')">이름변경</button>`;
            
            // 강퇴는 무조건 방장만(amIHost)
            if (amIHost && !isMe) html += `<button class="btn btn-small btn-danger" onclick="kickPlayer('${id}')">강퇴</button>`;
            html += `</div></li>`; lobbyPlayerList.innerHTML += html;
        }
    } 
    else if (data.state === 'playing') {
        showScreen(screenGame);
        scoreList.innerHTML = '';
        for (const id in data.players) {
            const p = data.players[id]; const isMe = (id === socket.id);
            const isHost = (id === data.hostId);
            const isDrawer = (id === data.drawerId);
            
            let tags = '';
            if (isHost) tags += '👑 ';
            if (isDrawer) tags += '🎨 ';
            if (!isHost && !isDrawer) tags += '👤 ';

            const nameRender = isMe ? `<span class="my-name-highlight">${tags}${p.name} (나)</span>` : `<span>${tags}${p.name}</span>`;
            let html = `<div class="player-item"><div>${nameRender} <strong>${p.score} 점</strong></div>`;
            
            // 강퇴는 무조건 방장만(amIHost)
            if (amIHost && !isMe) html += `<button class="btn btn-small btn-danger" onclick="kickPlayer('${id}')">강퇴</button>`;
            html += `</div>`; scoreList.innerHTML += html;
        }

        // 💡 캔버스 제어 UI는 무조건 '그리는 사람(amIDrawer)' 에게만 보임!
        if (amIDrawer) { 
            leftToolbar.style.visibility = 'visible'; 
            passBtn.style.display = 'block'; 
            refPanel.style.display = 'block'; 
        } else { 
            leftToolbar.style.visibility = 'hidden'; 
            passBtn.style.display = 'none'; 
            refPanel.style.display = 'none'; 
            statusText.innerText = "그림을 보고 정답을 맞춰보세요!"; 
        }
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

// 💡 턴을 넘겨받은 사람만 이 제시어 비밀 메시지를 수신
socket.on('host_secret', (data) => {
    if (amIDrawer) {
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
let currentColor = '#000000'; let currentWidth = 3; 

widthSlider.oninput = (e) => { currentWidth = parseInt(e.target.value); };

const colors = ['#000000', '#555555', '#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3', '#ffc0cb', '#8b4513', '#00ffff', '#32cd32', '#ff00ff', '#008080', '#000080'];
colors.forEach((color, i) => {
    const div = document.createElement('div'); div.className = 'color-swatch'; div.style.backgroundColor = color;
    if (i === 0) div.classList.add('active');
    div.onclick = () => { 
        document.querySelectorAll('.color-swatch').forEach(e => e.classList.remove('active'));
        eraserBtn.style.background = 'white'; eraserBtn.style.color = 'black';
        div.classList.add('active'); currentColor = color; 
        currentWidth = parseInt(widthSlider.value); 
    };
    palette.appendChild(div);
});

eraserBtn.onclick = () => { 
    document.querySelectorAll('.color-swatch').forEach(e => e.classList.remove('active'));
    eraserBtn.style.background = '#555'; eraserBtn.style.color = 'white';
    currentColor = '#ffffff'; currentWidth = 20; widthSlider.value = 20;
};

// 패스는 그리는 사람(amIDrawer)만 호출 가능
passBtn.onclick = () => { if (amIDrawer) socket.emit('pass_round', currentRoomId); };
ctx.lineCap = 'round';

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 15; 

function saveState() {
    if (undoStack.length >= MAX_HISTORY) undoStack.shift();
    undoStack.push(canvas.toDataURL()); 
    redoStack = []; 
}

function restoreState(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        socket.emit('sync_board', { roomId: currentRoomId, image: dataUrl }); 
    };
}

function undo() {
    if (!amIDrawer || undoStack.length === 0) return;
    redoStack.push(canvas.toDataURL()); 
    restoreState(undoStack.pop());
}

function redo() {
    if (!amIDrawer || redoStack.length === 0) return;
    undoStack.push(canvas.toDataURL()); 
    restoreState(redoStack.pop());
}

undoBtn.onclick = undo;
redoBtn.onclick = redo;
window.addEventListener('keydown', (e) => {
    if (!amIDrawer) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
});

clearBtn.onclick = () => {
    if (!amIDrawer) return; // 전체 지우기도 그리는 사람만 가능
    saveState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('clear_board', currentRoomId);
};

socket.on('clear_board', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); });
socket.on('sync_board', (dataUrl) => {
    const img = new Image(); img.src = dataUrl;
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
});

function getCanvasPos(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect(); 
    const scaleX = canvas.width / rect.width;   
    const scaleY = canvas.height / rect.height; 
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

// 💡 이하 모든 터치 및 그리기 권한을 amIDrawer로 제어
canvas.addEventListener('mousedown', (e) => { 
    if (!amIDrawer) return; 
    saveState(); 
    isDrawing = true; 
    const pos = getCanvasPos(canvas, e.clientX, e.clientY);
    [lastX, lastY] = [pos.x, pos.y]; 
});

canvas.addEventListener('mousemove', (e) => {
    if (amIDrawer) {
        customCursor.style.display = 'block';
        customCursor.style.left = e.clientX + 'px';
        customCursor.style.top = e.clientY + 'px';
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        customCursor.style.width = (currentWidth * scaleX) + 'px';
        customCursor.style.height = (currentWidth * scaleX) + 'px';
    }
    
    if (!isDrawing || !amIDrawer) return;
    const pos = getCanvasPos(canvas, e.clientX, e.clientY);
    drawLine(lastX, lastY, pos.x, pos.y, currentColor, currentWidth);
    socket.emit('draw', { roomId: currentRoomId, x0: lastX, y0: lastY, x1: pos.x, y1: pos.y, color: currentColor, width: currentWidth });
    [lastX, lastY] = [pos.x, pos.y];
});

canvas.addEventListener('mouseup', () => isDrawing = false);
canvas.addEventListener('mouseout', () => isDrawing = false);

canvas.addEventListener('touchstart', (e) => {
    if (!amIDrawer) return;
    e.preventDefault(); 
    saveState(); 
    isDrawing = true;
    const pos = getCanvasPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
    [lastX, lastY] = [pos.x, pos.y];
}, { passive: false }); 

canvas.addEventListener('touchmove', (e) => {
    if (!isDrawing || !amIDrawer) return;
    e.preventDefault(); 
    const pos = getCanvasPos(canvas, e.touches[0].clientX, e.touches[0].clientY);
    
    drawLine(lastX, lastY, pos.x, pos.y, currentColor, currentWidth);
    socket.emit('draw', { roomId: currentRoomId, x0: lastX, y0: lastY, x1: pos.x, y1: pos.y, color: currentColor, width: currentWidth });
    [lastX, lastY] = [pos.x, pos.y];
}, { passive: false });

canvas.addEventListener('touchend', () => isDrawing = false);
canvas.addEventListener('touchcancel', () => isDrawing = false);

canvas.addEventListener('mouseenter', () => { if (amIDrawer) canvas.classList.add('host-mode'); });
canvas.addEventListener('mouseleave', () => { customCursor.style.display = 'none'; isDrawing = false; });

socket.on('draw', (d) => { drawLine(d.x0, d.y0, d.x1, d.y1, d.color, d.width); });

function drawLine(x0, y0, x1, y1, color, width) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.closePath();
}

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() !== '') {
        socket.emit('chat', { roomId: currentRoomId, msg: chatInput.value });
        chatInput.value = '';
        chatInput.disabled = true; chatInput.classList.add('disabled'); chatInput.placeholder = "1초 대기...";
        setTimeout(() => { chatInput.disabled = false; chatInput.classList.remove('disabled'); chatInput.placeholder = "정답 입력"; chatInput.focus(); }, 1000);
    }
});

socket.on('chat', (data) => { chatBox.innerHTML += `<div><b>${data.name}</b>: ${data.msg}</div>`; chatBox.scrollTop = chatBox.scrollHeight; });
socket.on('system', (msg) => { chatBox.innerHTML += `<div class="system-msg">${msg}</div>`; chatBox.scrollTop = chatBox.scrollHeight; });