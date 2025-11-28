const canvas = document.getElementById('tetris');
const context = canvas.getContext('2d');
const oppCanvas = document.getElementById('opponent');
const oppContext = oppCanvas.getContext('2d');

context.scale(20, 20); // 20px kare boyutu
oppContext.scale(10, 10); // Rakip ekranı yarı boyutta

// --- OYUN MANTIĞI ---
function arenaSweep() {
    let rowCount = 1;
    outer: for (let y = arena.length - 1; y > 0; --y) {
        for (let x = 0; x < arena[y].length; ++x) {
            if (arena[y][x] === 0) {
                continue outer;
            }
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
            if (m[y][x] !== 0 &&
               (arena[y + o.y] && arena[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function createMatrix(w, h) {
    const matrix = [];
    while (h--) {
        matrix.push(new Array(w).fill(0));
    }
    return matrix;
}

function createPiece(type) {
    if (type === 'I') {
        return [
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
            [0, 1, 0, 0],
        ];
    } else if (type === 'L') {
        return [
            [0, 2, 0],
            [0, 2, 0],
            [0, 2, 2],
        ];
    } else if (type === 'J') {
        return [
            [0, 3, 0],
            [0, 3, 0],
            [3, 3, 0],
        ];
    } else if (type === 'O') {
        return [
            [4, 4],
            [4, 4],
        ];
    } else if (type === 'Z') {
        return [
            [5, 5, 0],
            [0, 5, 5],
            [0, 0, 0],
        ];
    } else if (type === 'S') {
        return [
            [0, 6, 6],
            [6, 6, 0],
            [0, 0, 0],
        ];
    } else if (type === 'T') {
        return [
            [0, 7, 0],
            [7, 7, 7],
            [0, 0, 0],
        ];
    }
}

function drawMatrix(matrix, offset, ctx) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) {
                ctx.fillStyle = colors[value];
                ctx.fillRect(x + offset.x, y + offset.y, 1, 1);
            }
        });
    });
}

function draw(ctx, board, ply) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 240, 400); // Temizle
    drawMatrix(board, {x: 0, y: 0}, ctx);
    if(ply) drawMatrix(ply.matrix, ply.pos, ctx);
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
    if (dir > 0) {
        matrix.forEach(row => row.reverse());
    } else {
        matrix.reverse();
    }
}

function playerDrop() {
    player.pos.y++;
    if (collide(arena, player)) {
        player.pos.y--;
        merge(arena, player);
        playerReset();
        arenaSweep();
        updateScore();
        sendState(); // Hamle bitince durumu rakibe gönder
    }
    dropCounter = 0;
}

function playerMove(offset) {
    player.pos.x += offset;
    if (collide(arena, player)) {
        player.pos.x -= offset;
    }
}

function playerReset() {
    const pieces = 'ILJOTSZ';
    player.matrix = createPiece(pieces[pieces.length * Math.random() | 0]);
    player.pos.y = 0;
    player.pos.x = (arena[0].length / 2 | 0) - (player.matrix[0].length / 2 | 0);
    
    // Oyun Bitti mi?
    if (collide(arena, player)) {
        arena.forEach(row => row.fill(0));
        player.score = 0;
        updateScore();
        sendState(); // Reset durumunu gönder
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

let dropCounter = 0;
let dropInterval = 1000;
let lastTime = 0;

function update(time = 0) {
    if (!gameActive) return;

    const deltaTime = time - lastTime;
    lastTime = time;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) {
        playerDrop();
    }

    draw(context, arena, player);
    requestAnimationFrame(update);
}

function updateScore() {
    document.getElementById('score').innerText = "Skor: " + player.score;
}

const colors = [
    null,
    '#FF0D72', '#0DC2FF', '#0DFF72', '#F538FF',
    '#FF8E0D', '#FFE138', '#3877FF',
];

const arena = createMatrix(12, 20);
const player = {
    pos: {x: 0, y: 0},
    matrix: null,
    score: 0,
};

// --- MULTIPLAYER (PEERJS) KISMI ---
let peer = null;
let conn = null;
let gameActive = false;

// 1. PeerJS Başlatma
function initPeer() {
    // Rastgele bir ID oluşturuyoruz, sunucu yok
    peer = new Peer(null, {
        debug: 2
    });

    peer.on('open', function (id) {
        document.getElementById('my-id').innerText = id;
    });

    // Başkası bize bağlanırsa
    peer.on('connection', function (c) {
        conn = c;
        setupConnection();
        alert("Rakip Bağlandı! Oyun Başlıyor.");
        startGame();
    });
}

// 2. Rakibe Bağlanma
function connectToPeer() {
    const opponentId = document.getElementById('opponent-id').value;
    if (!opponentId) return alert("ID Giriniz");
    
    conn = peer.connect(opponentId);
    setupConnection();
    startGame();
}

function setupConnection() {
    document.getElementById('connection-menu').style.display = 'none';
    document.getElementById('game-container').style.display = 'flex';
    document.getElementById('status').innerText = "Bağlandı!";

    conn.on('data', function (data) {
        // Rakibin verisi geldiğinde onun ekranını çiz
        if (data.arena) {
            draw(oppContext, data.arena, null); // Rakibin sadece board'ını çiziyoruz
            document.getElementById('opponent-score').innerText = "Skor: " + data.score;
        }
    });
}

// 3. Veri Gönderme
function sendState() {
    if (conn && conn.open) {
        // Tüm board'u göndermek yerine sıkıştırıp göndermek daha iyidir ama şimdilik basit tutalım.
        conn.send({
            arena: arena,
            score: player.score
        });
    }
}

function startGame() {
    playerReset();
    updateScore();
    gameActive = true;
    update();
}

// --- KONTROLLER ---
// Klavye
document.addEventListener('keydown', event => {
    if (!gameActive) return;
    if (event.keyCode === 37) playerMove(-1);
    else if (event.keyCode === 39) playerMove(1);
    else if (event.keyCode === 40) playerDrop();
    else if (event.keyCode === 81) playerRotate(-1);
    else if (event.keyCode === 87) playerRotate(1);
});

// Mobil Dokunmatik Butonlar
document.getElementById('btn-left').addEventListener('click', () => playerMove(-1));
document.getElementById('btn-right').addEventListener('click', () => playerMove(1));
document.getElementById('btn-down').addEventListener('click', () => playerDrop());
document.getElementById('btn-rotate').addEventListener('click', () => playerRotate(1));

// Başlat
initPeer();
