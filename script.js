// Canvas Elementleri
const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextContext = nextCanvas.getContext('2d');
const oppCanvas = document.getElementById('opponent');
const oppContext = oppCanvas.getContext('2d');

// İç Çözünürlük Ayarları (Görüntü kalitesi için yüksek tutuyoruz)
canvas.width = 240;
canvas.height = 400;
context.scale(20, 20);

nextCanvas.width = 80;
nextCanvas.height = 80;
nextContext.scale(20, 20);

oppCanvas.width = 120;
oppCanvas.height = 200;
oppContext.scale(10, 10);

// --- OYUN DEĞİŞKENLERİ ---
const arena = createMatrix(12, 20);
const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0,
    next: null
};

let opponentScore = 0;
let dropCounter = 0;
let dropInterval = 1000; // Başlangıç hızı (1 saniye)
let lastTime = 0;
let gameActive = false;

const colors = [
    null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF',
];

// --- PEERJS BAĞLANTISI ---
let peer = null;
let conn = null;

function initPeer(callback) {
    peer = new Peer(null, { debug: 1 });
    peer.on('open', (id) => { if (callback) callback(id); });
    peer.on('connection', (c) => {
        conn = c;
        setupConnection();
    });
}

function createRoom() {
    document.querySelector('.menu-box').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    initPeer((id) => {
        const gameUrl = window.location.href.split('?')[0] + '?room=' + id;
        document.getElementById('loading').style.display = 'none';
        document.getElementById('share-area').style.display = 'block';
        document.getElementById('share-link').value = gameUrl;
    });
}

function copyLink() {
    const copyText = document.getElementById("share-link");
    copyText.select();
    document.execCommand("copy");
    alert("Kopyalandı!");
}

function joinRoom() {
    let roomId = document.getElementById('room-link-input').value;
    if (roomId.includes('?room=')) roomId = roomId.split('?room=')[1];
    if(!roomId) return alert("ID Girilmedi");

    document.getElementById('menu-screen').innerHTML = "<h1>Bağlanılıyor...</h1>";
    initPeer(() => {
        conn = peer.connect(roomId);
        conn.on('open', setupConnection);
    });
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        document.getElementById('room-link-input').value = roomParam;
        joinRoom();
    }
};

function setupConnection() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    
    conn.on('data', (data) => {
        if (data.type === 'update') {
            drawOpponent(data.arena);
            opponentScore = data.score;
            document.getElementById('opp-score').innerText = opponentScore;
        }
        else if (data.type === 'gameover') {
            // Rakip yandı, biz kazandık demektir ama iki tarafı da durduruyoruz
            handleGameOver(false); // false = ben kaybetmedim, rakip kaybetti
        }
    });

    startGame();
}

function sendState() {
    if (conn && conn.open) {
        conn.send({
            type: 'update',
            arena: arena,
            score: player.score
        });
    }
}

// --- OYUN MANTIĞI ---

function createMatrix(w, h) {
    const matrix = [];
    while (h--) matrix.push(new Array(w).fill(0));
    return matrix;
}

function createPiece(type) {
    if (type === 'I') return [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]];
    if (type === 'L') return [[0,2,0],[0,2,0],[0,2,2]];
    if (type === 'J') return [[0,3,0],[0,3,0],[3,3,0]];
    if (type === 'O') return [[4,4],[4,4]];
    if (type === 'Z') return [[5,5,0],[0,5,5],[0,0,0]];
    if (type === 'S') return [[0,6,6],[6,6,0],[0,0,0]];
    if (type === 'T') return [[0,7,0],[7,7,7],[0,0,0]];
}

function drawMatrix(matrix, offset, ctx) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = colors[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
                ctx.lineWidth = 0.05;
                ctx.strokeStyle = 'white';
                ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width/20, canvas.height/20); // Scale olduğu için
    drawMatrix(arena, {x: 0, y: 0}, context);
    drawMatrix(player.matrix, player.pos, context);
}

