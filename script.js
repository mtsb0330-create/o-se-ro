document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('board');
    const score1Element = document.getElementById('score1');
    const score2Element = document.getElementById('score2');
    const turnIndicator = document.getElementById('turn-indicator');
    const player1ScoreBox = document.querySelector('.player-score.player1');
    const player2ScoreBox = document.querySelector('.player-score.player2');
    const modal = document.getElementById('message-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const winnerImage = document.getElementById('winner-image');
    const restartBtn = document.getElementById('restart-btn');
    const modeModal = document.getElementById('mode-modal');
    const localModeBtn = document.getElementById('local-mode-btn');
    const onlineModeBtn = document.getElementById('online-mode-btn');
    const onlineInfo = document.getElementById('online-info');
    const connectionStatus = document.getElementById('connection-status');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const myIdDisplay = document.getElementById('my-id-display');
    const statusDot = document.querySelector('.status-dot');

    // 新機能用のDOM要素
    const undoBtn = document.getElementById('undo-btn');
    const resultDisplay = document.getElementById('result-display');
    const commentBtnLeft = document.getElementById('comment-btn-left');
    const commentBtnRight = document.getElementById('comment-btn-right');
    const commentDisplay = document.getElementById('comment-display');
    const commentMenu = document.getElementById('comment-menu');
    const closeMenuBtn = document.getElementById('close-menu-btn');
    const commentOptions = document.querySelectorAll('.comment-option');

    const BOARD_SIZE = 8;
    const PLAYER1 = 1; // Blue / Host
    const PLAYER2 = 2; // Red / Guest
    let board = [];
    let currentPlayer = PLAYER1;
    let gameOver = false;
    let isOnline = false;
    let myPlayerNum = null;
    let peer = null;
    let conn = null;
    let connectionTimeout = null;

    // 履歴管理
    let moveHistory = [];

    // リザルトスコア管理
    let gameResults = loadGameResults();

    // コメント用のセリフ(仮)
    const comments = [
        "考えすぎじゃない?😏",
        "そこに置くの?🤔",
        "まだ時間かかる?⏰",
        "頑張ってね〜✨",
        "いい勝負だね!🔥"
    ];

    // Sound Effects Controller
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Early Audio Resume for Safari/iOS
    const resumeAudio = () => {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        window.removeEventListener('pointerdown', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
    };
    window.addEventListener('pointerdown', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);

    function playTone(freq, type, duration, vol = 0.1) {
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + duration);

        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    }

    function playPlaceSound() {
        playTone(600, 'sine', 0.1, 0.2);
        setTimeout(() => playTone(300, 'triangle', 0.15, 0.15), 50);
    }

    function playFlipSound(index) {
        const baseFreq = 400 + (index * 50);
        playTone(baseFreq, 'sawtooth', 0.1, 0.05);
    }

    function playWinSound() {
        // Fanfare
        const now = audioCtx.currentTime;
        [0, 0.15, 0.3, 0.6].forEach((t, i) => {
            const freq = [523.25, 659.25, 783.99, 1046.50][i]; // C, E, G, C
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(freq, now + t);
            gain.gain.setValueAtTime(0.2, now + t);
            gain.gain.exponentialRampToValueAtTime(0.01, now + t + 0.4);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + t);
            osc.stop(now + t + 0.4);
        });
    }

    // リザルトスコア管理関数
    function loadGameResults() {
        const saved = localStorage.getItem('faceReversiResults');
        if (saved) {
            return JSON.parse(saved);
        }
        return { player1Wins: 0, player2Wins: 0, draws: 0 };
    }

    function saveGameResults() {
        localStorage.setItem('faceReversiResults', JSON.stringify(gameResults));
    }

    function updateResultDisplay() {
        resultDisplay.textContent = `TAKU: ${gameResults.player1Wins}勝 | emicof: ${gameResults.player2Wins}勝 | 引分: ${gameResults.draws}`;
    }

    function recordGameResult(winner) {
        if (winner === PLAYER1) {
            gameResults.player1Wins++;
        } else if (winner === PLAYER2) {
            gameResults.player2Wins++;
        } else {
            gameResults.draws++;
        }
        saveGameResults();
        updateResultDisplay();
    }

    // コメント機能 - 連続表示対応
    let commentCounter = 0;

    function showComment(message, direction = 'left') {
        // 新しいコメント要素を作成
        const commentElement = document.createElement('div');
        commentElement.classList.add('comment-text');

        // 方向に応じたクラスとスタイルを適用
        if (direction === 'right') {
            // 右ボタン（右→左）
            commentElement.classList.add('slide-left');
        } else {
            // 左ボタン（左→右）
            commentElement.classList.add('slide-right');
        }

        commentElement.textContent = message;
        commentElement.style.top = `${commentCounter * 80}px`; // 縦にずらす

        commentDisplay.appendChild(commentElement);
        commentDisplay.classList.remove('hidden');

        commentCounter++;

        // 5秒後にこのコメントを削除
        setTimeout(() => {
            commentElement.remove();
            commentCounter--;

            // すべてのコメントが消えたら非表示に
            if (commentDisplay.children.length === 0) {
                commentDisplay.classList.add('hidden');
                commentCounter = 0;
            }
        }, 5000);
    }

    // アンドゥ機能
    function saveGameState() {
        // 現在の状態を履歴に保存
        moveHistory.push({
            board: board.map(row => [...row]),
            currentPlayer: currentPlayer,
            score1: parseInt(score1Element.textContent),
            score2: parseInt(score2Element.textContent)
        });

        // アンドゥボタンを有効化
        if (!isOnline) {
            undoBtn.disabled = false;
        }
    }

    function undoMove() {
        if (moveHistory.length === 0 || gameOver) return;

        // 最後の状態を削除(現在の状態)
        moveHistory.pop();

        if (moveHistory.length === 0) {
            // 履歴がない場合は初期状態に戻す
            initGame();
            return;
        }

        // 1つ前の状態を取得
        const prevState = moveHistory[moveHistory.length - 1];

        // 状態を復元
        board = prevState.board.map(row => [...row]);
        currentPlayer = prevState.currentPlayer;
        score1Element.textContent = prevState.score1;
        score2Element.textContent = prevState.score2;

        // 画面を更新
        updateTurnDisplay();
        renderBoard();

        // 履歴が空になったらボタンを無効化
        if (moveHistory.length === 0) {
            undoBtn.disabled = true;
        }
    }

    // Initialize game
    function initGame() {
        board = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));

        // Initial setup
        const mid = BOARD_SIZE / 2;
        board[mid - 1][mid - 1] = PLAYER2;
        board[mid - 1][mid] = PLAYER1;
        board[mid][mid - 1] = PLAYER1;
        board[mid][mid] = PLAYER2;

        currentPlayer = PLAYER1;
        gameOver = false;

        // 履歴をクリア
        moveHistory = [];
        undoBtn.disabled = true;

        // リザルトスコア表示を更新
        updateResultDisplay();

        // コメントボタンの状態を更新
        updateCommentButton();

        modal.classList.add('hidden');
        renderBoard();
        updateScore();
        updateTurnDisplay();
    }

    // --- Online Multiplayer Logic ---

    function startPeer(isHost, targetPeerId = null) {
        // PeerJS config for better reliability
        peer = new Peer({
            debug: 2,
            config: {
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            isOnline = true;
            onlineInfo.classList.remove('hidden');
            if (myIdDisplay) myIdDisplay.textContent = `ID: ${id.substring(0, 6)}...`;

            if (isHost) {
                myPlayerNum = PLAYER1;
                connectionStatus.textContent = '対戦相手を待機中...';
                copyLinkBtn.classList.remove('hidden');

                // Update URL for sharing
                const url = new URL(window.location.href);
                url.searchParams.set('room', id);
                copyLinkBtn.onclick = () => {
                    // Enhanced copy for mobile/iPhone
                    const shareUrl = url.toString();
                    if (navigator.share) {
                        navigator.share({
                            title: 'フェイスオセロで対戦しよう！',
                            url: shareUrl
                        }).catch(console.error);
                    } else {
                        navigator.clipboard.writeText(shareUrl).then(() => {
                            alert('招待リンクをコピーしました！友達に送ってください。');
                        }).catch(() => {
                            // Fallback for some mobile browsers
                            alert('以下のURLをコピーして送ってください：\n' + shareUrl);
                        });
                    }
                };
            } else {
                myPlayerNum = PLAYER2;
                connectionStatus.textContent = 'ホストに接続中...';
                connectToHost(targetPeerId);
            }
        });

        peer.on('connection', (incomingConn) => {
            if (conn) conn.close(); // Close existing if any
            conn = incomingConn;
            setupConnection();
        });

        peer.on('error', (err) => {
            console.error('PeerJS Error:', err.type, err);
            statusDot.classList.add('error');

            let msg = '通信エラーが発生しました。';
            if (err.type === 'peer-unavailable') msg = '対戦相手が見つかりませんでした。リンクが古いか、期限切れの可能性があります。';
            if (err.type === 'network') msg = 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
            if (err.type === 'browser-incompatible') msg = 'お使いのブラウザはオンライン対戦に対応していません。';

            alert(msg + '\n(Error: ' + err.type + ')');
            if (!isHost) {
                // If guest failed to connect, allow retry
                location.search = ''; // Clear room param to show mode select
            }
        });
    }

    function connectToHost(hostId) {
        conn = peer.connect(hostId, {
            reliable: true
        });

        // Timeout for guest connection
        connectionTimeout = setTimeout(() => {
            if (connectionStatus.textContent === 'ホストに接続中...') {
                alert('接続タイムアウト：相手の準備ができていないか、通信が遮断されました。');
                location.search = '';
            }
        }, 15000);

        setupConnection();
    }

    function setupConnection() {
        conn.on('open', () => {
            if (connectionTimeout) clearTimeout(connectionTimeout);
            connectionStatus.textContent = '対戦中';
            statusDot.classList.remove('error');
            statusDot.classList.add('connected');
            copyLinkBtn.classList.add('hidden');
            if (modeModal) modeModal.classList.add('hidden');
            initGame();
        });

        conn.on('data', (data) => {
            console.log('Received data:', data);
            if (data.type === 'move') {
                handleMove(data.r, data.c, true);
            } else if (data.type === 'restart') {
                initGame();
            } else if (data.type === 'comment') {
                showComment(data.message, data.direction);
            }
        });

        conn.on('close', () => {
            statusDot.classList.remove('connected');
            statusDot.classList.add('error');
            alert('対戦相手が切断しました。');
            location.reload();
        });

        conn.on('error', (err) => {
            console.error('Connection Error:', err);
            alert('接続中にエラーが発生しました。');
        });
    }

    // Mode Selection Events
    localModeBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        isOnline = false;
        modeModal.classList.add('hidden');
        initGame();
    });

    onlineModeBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        modeModal.classList.add('hidden');
        startPeer(true);
    });

    // Auto-join if room param exists
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
        modeModal.classList.add('hidden');
        startPeer(false, roomId);
    }


    // Render board
    function renderBoard() {
        boardElement.innerHTML = '';
        const validMoves = getValidMoves(currentPlayer);

        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cell = document.createElement('div');
                cell.classList.add('cell');
                cell.dataset.row = r;
                cell.dataset.col = c;

                if (board[r][c] !== 0) {
                    const disc = document.createElement('div');
                    disc.classList.add('disc');
                    disc.classList.add(board[r][c] === PLAYER1 ? 'player1' : 'player2');
                    cell.appendChild(disc);
                } else if (validMoves.some(m => m.r === r && m.c === c)) {
                    cell.classList.add('valid-move');
                    cell.addEventListener('pointerup', (e) => {
                        e.preventDefault();
                        handleMove(r, c);
                    });
                }

                boardElement.appendChild(cell);
            }
        }
    }

    // Handle move (Async with Animation)
    async function handleMove(r, c, fromRemote = false) {
        if (gameOver) return;

        // Restriction for online mode
        if (isOnline && !fromRemote && currentPlayer !== myPlayerNum) {
            return;
        }

        if (audioCtx.state === 'suspended') await audioCtx.resume();

        const flipped = flipDiscs(r, c, currentPlayer);
        if (flipped.length > 0) {
            // ゲーム状態を保存(手を打つ前)
            saveGameState();

            board[r][c] = currentPlayer;
            playPlaceSound();

            // Render board instantly to show placed piece
            // But we need to ensure flipped pieces stay old color for animation
            // The synchronous renderBoard() reads from 'board', so we must update 'board' carefully.

            // 1. Update ONLY placed piece
            board[r][c] = currentPlayer;
            renderBoard();

            // 2. Lock input
            boardElement.style.pointerEvents = 'none';

            // 3. Loop and animate
            let i = 0;
            for (const pos of flipped) {
                // Update Logic Data for this piece
                board[pos.r][pos.c] = currentPlayer;

                // Find element
                const cell = document.querySelector(`.cell[data-row="${pos.r}"][data-col="${pos.c}"]`);
                if (cell && cell.firstChild) {
                    const disc = cell.firstChild;

                    await new Promise(r => setTimeout(r, 150)); // Delay (少し間隔を空ける)

                    playFlipSound(i++);

                    // Trigger 3D Animation
                    disc.classList.add('flipping');

                    // Swap texture halfway (宙に舞っている最中に切り替え)
                    const newClass = currentPlayer === PLAYER1 ? 'player1' : 'player2';
                    const oldClass = currentPlayer === PLAYER1 ? 'player2' : 'player1';

                    setTimeout(() => {
                        disc.classList.remove(oldClass);
                        disc.classList.add(newClass);
                    }, 500); // 1.2sの約40%地点

                    setTimeout(() => {
                        disc.classList.remove('flipping');
                    }, 1200); // アニメーション終了時間
                }
            }

            await new Promise(r => setTimeout(r, 1200)); // 全体の待機時間も延長
            boardElement.style.pointerEvents = 'auto'; // Unlock

            // Send move to remote peer
            if (isOnline && !fromRemote && conn && conn.open) {
                conn.send({ type: 'move', r, c });
            }

            updateScore();
            changeTurn();

            // コメントボタンの状態を更新
            updateCommentButton();
        }
    }

    // Change Turn
    function changeTurn() {
        currentPlayer = currentPlayer === PLAYER1 ? PLAYER2 : PLAYER1;

        // Check if next player has valid moves
        if (getValidMoves(currentPlayer).length === 0) {
            // Pass
            currentPlayer = currentPlayer === PLAYER1 ? PLAYER2 : PLAYER1;

            // Check if BOTH players have no moves (Game Over)
            if (getValidMoves(currentPlayer).length === 0) {
                endGame();
                return;
            } else {
                alert(`${currentPlayer === PLAYER1 ? 'TAKU' : 'emicof'} パス！`);
            }
        }

        updateTurnDisplay();
        renderBoard(); // Re-render to show valid moves for new player
    }

    function updateTurnDisplay() {
        if (currentPlayer === PLAYER1) {
            turnIndicator.textContent = "TAKUのターン";
            player1ScoreBox.classList.add('active');
            player2ScoreBox.classList.remove('active');
        } else {
            turnIndicator.textContent = "emicofのターン";
            player1ScoreBox.classList.remove('active');
            player2ScoreBox.classList.add('active');
        }
    }

    function updateScore() {
        let p1Score = 0;
        let p2Score = 0;
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === PLAYER1) p1Score++;
                else if (board[r][c] === PLAYER2) p2Score++;
            }
        }
        score1Element.textContent = p1Score;
        score2Element.textContent = p2Score;
    }

    function endGame() {
        gameOver = true;
        let p1Score = parseInt(score1Element.textContent);
        let p2Score = parseInt(score2Element.textContent);

        playWinSound();
        if (typeof confetti === 'function') {
            const duration = 3000;
            const end = Date.now() + duration;

            (function frame() {
                confetti({
                    particleCount: 5,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 }
                });
                confetti({
                    particleCount: 5,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 }
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            }());
        }

        modal.classList.remove('hidden');
        winnerImage.classList.remove('hidden');
        winnerImage.classList.remove('player1', 'player2');

        if (p1Score > p2Score) {
            modalTitle.textContent = "TAKUの勝ち!";
            modalMessage.textContent = `TAKUの勝利です! (${p1Score} - ${p2Score})`;
            winnerImage.classList.add('player1');
            recordGameResult(PLAYER1);
        } else if (p2Score > p1Score) {
            modalTitle.textContent = "emicofの勝ち!";
            modalMessage.textContent = `emicofの勝利です! (${p2Score} - ${p1Score})`;
            winnerImage.classList.add('player2');
            recordGameResult(PLAYER2);
        } else {
            modalTitle.textContent = "引き分け!";
            modalMessage.textContent = `互角の戦いでした! (${p1Score} - ${p2Score})`;
            winnerImage.classList.add('hidden');
            recordGameResult(null);
        }

        // コメントボタンを無効化
        commentBtn.disabled = true;
    }

    // Logic: Get valid moves
    function getValidMoves(player) {
        let moves = [];
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                if (board[r][c] === 0 && canFlip(r, c, player)) {
                    moves.push({ r, c });
                }
            }
        }
        return moves;
    }

    // Logic: Check if move can flip discs
    function canFlip(r, c, player) {
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];

        for (let d of directions) {
            if (checkDirection(r, c, d[0], d[1], player).length > 0) {
                return true;
            }
        }
        return false;
    }

    // Logic: Flip discs and return list of flipped positions
    function flipDiscs(r, c, player) {
        let flipped = [];
        const directions = [
            [-1, -1], [-1, 0], [-1, 1],
            [0, -1], [0, 1],
            [1, -1], [1, 0], [1, 1]
        ];

        for (let d of directions) {
            const captured = checkDirection(r, c, d[0], d[1], player);
            flipped.push(...captured);
        }
        return flipped;
    }

    // Logic: Helper to check specific direction
    function checkDirection(r, c, dr, dc, player) {
        let opponent = player === PLAYER1 ? PLAYER2 : PLAYER1;
        let captured = [];
        let r_curr = r + dr;
        let c_curr = c + dc;

        while (r_curr >= 0 && r_curr < BOARD_SIZE && c_curr >= 0 && c_curr < BOARD_SIZE) {
            if (board[r_curr][c_curr] === opponent) {
                captured.push({ r: r_curr, c: c_curr });
            } else if (board[r_curr][c_curr] === player) {
                return captured; // Found own disc enclosing opponent
            } else {
                return []; // Found empty space
            }
            r_curr += dr;
            c_curr += dc;
        }
        return []; // Reached edge
    }

    restartBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        if (isOnline && conn && conn.open) {
            conn.send({ type: 'restart' });
        }
        initGame();
    });

    // アンドゥボタンのイベントリスナー
    undoBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        undoMove();
    });

    // コメントボタンのイベントリスナー（長押しドラッグ対応）
    const setupDraggableButton = (btn, onClickHandler) => {
        let isDragging = false;
        let longPressTimer;
        let startX, startY;

        const onPointerDown = (e) => {
            // e.preventDefault(); // これを入れるとスクロールできなくなるので注意。長押し判定中に動いたらキャンセルするなど調整。
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;

            // 500ms 長押しでドラッグモード開始
            longPressTimer = setTimeout(() => {
                isDragging = true;
                btn.classList.add('dragging'); // 視覚フィードバック用クラス（必要ならCSS追加）
                btn.style.opacity = '0.5';
                btn.style.transform = 'scale(1.2)';
            }, 500);
        };

        const onPointerMove = (e) => {
            if (longPressTimer && !isDragging) {
                // 長押し判定中に指が大きく動いたらキャンセル（スクロール操作などを阻害しないため）
                const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);
                if (moveDist > 10) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
            }

            if (isDragging) {
                e.preventDefault(); // ドラッグ中は画面スクロールさせない
                // ボタンの中心を指に追従させる
                const btnSize = 60; // モバイルでのサイズ概算
                btn.style.left = `${e.clientX - btnSize / 2}px`;
                btn.style.top = `${e.clientY - btnSize / 2}px`;
                btn.style.bottom = 'auto'; // CSSの固定配置を解除
                btn.style.right = 'auto';
            }
        };

        const onPointerUp = (e) => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }

            btn.style.opacity = '';
            btn.style.transform = '';
            btn.classList.remove('dragging');

            if (isDragging) {
                // ドラッグ終了
                isDragging = false;
            } else {
                // ドラッグじゃなかったらクリック動作
                onClickHandler(e);
            }
        };

        btn.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    const openCommentMenu = (e) => {
        // e.preventDefault(); // setupDraggableButton内で制御するのでここでは不要
        if (!e.target.disabled) {
            commentMenu.classList.remove('hidden');
            // どちらのボタンが押されたかを記録
            // e.target は押された要素だが、setupDraggableButton の引数 btn を使うほうが確実かもしれないが、
            // イベント発生元からID取れるのでOK
            // ただし、pointerupイベントの実引数eが渡ってくる。

            // e.targetがアイコン(iタグ)などの場合があるのでclosestでボタンを探す
            const btn = e.target.closest('button');
            if (btn) {
                commentMenu.dataset.source = btn.id === 'comment-btn-left' ? 'left' : 'right';
            }
        }
    };

    setupDraggableButton(commentBtnLeft, openCommentMenu);
    setupDraggableButton(commentBtnRight, openCommentMenu);

    // メニューを閉じる
    closeMenuBtn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        commentMenu.classList.add('hidden');
    });

    // コメント選択肢のイベントリスナー
    commentOptions.forEach(option => {
        option.addEventListener('pointerup', (e) => {
            e.preventDefault();
            const commentIndex = parseInt(e.target.dataset.comment);
            const selectedComment = comments[commentIndex];

            // 押されたボタンの方向を取得（左ボタンなら右に流すのでdirection='left'、右ボタンなら左に流すのでdirection='right'） ...の逆？
            // ユーザー要望: 
            // 左ボタン -> 左から右に流れる ('slide-right' class, direction='left' passed logic?)
            // 右ボタン -> 右から左に流れる ('slide-left' class, direction='right' passed logic?)

            // sourceが 'left' (左ボタン) なら、左から右へ流す ('left' direction param -> 'slide-right' class)
            // sourceが 'right' (右ボタン) なら、右から左へ流す ('right' direction param -> 'slide-left' class)

            const source = commentMenu.dataset.source === 'left' ? 'left' : 'right';

            showComment(selectedComment, source);
            commentMenu.classList.add('hidden');

            // Online: Send comment + direction
            if (isOnline && conn && conn.open) {
                conn.send({ type: 'comment', message: selectedComment, direction: source });
            }
        });
    });

    // メニュー背景クリックで閉じる
    commentMenu.addEventListener('pointerup', (e) => {
        if (e.target === commentMenu) {
            commentMenu.classList.add('hidden');
        }
    });

    // コメントボタンの状態を更新する関数
    function updateCommentButton() {
        // 自分のターンでない場合のみコメントボタンを有効化
        const shouldDisable = gameOver || (isOnline && currentPlayer === myPlayerNum);

        commentBtnLeft.disabled = shouldDisable;
        commentBtnRight.disabled = shouldDisable;
    }

    // Initial Start
    initGame();
});
