const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); 
const path = require('path');
const crypto = require('crypto'); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

function loadWordsFromCSV() {
    try {
        const csvPath = path.join(__dirname, 'words.csv');
        if (!fs.existsSync(csvPath)) fs.writeFileSync(csvPath, "사과,사과\n바나나,바나나", 'utf8');
        const data = fs.readFileSync(csvPath, 'utf8');
        const parsedWords = [];
        for (let line of data.split('\n')) {
            line = line.trim();
            if (!line) continue;
            const cols = line.split(',').map(c => c.trim());
            if (cols.length > 0 && cols[0] !== "") {
                let img = cols.length > 1 && cols[1].startsWith('http') ? cols[1] : null;
                let startIdx = img ? 2 : 1;
                let ans = [cols[0]];
                for (let i = startIdx; i < cols.length; i++) if(cols[i]) ans.push(cols[i]);
                parsedWords.push({ display: cols[0], imageUrl: img, acceptedAnswers: ans });
            }
        }
        return parsedWords;
    } catch (e) { return [{ display: "오류", imageUrl: null, acceptedAnswers: ["오류"] }]; }
}
const wordList = loadWordsFromCSV();

const rooms = {}; 
const MAX_ROOMS = 10;
const AFK_TIMEOUT_MS = 15 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const roomId in rooms) {
        if (now - rooms[roomId].lastActive > AFK_TIMEOUT_MS) {
            io.to(roomId).emit('room_closed', '15분간 활동이 없어 방이 삭제되었습니다.');
            io.in(roomId).socketsLeave(roomId);
            delete rooms[roomId];
        }
    }
}, 60000);

function updateActivity(roomId) { if (rooms[roomId]) rooms[roomId].lastActive = Date.now(); }

