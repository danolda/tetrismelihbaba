const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-piece');
const nextContext = nextCanvas.getContext('2d');
const oppCanvas = document.getElementById('opponent');
const oppContext = oppCanvas.getContext('2d');

context.scale(20, 20);
nextContext.scale(20, 20); // Sonraki parça için de ölçek
oppContext.scale(10, 10); // Rakip küçük ölçek

// --- OYUN DEĞİŞKENLERİ ---
const colors = [
    null, '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF', '#FF8E0D', '#FFE138', '#3877FF',
];

const arena = createMatrix(12, 20);
const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0,
    next: null // Bir sonraki parçayı tutar
};

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;
let gameActive = false;

// --- PEERJS (BAĞLANTI) ---
let peer = null;
let conn = null;

function initPeer(callback) {
    peer = new Peer(null, { debug: 1 });
    peer.on('open', (id) => {
        console.log('My ID:', id);
        if (callback) callback(id);
    });
    peer.on('connection', (c) => {
        conn = c;
        handleConnection();
    });
}

function createRoom() {
    document.querySelector('.menu-box').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    
    initPeer((id) => {
        // URL'yi oluştur
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
    alert("Link kopyalandı! Arkadaşına gönder.");
}

function joinRoom() {
    let roomId = document.getElementById('room-link-input').value;
    // Eğer tam link yapıştırıldıysa içinden ID'yi al
    if (roomId.includes('?room=')) {
        roomId = roomId.split('?room=')[1];
    }
    
    if(!roomId) return alert("Geçersiz Link/ID");

    document.getElementById('menu-screen').innerHTML = "<h1>Bağlanılıyor...</h1>";
    
    initPeer(() => {
        conn = peer.connect(roomId);
        conn.on('open', () => {
            handleConnection();
        });
    });
}

// URL'de room parametresi var mı kontrol et (Oto katılım)
window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
        document.getElementById('room-link-input').value = roomParam;
        joinRoom();
    }
};

function handleConnection() {
    document.getElementById('menu-screen').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    
    // Veri dinleme
    conn.on('data', (data) => {
        if (data.arena) {
            drawOpponent(data.arena);
            document.getElementById('opp-score').innerText = data.score;
        }
        if (data.event === 'gameover') {
            alert("Rakip Kaybetti! KAZANDIN!");
            gameActive = false;
        }
    });

    startGame();
}

function sendState() {
    if (conn && conn.open) {
        conn.send({
            arena: arena,
            score: player.score
        });
    }
}

// --- DOKUNMATİK KONTROLLER (SWIPE) ---
let touchStartX = 0;
let touchStartY = 0;
let touchEndTime = 0;

const touchArea = document.body; // Tüm ekranı dokunmatik alan yap

touchArea.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    touchEndTime = new Date().getTime();
}, {passive: false});

touchArea.addEventListener('touchend', e => {
    e.preventDefault(); // Varsayılanı engelle
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const duration = new Date().getTime() - touchEndTime;

    handleGesture(touchStartX, touchStartY, touchEndX, touchEndY, duration);
}, {passive: false});

function handleGesture(startX, startY, endX, endY, duration) {
    if(!gameActive) return;

    const diffX = endX - startX;
    const diffY = endY - startY;
    
    // Hareket çok kısaysa "Tıklama" kabul et (Döndürme)
    if (Math.abs(diffX) < 10 && Math.abs(diffY) < 10 && duration < 300) {
        playerRotate(1);
        return;
    }

    // Yatay mı Dikey mi daha baskın?
    if (Math.abs(diffX) > Math.abs(diffY)) {
        // Yatay Hareket
        if (Math.abs(diffX) > 30) { // Eşik değer
            if (diffX > 0) playerMove(1); // Sağa
            else playerMove(-1); // Sola
        }
    } else {
        // Dikey Hareket
        if (diffY > 30) { // Sadece aşağı çekme (Swipe Down)
            playerDrop();
            // İstersen sürekli aşağı inmesi için while döngüsü koyabilirsin (Hard Drop)
            // ama mobilde tek adım daha güvenlidir.
        }
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
                // Hafif 3D efekti için kenarlık
                ctx.lineWidth = 0.05;
                ctx.strokeStyle = 'white';
                ctx.strokeRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw() {
    // Ana Oyun
    context.fillStyle = '#000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(arena, {x: 0, y: 0}, context);
    drawMatrix(player.matrix, player.pos, context);
}

function drawNext() {
    // Sonraki Parça
    nextContext.fillStyle = '#000';
    nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    
    // Ortalamak için hesap
    const offsetX = (4 - player.next[0].length) / 2;
    const offsetY = (4 - player.next.length) / 2;
    
    drawMatrix(player.next, {x: offsetX, y: offsetY}, nextContext);
}

function drawOpponent(oppArena) {
    oppContext.fillStyle = '#000';
    oppContext.fillRect(0, 0, oppCanvas.width, oppCanvas.height);
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
    // Eğer ilk defa başlıyorsa next piece oluştur
    if (player.next === null) {
        player.next = createPiece(pieces[pieces.length * Math.random() | 0]);
    }
    
    // Mevcut parça = sıradaki parça
    player.matrix = player.next;
    // Yeni sıradaki parçayı belirle
    player.next = createPiece(pieces[pieces.length * Math.random() | 0]);
    
    // Sonraki parçayı çiz
    drawNext();

    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    
    if (collide(arena, player)) {
        gameOver();
    }
}

function gameOver() {
    gameActive = false;
    arena.forEach(row => row.fill(0));
    player.score = 0;
    updateScore();
    if(conn && conn.open) conn.send({ event: 'gameover' });
    alert("OYUN BİTTİ!");
    startGame(); // Yeniden başlat
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
        updateScore();
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

function update(time = 0) {
    if (!gameActive) {
        requestAnimationFrame(update);
        return;
    }

    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }
    draw();
    requestAnimationFrame(update);
}

function updateScore() {
    document.getElementById('score').innerText = player.score;
}

function startGame() {
    arena.forEach(row => row.fill(0));
    player.score = 0;
    updateScore();
    playerReset();
    gameActive = true;
    update();
}

// Klavye desteği (Masaüstü için)
document.addEventListener('keydown', event => {
    if(!gameActive) return;
    if (event.keyCode === 37) playerMove(-1);
    else if (event.keyCode === 39) playerMove(1);
    else if (event.keyCode === 40) playerDrop();
    else if (event.keyCode === 38) playerRotate(1); // Yukarı ok ile döndür
});