function drawNext() {
    nextContext.fillStyle = '#000';
    nextContext.fillRect(0, 0, 4, 4);
    const offsetX = (4 - player.next[0].length) / 2;
    const offsetY = (4 - player.next.length) / 2;
    drawMatrix(player.next, {x: offsetX, y: offsetY}, nextContext);
}

function drawOpponent(oppArena) {
    oppContext.fillStyle = '#000';
    oppContext.fillRect(0, 0, 12, 20);
    drawMatrix(oppArena, {x: 0, y: 0}, oppContext);
}

function merge(arena, player) {
    player.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                arena[y + player.pos.y][x + player.pos.x] = value;
            }
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

function playerReset() {
    const pieces = 'ILJOTSZ';
    if (player.next === null) player.next = createPiece(pieces[pieces.length * Math.random() | 0]);
    player.matrix = player.next;
    player.next = createPiece(pieces[pieces.length * Math.random() | 0]);
    drawNext();

    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    
    if (collide(arena, player)) {
        // --- OYUN BİTTİ (KAYBETTİN) ---
        handleGameOver(true);
    }
}

function handleGameOver(iLost) {
    gameActive = false;
    
    if (iLost && conn && conn.open) {
        conn.send({ type: 'gameover' });
    }

    document.getElementById('game-over-modal').style.display = 'flex';
    document.getElementById('final-my-score').innerText = player.score;
    document.getElementById('final-opp-score').innerText = opponentScore;
    
    const title = document.getElementById('result-title');
    if (iLost) {
        title.innerText = "KAYBETTİN!";
        title.style.color = "red";
    } else {
        title.innerText = "KAZANDIN!";
        title.style.color = "#00d2ff";
    }
}

function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) continue outer;
        }
        const row = arena.splice(y, 1)[0].fill(0);
        arena.unshift(row);
        ++y;
        player.score += rowCount * 10;
        rowCount *= 2;
    }
    updateScore();
}

function collide(arena, player) {
    const [m, o] = [player.matrix, player.pos];
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        sendState();
    }
    dropCounter = 0;
}

function playerMove(dir) {
    player.pos.x += dir;
    if (collide(arena, player)) {
        player.pos.x -= dir;
    }
}

function playerRotate(dir) {
    const pos = player.pos.x;
    let offset = 1;
    rotate(player.matrix, dir);
    while (collide(arena, player)) {
        player.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > player.matrix[0].length) {
            rotate(player.matrix, -dir);
            player.pos.x = pos;
            return;
        }
    }
}

function updateScore() {
    document.getElementById('score').innerText = player.score;
    
    // --- ZORLUK ARTIŞI ---
    // Her 100 puanda 50ms hızlandır (Minimum 100ms'ye kadar)
    const level = Math.floor(player.score / 100);
    const newInterval = 1000 - (level * 50);
    dropInterval = newInterval > 100 ? newInterval : 100;
}

function update(time = 0) {
    if (!gameActive) return;

    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    draw();
    requestAnimationFrame(update);
}

function startGame() {
    arena.forEach(row => row.fill(0));
    player.score = 0;
    opponentScore = 0;
    dropInterval = 1000;
    document.getElementById('game-over-modal').style.display = 'none';
    updateScore();
    playerReset();
    gameActive = true;
    update();
}

// --- KONTROLLER ---
// Dokunmatik
let touchStartX = 0;
let touchStartY = 0;
let touchEndTime = 0;

document.body.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    touchEndTime = new Date().getTime();
}, {passive: false});

document.body.addEventListener('touchend', e => {
    e.preventDefault();
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const duration = new Date().getTime() - touchEndTime;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && duration < 300) {
        playerRotate(1);
    } else if (Math.abs(diffX) > Math.abs(diffY)) {
        if (Math.abs(diffX) > 30) playerMove(diffX > 0 ? 1 : -1);
    } else {
        if (diffY > 30) playerDrop();
    }
}, {passive: false});

// Klavye
document.addEventListener('keydown', event => {
    if(!gameActive) return;
    if (event.keyCode === 37) playerMove(-1);
    else if (event.keyCode === 39) playerMove(1);
    else if (event.keyCode === 40) playerDrop();
    else if (event.keyCode === 38) playerRotate(1);
});