io.on('connection', (socket) => {
    
    socket.on('create_room', () => {
        if (Object.keys(rooms).length >= MAX_ROOMS) return socket.emit('error_msg', '서버 포화 상태입니다.');
        const roomId = crypto.randomBytes(3).toString('hex');
        rooms[roomId] = {
            id: roomId, state: 'lobby', hostId: socket.id, drawerId: socket.id, players: {}, bannedDevices: [],
            lastActive: Date.now(), currentWordObj: null, hasWinner: false,
            availableWords: [], currentRound: 0, maxRounds: 5,
            gameMode: 'solo', turnOrder: []
        };
        socket.emit('room_created', roomId);
    });

    socket.on('join_room', (roomId, deviceId) => {
        const room = rooms[roomId];
        if (!room) return socket.emit('error_msg', '존재하지 않거나 삭제된 방입니다.');
        if (room.bannedDevices.includes(deviceId)) return socket.emit('error_msg', '이 방에서 강퇴당하여 재입장할 수 없습니다.');
        
        socket.join(roomId);
        room.players[socket.id] = { id: socket.id, name: `유저_${socket.id.substring(0,4)}`, score: 0, deviceId: deviceId };
        updateActivity(roomId);

        io.to(roomId).emit('update_room_state', {
            state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode
        });
    });

    socket.on('change_mode', (roomId, mode) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId && room.state === 'lobby') {
            if (mode === 'solo' || mode === 'turn') {
                room.gameMode = mode;
                updateActivity(roomId);
                io.to(roomId).emit('update_room_state', { 
                    state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode 
                });
            }
        }
    });

    socket.on('change_name', (roomId, targetId, newName) => {
        const room = rooms[roomId];
        if (!room || !room.players[targetId]) return;
        updateActivity(roomId);
        if (socket.id === targetId || socket.id === room.hostId) {
            const safeName = newName.trim().substring(0, 10);
            if (safeName.length > 0) {
                room.players[targetId].name = safeName;
                io.to(roomId).emit('update_room_state', { state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode });
            }
        }
    });

    socket.on('kick_player', (roomId, targetId) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId && targetId !== room.hostId) {
            const target = room.players[targetId];
            if(target) room.bannedDevices.push(target.deviceId);
            
            io.to(targetId).emit('room_closed', '방장에 의해 강퇴되었습니다.');
            io.sockets.sockets.get(targetId)?.leave(roomId);
            delete room.players[targetId];
            if (room.turnOrder) room.turnOrder = room.turnOrder.filter(id => id !== targetId);

            io.to(roomId).emit('update_room_state', { state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode });
        }
    });

    socket.on('start_game', (roomId, maxRounds) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId && room.state === 'lobby') {
            room.state = 'playing';
            room.maxRounds = Math.min(maxRounds, wordList.length);
            room.currentRound = 0;
            room.availableWords = [...wordList];
            room.turnOrder = Object.keys(room.players); // 게임 시작 시 접속자 기반으로 턴 순서 배정
            
            for(let id in room.players) room.players[id].score = 0;
            updateActivity(roomId);
            startNextRound(roomId);
        }
    });

    // 💡 그리기 관련 이벤트는 모두 'drawerId' 기준으로 권한 체크
    socket.on('draw', (data) => {
        const room = rooms[data.roomId];
        if (room && socket.id === room.drawerId) {
            updateActivity(data.roomId); socket.to(data.roomId).emit('draw', data);
        }
    });
    
    socket.on('clear_board', (roomId) => {
        const room = rooms[roomId];
        if (room && socket.id === room.drawerId) {
            updateActivity(roomId); socket.to(roomId).emit('clear_board');
        }
    });

    socket.on('sync_board', (data) => {
        const room = rooms[data.roomId];
        if (room && socket.id === room.drawerId) {
            updateActivity(data.roomId); socket.to(data.roomId).emit('sync_board', data.image);
        }
    });

    socket.on('pass_round', (roomId) => {
        const room = rooms[roomId];
        if (room && socket.id === room.drawerId && !room.hasWinner) {
            room.hasWinner = true; updateActivity(roomId);
            io.to(roomId).emit('system', `🔔 그리는 유저가 정답을 공개했습니다! 정답: [ ${room.currentWordObj.display} ]`);
            setTimeout(() => startNextRound(roomId), 3000);
        }
    });

    socket.on('host_retry_action', (roomId) => {
        const room = rooms[roomId];
        if (room && socket.id === room.hostId) {
            socket.to(roomId).emit('go_to_main', '방장이 게임을 종료하고 새 방을 생성했습니다.');
            io.in(roomId).socketsLeave(roomId);
            delete rooms[roomId];
        }
    });

    socket.on('chat', (data) => {
        const room = rooms[data.roomId];
        if (!room) return;
        updateActivity(data.roomId);
        const player = room.players[socket.id];
        const userTyped = data.msg.trim();
        io.to(data.roomId).emit('chat', { name: player.name, msg: userTyped });
        
        if (room.state === 'playing' && !room.hasWinner) {
            // 💡 그림을 그리는 사람은 정답을 맞혀도 점수를 얻을 수 없게 예외 처리
            if (socket.id === room.drawerId) return;

            const isCorrect = room.currentWordObj.acceptedAnswers.some(ans => ans.toLowerCase() === userTyped.toLowerCase());
            if (isCorrect) {
                room.hasWinner = true; player.score += 10;
                io.to(data.roomId).emit('system', `🎉 정답! [${player.name}]님이 +10점! (현재 ${player.score}점) [정답: ${room.currentWordObj.display}]`);
                io.to(data.roomId).emit('update_room_state', { state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode });
                setTimeout(() => startNextRound(data.roomId), 3000);
            }
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players[socket.id]) {
                const wasHost = (socket.id === room.hostId);
                const wasDrawer = (socket.id === room.drawerId);
                delete room.players[socket.id];
                if (room.turnOrder) room.turnOrder = room.turnOrder.filter(id => id !== socket.id);

                const remainingIds = Object.keys(room.players);
                if (remainingIds.length === 0) { delete rooms[roomId]; continue; }
                if (room.state === 'result') continue; 
                
                if (wasHost) {
                    room.hostId = remainingIds[0];
                    io.to(roomId).emit('system', `📢 [${room.players[room.hostId].name}] 님이 새로운 방장이 되었습니다.`);
                }

                // 💡 그림 그리는 사람이 나간 경우 턴을 강제로 넘김
                if (wasDrawer && room.state === 'playing' && !room.hasWinner) {
                    io.to(roomId).emit('system', `⚠️ 그림을 그리던 유저가 퇴장하여 다음 문제로 넘어갑니다.`);
                    room.hasWinner = true;
                    setTimeout(() => startNextRound(roomId), 3000);
                }

                io.to(roomId).emit('update_room_state', { state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode });
            }
        }
    });
});

function startNextRound(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.currentRound++;
    if (room.currentRound > room.maxRounds || room.availableWords.length === 0) {
        room.state = 'result';
        const sortedResult = Object.values(room.players).sort((a, b) => b.score - a.score);
        io.to(roomId).emit('game_over', sortedResult);
        return;
    }
    const randIdx = Math.floor(Math.random() * room.availableWords.length);
    room.currentWordObj = room.availableWords.splice(randIdx, 1)[0]; 
    room.hasWinner = false;

    // 💡 게임 모드에 따른 다음 턴 계산
    if (room.gameMode === 'turn') {
        if (room.turnOrder.length === 0) room.turnOrder = Object.keys(room.players); // 예비 방어
        const nextIdx = (room.currentRound - 1) % room.turnOrder.length;
        room.drawerId = room.turnOrder[nextIdx];
    } else {
        room.drawerId = room.hostId;
    }

    io.to(roomId).emit('clear_board');
    io.to(roomId).emit('system', `--- 🟢 [${room.currentRound} / ${room.maxRounds} 라운드] 가 시작되었습니다! ---`);
    io.to(roomId).emit('update_room_state', { state: room.state, hostId: room.hostId, drawerId: room.drawerId, players: room.players, totalWords: wordList.length, gameMode: room.gameMode });
    
    // 💡 제시어는 오직 현재 턴을 배정받은 'drawerId' 에게만 발송!
    io.to(room.drawerId).emit('host_secret', { msg: `제시어: [ ${room.currentWordObj.display} ]`, imageUrl: room.currentWordObj.imageUrl });
}

server.listen(3000, () => { console.log('✅ 서버 구동 완료. http://localhost:3000'); });