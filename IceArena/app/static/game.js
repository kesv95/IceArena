(() => {
    "use strict";

    const GAME_CONFIG = window.ICE_ARENA_CONFIG;
    const {
        gameDuration: GAME_DURATION,
        trapDelay: TRAP_DELAY,
        freezeDuration: FREEZE_DURATION,
        maxHealth: MAX_HEALTH,
        baseTrapCapacity: BASE_TRAP_CAPACITY,
        baseBlastRange: BASE_BLAST_RANGE,
        itemLifetime: ITEM_LIFETIME,
        supplyInterval: SUPPLY_INTERVAL,
        icicleCooldown: ICICLE_COOLDOWN,
        icicleRange: ICICLE_RANGE,
        baseMoveDelay: BASE_MOVE_DELAY,
        iceLootChance: ICE_LOOT_CHANCE,
        iceLootBuffChance: ICE_LOOT_BUFF_CHANCE,
        initialIceBlockCount: INITIAL_ICE_BLOCK_COUNT,
        supplyMinItems: SUPPLY_MIN_ITEMS,
        supplyMaxItems: SUPPLY_MAX_ITEMS,
        mountSpeed: MOUNT_SPEED,
        mountMaxHp: MOUNT_MAX_HP
    } = GAME_CONFIG.settings;
    const CHARACTER_DEFS = GAME_CONFIG.characters;
    const MYSTERY_CHARACTER = GAME_CONFIG.mysteryCharacter;
    const YETI_CHANCE = GAME_CONFIG.yetiChance;
    const canvas = document.getElementById("arena");
    const ctx = canvas.getContext("2d");
    const overlay = document.getElementById("overlay");
    const overlayTitle = document.getElementById("overlay-title");
    const overlayMessage = document.getElementById("overlay-message");
    const startButton = document.getElementById("start-button");
    const restartButton = document.getElementById("restart-button");
    const characterSelectUi = document.getElementById("character-select-ui");
    const characterSelectGrid = document.getElementById("character-select-grid");
    const characterTraitPanel = document.getElementById("character-trait-panel");
    const pickerTabs = [document.getElementById("p1-picker-tab"), document.getElementById("p2-picker-tab")];
    const gameStateEl = document.getElementById("game-state");
    const gameTimeEl = document.getElementById("game-time");
    const trapCountEl = document.getElementById("trap-count");
    const eventMessageEl = document.getElementById("event-message");

    const COLS = 15;
    const ROWS = 13;
    const background = new Image();
    background.src = "/static/ice_arena_bg.png";

    background.onload = () => {
        if (game) draw();
    };
    background.onerror = () => {
        console.error("배경 이미지를 불러오지 못했습니다.");
    };

    canvas.width = 1280;
    canvas.height = 720;

    const keysDown = new Set();
    const keyQueue = [];
    let game = null;
    let lastFrame = 0;
    let elapsedMs = 0;
    let frameId = null;

    const directions = {
        KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0],
        ArrowUp: [0, -1], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowRight: [1, 0]
    };

    const selectedCharacters = ["penguin", "penguin"];
    const selectedAsMystery = [false, false];
    let activePickerPlayer = 0;

    function getCharacterDefinition(id) {
        return CHARACTER_DEFS.find(character => character.id === id) || CHARACTER_DEFS[0];
    }

    function getRemainingTime(now) {
        if (!game || game.startedAt === null) return GAME_DURATION;
        return Math.max(0, GAME_DURATION - (now - game.startedAt));
    }

    function applyCharacterTraits(player, characterId) {
        const character = getCharacterDefinition(characterId);
        player.characterId = character.id;
        player.moveSpeedMultiplier = character.moveSpeedMultiplier || 1;
        player.buffMultiplier = character.buffMultiplier || 1;
        player.bananaSlipSteps = character.bananaSlipSteps || GAME_CONFIG.items.banana.slipSteps;
        player.debuffDurationMultiplier = character.debuffDurationMultiplier || 1;
        player.trapCapacity = character.startingTrapCapacity || BASE_TRAP_CAPACITY;
        player.blastRange = character.startingBlastRange || BASE_BLAST_RANGE;
        player.trapShieldCharges = character.trapShieldCharges || 0;
        player.hasShoes = Boolean(character.hasShoes);
    }

    function showCharacterTrait(character, notice = "") {
        const title = document.createElement("h3");
        title.className = "character-trait-title";
        title.textContent = `${notice ? `${notice} · ` : ""}${character.icon} ${character.name} · ${character.trait}`;
        const description = document.createElement("p");
        description.className = "character-trait-description";
        description.textContent = character.description;
        characterTraitPanel.replaceChildren(title, description);
    }

    function renderCharacterPicker(previewCharacterId = null) {
        characterSelectGrid.replaceChildren();
        const pickerOptions = [...CHARACTER_DEFS.filter(character => character.id !== "yeti"), MYSTERY_CHARACTER];
        pickerOptions.forEach(character => {
            const button = document.createElement("button");
            button.type = "button";
            const selected = selectedAsMystery[activePickerPlayer]
                ? character.id === "mystery"
                : character.id !== "mystery" && selectedCharacters[activePickerPlayer] === character.id;
            button.className = `character-option${selected ? ` selected${activePickerPlayer === 1 ? " player-two" : ""}` : ""}`;
            button.setAttribute("aria-pressed", String(selected));
            button.dataset.characterId = character.id;
            const icon = document.createElement("span");
            icon.className = "character-option-icon";
            icon.textContent = character.icon;
            const name = document.createElement("span");
            name.className = "character-option-name";
            name.textContent = character.name;
            button.append(icon, name);
            button.addEventListener("mouseenter", () => showCharacterTrait(character));
            button.addEventListener("focus", () => showCharacterTrait(character));
            button.addEventListener("click", () => {
                let selectedId = character.id;
                if (character.id === "mystery") {
                    if (Math.random() < YETI_CHANCE) {
                        selectedId = "yeti";
                    } else {
                        const existingCharacters = CHARACTER_DEFS.filter(option => option.id !== "yeti");
                        selectedId = existingCharacters[Math.floor(Math.random() * existingCharacters.length)].id;
                    }
                    selectedAsMystery[activePickerPlayer] = true;
                } else {
                    selectedAsMystery[activePickerPlayer] = false;
                }
                selectedCharacters[activePickerPlayer] = selectedId;
                if (game && !game.running) {
                    applyCharacterTraits(game.players[activePickerPlayer], selectedId);
                    updateHud();
                }
                renderCharacterPicker(character.id === "mystery" ? "mystery" : selectedId);
            });
            characterSelectGrid.append(button);
        });

        pickerTabs.forEach((tab, index) => {
            const character = getCharacterDefinition(selectedCharacters[index]);
            tab.dataset.player = String(index + 1);
            tab.textContent = selectedAsMystery[index]
                ? `PLAYER ${index + 1} · ❔ ?`
                : `PLAYER ${index + 1} · ${character.icon} ${character.name}`;
            tab.classList.toggle("active", index === activePickerPlayer);
            tab.setAttribute("aria-pressed", String(index === activePickerPlayer));
        });
        const displayedCharacter = previewCharacterId === "mystery"
            ? MYSTERY_CHARACTER
            : previewCharacterId
                ? getCharacterDefinition(previewCharacterId)
                : selectedAsMystery[activePickerPlayer]
                    ? MYSTERY_CHARACTER
                    : getCharacterDefinition(selectedCharacters[activePickerPlayer]);
        showCharacterTrait(displayedCharacter);
    }

    function makeWalls() {
        const walls = new Set();
        for (let x = 0; x < COLS; x++) {
            walls.add(`${x},0`);
            walls.add(`${x},${ROWS - 1}`);
        }
        for (let y = 0; y < ROWS; y++) {
            walls.add(`0,${y}`);
            walls.add(`${COLS - 1},${y}`);
        }
        return walls;
    }

    function chooseRandomSpawns() {
        const candidates = [];
        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                if (!isPillarPosition(x, y)) candidates.push({x, y});
            }
        }

        const validPairs = [];
        for (let firstIndex = 0; firstIndex < candidates.length; firstIndex++) {
            for (let secondIndex = firstIndex + 1; secondIndex < candidates.length; secondIndex++) {
                const first = candidates[firstIndex];
                const second = candidates[secondIndex];
                const diagonalTileDistance = Math.max(Math.abs(first.x - second.x), Math.abs(first.y - second.y));
                if (diagonalTileDistance >= 8) validPairs.push([first, second]);
            }
        }

        return validPairs[Math.floor(Math.random() * validPairs.length)];
    }

    function createRandomObstacles() {
        game.pillars = new Set();
        game.iceBlocks = new Set();
        game.iceBlockLoot = new Map();

        // 규칙적인 격자 배치: 홀수 x와 홀수 y가 만나는 칸에만 기둥을 둡니다.
        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                if (!isPillarPosition(x, y)) continue;
                game.pillars.add(tileKey(x, y));
            }
        }

        // 후보 셀 수집: 기둥이 아닌 칸을 얼음 블록 후보로 사용합니다.
        const candidates = [];
        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                const key = tileKey(x, y);
                if (game.pillars.has(key)) continue;
                candidates.push({x, y});
            }
        }

        // 위치를 무작위로 섞기
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }

        // ── 얼음 블록을 무작위로 배치합니다. ──
        let iceCount = 0;
        for (const {x, y} of candidates) {
            if (iceCount >= INITIAL_ICE_BLOCK_COUNT) break;

            const key = tileKey(x, y);
            if (game.pillars.has(key)) continue;
            if (game.iceBlocks.has(key)) continue;

            game.iceBlocks.add(key);

            if (Math.random() < ICE_LOOT_CHANCE) {
                const roll = Math.random();
                let type;

                if (roll < ICE_LOOT_BUFF_CHANCE) {
                    const buffTypes = [...GAME_CONFIG.itemPools.buffs, ...GAME_CONFIG.itemPools.mounts];
                    type = buffTypes[Math.floor(Math.random() * buffTypes.length)];
                } else {
                    const debuffTypes = GAME_CONFIG.itemPools.debuffs;
                    type = debuffTypes[Math.floor(Math.random() * debuffTypes.length)];
                }

                game.iceBlockLoot.set(key, type);
            }
            iceCount++;
        }

        clearSpawnNeighbors();
    }

    function createPlayer(id, x, y, color, controls, characterId) {
        const player = {
            id, x, y, color,
            characterId,
            facing: id === 1 ? "front" : "back",
            attackUntil: 0,
            hurtUntil: 0,
            deathAt: 0,
            health: MAX_HEALTH,
            frozenUntil: 0,
            invulnerableUntil: 0,
            controls,
            trapCapacity: BASE_TRAP_CAPACITY,
            blastRange: BASE_BLAST_RANGE,
            slipUntil: 0,
            icicleReadyAt: 0,
            visualX: x, visualY: y, moveFromX: x, moveFromY: y,
            moveStartedAt: 0,
            moveDuration: 470,
            moveCooldown: 0,
            moveTimer: 0,
            wasMoving: false,
            bufferedDX: 0,
            bufferedDY: 0,
            lastMoveDX: 0,
            lastMoveDY: 0,
            hasSkates: false,
            glueUntil: 0,
            supermanUntil: 0,
            devilUntil: 0,
            hasShoes: false,
            // ── ③④ 탈것 상태 ──
            mountType: null,   // null | "fast" | "normal"
            mountHp: 0
        };
        applyCharacterTraits(player, characterId);
        return player;
    }

    function resetGame() {
        if (frameId !== null) cancelAnimationFrame(frameId);
        const now = performance.now();
        const [p1Spawn, p2Spawn] = chooseRandomSpawns();
        game = {
            running: false, ended: false, startedAt: null, nextSupplyAt: null,
            walls: makeWalls(),
            pillars: new Set(), iceBlocks: new Set(), iceBlockLoot: new Map(),
            iceTiles: new Map(), particles: [], traps: [], items: [], supplies: [], icicles: [],
            players: [
                createPlayer(1, p1Spawn.x, p1Spawn.y, "#54c8ff", {
                    up: "KeyW",
                    left: "KeyA",
                    down: "KeyS",
                    right: "KeyD",
                    trap: "KeyF",
                    special: ["KeyG"]
                }, selectedCharacters[0]),
                createPlayer(2, p2Spawn.x, p2Spawn.y, "#54c8ff", {
                    up: "ArrowUp", left: "ArrowLeft", down: "ArrowDown", right: "ArrowRight", trap: "Enter",
                    special: ["ShiftLeft", "ShiftRight"]
                }, selectedCharacters[1])
            ],
            winner: null
        };

        createRandomObstacles();
        keysDown.clear();
        keyQueue.length = 0;
        elapsedMs = 0;
        lastFrame = now;
        updateHud(now);
        draw(now);
        overlay.classList.remove("hidden");
        overlayTitle.textContent = "캐릭터 선택";
        overlayMessage.textContent = "각 플레이어가 캐릭터를 고르고 특성을 확인하세요.";
        characterSelectUi.classList.remove("hidden");
        startButton.textContent = "게임 시작";
        gameStateEl.textContent = "준비 완료";
        eventMessageEl.textContent = "시작 버튼을 눌러 경기를 시작하세요.";
    }

    function startGame() {
        if (!game || game.running || game.ended) return;
        game.running = true;
        game.startedAt = performance.now();
        lastFrame = game.startedAt;
        characterSelectUi.classList.add("hidden");
        overlay.classList.add("hidden");
        gameStateEl.textContent = "경기 진행 중";
        eventMessageEl.textContent = "얼음을 깨서 아이템을 획득하세요!";
        frameId = requestAnimationFrame(loop);
    }

    function endGame(winner) {
        if (!game || game.ended) return;
        game.running = false;
        game.ended = true;
        gameStateEl.textContent = winner === 0 ? "무승부" : `PLAYER ${winner} 승리`;
        overlayTitle.textContent = winner === 0 ? "무승부!" : `PLAYER ${winner} 승리!`;
        overlayMessage.textContent = winner === 0 ? "두 플레이어가 동시에 쓰러졌습니다." : `PLAYER ${winner}가 승리했습니다.`;
        startButton.textContent = "다시 플레이";
        characterSelectUi.classList.add("hidden");
        overlay.classList.remove("hidden");
        eventMessageEl.textContent = "새 경기 / 재시작 버튼으로 판을 초기화할 수 있습니다.";
        updateHud();
        draw();
    }

    function inside(x, y) {
        return x >= 1 && x <= COLS - 2 && y >= 1 && y <= ROWS - 2;
    }

    function tileKey(x, y) {
        return `${x},${y}`;
    }

    function isPillarPosition(x, y) {
        return x % 2 === 1 && y % 2 === 1;
    }

    function clearSpawnNeighbors() {
        game.players.forEach(player => {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const x = player.x + dx;
                    const y = player.y + dy;
                    if (!inside(x, y)) continue;
                    const key = tileKey(x, y);
                    if (game.pillars.has(key)) continue;
                    game.iceBlocks.delete(key);
                    game.iceBlockLoot.delete(key);
                    game.iceTiles.delete(key);
                }
            }
        });
    }

    function playerAt(x, y, exceptId = null) {
        return game.players.find(p => p.id !== exceptId && p.health > 0 && p.x === x && p.y === y);
    }

    function isBlocked(x, y, playerId) {
        if (!inside(x, y)) return true;
        const key = tileKey(x, y);
        if (game.walls.has(key) || game.pillars.has(key) || game.iceBlocks.has(key) || game.iceTiles.has(key)) return true;
        if (game.traps.some(t => t.x === x && t.y === y)) return true;
        return false;
    }

    function movePlayer(player, dx, dy, now) {
        if (!game.running || player.health <= 0 || now < player.frozenUntil) return;

        if (now < player.devilUntil) {
            dx = -dx;
            dy = -dy;
        }

        const nx = player.x + dx;
        const ny = player.y + dy;

        const trapAtDest = game.traps.find(t => t.x === nx && t.y === ny);
        let pushedTrap = false;

        if (trapAtDest && player.hasShoes) {
            let pushX = nx + dx;
            let pushY = ny + dy;
            let finalX = nx;
            let finalY = ny;

            while (true) {
                if (!inside(pushX, pushY)) break;
                const pushKey = tileKey(pushX, pushY);
                if (
                    game.walls.has(pushKey) ||
                    game.pillars.has(pushKey) ||
                    game.iceBlocks.has(pushKey) ||
                    game.iceTiles.has(pushKey)
                ) break;
                if (game.traps.some(t => t !== trapAtDest && t.x === pushX && t.y === pushY)) break;
                if (playerAt(pushX, pushY)) break;

                finalX = pushX;
                finalY = pushY;
                pushX += dx;
                pushY += dy;
            }

            trapAtDest.x = finalX;
            trapAtDest.y = finalY;
            trapAtDest.ownerId = player.id;
            pushedTrap = true;

            eventMessageEl.textContent = `PLAYER ${player.id}가 신발로 함정을 찼습니다!`;
        }

        if (isBlocked(nx, ny, player.id)) return;

        const visual = getVisualPosition(player, now);
        player.moveFromX = visual.x;
        player.moveFromY = visual.y;
        player.x = nx;
        player.y = ny;
        player.moveStartedAt = now;
        player.visualX = nx;
        player.visualY = ny;

        player.lastMoveDX = dx;
        player.lastMoveDY = dy;
        player.facing = dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "back" : "front";

        collectItem(player, now);

        if (now < player.devilUntil) {
            const currentTraps = countPlayerTraps(player.id);
            const maxCapacity = now < player.supermanUntil ? 4 : player.trapCapacity;
            if (currentTraps < maxCapacity && !game.traps.some(t => t.x === nx && t.y === ny)) {
                game.traps.push({
                    x: nx, y: ny, ownerId: player.id, detonatesAt: now + TRAP_DELAY, range: player.blastRange
                });
                eventMessageEl.textContent = `PLAYER ${player.id}가 악마의 저주로 강제 함정을 설치했습니다! (${currentTraps + 1}/${maxCapacity})`;
            }
        }

        updateHud(now);
    }

    function countPlayerTraps(playerId) {
        return game.traps.filter(t => t.ownerId === playerId).length;
    }

    function placeTrap(player, now) {
        if (!game.running || player.health <= 0 || now < player.frozenUntil) return;

        let capacity = player.trapCapacity;
        if (now < player.supermanUntil) capacity = 4;

        if (countPlayerTraps(player.id) >= capacity) {
            eventMessageEl.textContent = `PLAYER ${player.id}: 설치 가능한 함정이 없습니다.`;
            return;
        }
        if (game.traps.some(t => t.x === player.x && t.y === player.y)) {
            eventMessageEl.textContent = "이 칸에는 이미 함정이 있습니다.";
            return;
        }
        game.traps.push({
            x: player.x, y: player.y, ownerId: player.id, detonatesAt: now + TRAP_DELAY, range: player.blastRange
        });
        player.attackUntil = now + 420;
        eventMessageEl.textContent = `PLAYER ${player.id}가 얼음 함정을 설치했습니다!`;
        updateHud(now);
    }

    function throwIcicle(player, now) {
        if (!game.running || player.health <= 0 || now < player.frozenUntil) return;
        if (player.characterId !== "penguin") {
            eventMessageEl.textContent = `PLAYER ${player.id}: 고드름 던지기는 펭귄 전용 특성입니다.`;
            return;
        }
        if (now < player.icicleReadyAt) {
            const secondsLeft = Math.ceil((player.icicleReadyAt - now) / 1000);
            eventMessageEl.textContent = `PLAYER ${player.id}: 고드름을 ${secondsLeft}초 후 다시 던질 수 있습니다.`;
            return;
        }

        const direction = {
            front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0]
        }[player.facing] || [0, 1];
        let targetX = player.x;
        let targetY = player.y;
        let targetTrap = null;

        for (let distance = 1; distance <= ICICLE_RANGE; distance++) {
            const x = player.x + direction[0] * distance;
            const y = player.y + direction[1] * distance;
            if (!inside(x, y)) break;
            const key = tileKey(x, y);
            if (game.walls.has(key) || game.pillars.has(key) || game.iceBlocks.has(key) || game.iceTiles.has(key)) break;
            targetX = x;
            targetY = y;
            targetTrap = game.traps.find(trap => trap.x === x && trap.y === y) || null;
            if (targetTrap) break;
        }

        player.icicleReadyAt = now + ICICLE_COOLDOWN;
        const distance = Math.max(Math.abs(targetX - player.x), Math.abs(targetY - player.y));
        game.icicles.push({
            playerId: player.id, fromX: player.x, fromY: player.y, toX: targetX, toY: targetY,
            targetTrap, startedAt: now, duration: Math.max(160, distance * 65)
        });
        eventMessageEl.textContent = targetTrap
            ? `PLAYER ${player.id}가 고드름을 던졌습니다! 함정에 명중했습니다.`
            : `PLAYER ${player.id}가 고드름을 던졌지만 사거리 안에 함정이 없습니다.`;
    }

    function updateIcicles(now) {
        if (!game || game.icicles.length === 0) return;
        const pending = [];
        game.icicles.forEach(icicle => {
            if (now - icicle.startedAt < icicle.duration) {
                pending.push(icicle);
                return;
            }
            if (icicle.targetTrap && game.traps.includes(icicle.targetTrap)) {
                detonateTrap(icicle.targetTrap, now);
                eventMessageEl.textContent = `PLAYER ${icicle.playerId}의 고드름이 함정을 즉시 발동시켰습니다!`;
            }
        });
        game.icicles = pending;
    }

    function collectItem(player, now) {
        const index = game.items.findIndex(i => i.x === player.x && i.y === player.y);
        if (index < 0) return;
        const [item] = game.items.splice(index, 1);
        const itemDefinition = GAME_CONFIG.items[item.type];

        switch (item.type) {
            case "extraTrap":
                player.trapCapacity = Math.min(itemDefinition.max, player.trapCapacity + Math.ceil(itemDefinition.amount * player.buffMultiplier));
                eventMessageEl.textContent = `P${player.id}: 함정 한도 ${player.trapCapacity}개!`;
                break;
            case "blastRange":
                player.blastRange = Math.min(itemDefinition.max, player.blastRange + Math.ceil(itemDefinition.amount * player.buffMultiplier));
                eventMessageEl.textContent = `P${player.id}: 폭발 범위 ${player.blastRange}칸!`;
                break;
            case "rollerSkates":
                player.hasSkates = true;
                player.glueUntil = 0;
                eventMessageEl.textContent = `P${player.id}: 롤러 스케이트! (속도 증가)`;
                break;
            case "shoes":
                player.hasShoes = true;
                eventMessageEl.textContent = `P${player.id}: 신발 장착! (함정을 찰 수 있음)`;
                break;
            case "superman":
                const supermanDuration = itemDefinition.durationMs * player.buffMultiplier;
                player.supermanUntil = now + supermanDuration;
                eventMessageEl.textContent = `P${player.id}: 슈퍼맨! (${supermanDuration / 1000}초간 최대 능력치)`;
                break;
            // ── ③ 탈것 아이템 ──
            case "walrusFast":
                player.mountType = "fast";
                player.mountHp = MOUNT_MAX_HP;
                eventMessageEl.textContent = `P${player.id}: 해적 바다코끼리 탑승! (이동속도 2배)`;
                break;
            case "walrusNormal":
                player.mountType = "normal";
                player.mountHp = MOUNT_MAX_HP;
                eventMessageEl.textContent = `P${player.id}: 일반 바다코끼리 탑승! (이동속도 1.5배)`;
                break;
            case "banana":
                eventMessageEl.textContent = `P${player.id}: 바나나를 밟아 미끄러집니다!`;
                player.slipUntil = now + itemDefinition.durationMs;
                const dx = Math.sign(player.x - player.moveFromX) || (Math.random() < 0.5 ? 1 : -1);
                const dy = Math.sign(player.y - player.moveFromY) || 0;
                const direction = (dx !== 0 || dy !== 0) ? [dx, dy] : [1, 0];
                for (let step = 0; step < player.bananaSlipSteps; step++) {
                    const nx = player.x + direction[0];
                    const ny = player.y + direction[1];
                    if (isBlocked(nx, ny, player.id)) break;
                    player.moveFromX = player.x;
                    player.moveFromY = player.y;
                    player.x = nx;
                    player.y = ny;
                }
                // Resolve a pickup reached by the slide immediately. Delayed callbacks
                // can otherwise mutate a newly restarted game using this stale player.
                if (game.items.some(i => i.x === player.x && i.y === player.y)) {
                    collectItem(player, now);
                }
                break;
            case "glue":
                const glueDuration = itemDefinition.durationMs * player.debuffDurationMultiplier;
                player.glueUntil = now + glueDuration;
                eventMessageEl.textContent = `P${player.id}: 본드에 발이 붙었습니다! (${glueDuration / 1000}초간 속도 저하)`;
                break;
            case "devil":
                const devilDuration = itemDefinition.durationMs * player.debuffDurationMultiplier;
                player.devilUntil = now + devilDuration;
                eventMessageEl.textContent = `P${player.id}: 악마의 저주! (${devilDuration / 1000}초간 방향 반전, 강제 함정)`;
                break;
        }
        updateHud(now);
    }

    function createIceShards(x, y, now) {
        const c = tileCenter(x, y);
        for (let i = 0; i < 9; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 35 + Math.random() * 115;
            const size = 3 + Math.random() * 7;
            game.particles.push({
                x: c.x, y: c.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25,
                size, bornAt: now, life: 350 + Math.random() * 350,
                color: Math.random() < 0.5 ? "#c8f5ff" : "#ffffff",
                rotation: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 8
            });
        }
    }

    function updateParticles(now, delta) {
        if (!game) return;
        const seconds = delta / 1000;
        game.particles.forEach(particle => {
            particle.x += particle.vx * seconds;
            particle.y += particle.vy * seconds;
            particle.vy += 220 * seconds;
            particle.vx *= 0.985;
            particle.rotation += particle.spin * seconds;
        });
        game.particles = game.particles.filter(p => now - p.bornAt < p.life);
    }

    function detonateTrap(trap, now) {
        game.traps = game.traps.filter(t => t !== trap);

        const blastCells = [{x: trap.x, y: trap.y}];
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const iceToDestroy = [];

        dirs.forEach(([ddx, ddy]) => {
            for (let distance = 1; distance <= trap.range; distance++) {
                const bx = trap.x + ddx * distance;
                const by = trap.y + ddy * distance;

                if (!inside(bx, by)) break;

                const bKey = tileKey(bx, by);

                if (game.walls.has(bKey)) break;
                if (game.pillars.has(bKey)) break;

                if (game.iceBlocks.has(bKey)) {
                    iceToDestroy.push({x: bx, y: by});
                    break;
                }

                blastCells.push({x: bx, y: by});
            }
        });

        // ── ② 폭발 범위의 아이템 제거 ──
        const blastKeySet = new Set(blastCells.map(c => tileKey(c.x, c.y)));
        game.items = game.items.filter(item => !blastKeySet.has(tileKey(item.x, item.y)));

        // ── ④ 피해 판정 (탑승 중이면 탈것 체력으로 흡수 + 하차) ──
        const affected = [];
        const shielded = [];
        game.players.forEach(player => {
            if (player.health <= 0) return;

            const inBlast = blastCells.some(cell => cell.x === player.x && cell.y === player.y);
            if (inBlast && now >= player.invulnerableUntil) {
                player.hurtUntil = now + 420;
                if (player.mountType !== null) {
                    // 탑승 중: 목숨 대신 탈것 체력 감소, 함정 접촉 시 즉시 하차
                    player.mountHp -= 1;
                    player.invulnerableUntil = now + 900;
                    affected.push(`${player.id}(탈것)`);

                    if (player.mountHp <= 0) {
                        // 함정에 닿으면 하차
                        const mountName = player.mountType === "fast" ? "해적 바다코끼리" : "일반 바다코끼리";
                        player.mountType = null;
                        player.mountHp = 0;
                        eventMessageEl.textContent = `PLAYER ${player.id}의 ${mountName}가 함정에 맞아 하차했습니다! (목숨 보호)`;
                    }
                } else if (player.trapShieldCharges > 0) {
                    player.trapShieldCharges--;
                    player.invulnerableUntil = now + 900;
                    shielded.push(player.id);
                } else {
                    player.health -= 1;
                    if (player.health <= 0) player.deathAt = now;
                    player.frozenUntil = now + FREEZE_DURATION;
                    player.invulnerableUntil = now + 900;
                    affected.push(player.id);
                }
            }
        });

        blastCells.forEach(({x, y}) => {
            if (!inside(x, y)) return;
            const key = tileKey(x, y);
            if (!game.walls.has(key)) game.iceTiles.set(key, now + 500);
        });

        iceToDestroy.forEach(({x, y}) => {
            const key = tileKey(x, y);
            if (game.iceBlocks.has(key)) {
                createIceShards(x, y, now);
                game.iceBlocks.delete(key);
                const lootType = game.iceBlockLoot.get(key);
                game.iceBlockLoot.delete(key);
                if (lootType) game.items.push({x, y, type: lootType, bornAt: now});
            }
        });

        if (affected.length && shielded.length) {
            eventMessageEl.textContent = `얼음 폭발! PLAYER ${affected.join(", ")} 피해, PLAYER ${shielded.join(", ")} 늑대 특성으로 방어했습니다.`;
        } else if (affected.length) {
            eventMessageEl.textContent = `얼음 폭발! PLAYER ${affected.join(", ")} 피해를 입었습니다.`;
        } else if (shielded.length) {
            eventMessageEl.textContent = `PLAYER ${shielded.join(", ")}가 늑대의 생존 본능으로 함정 폭발을 막았습니다!`;
        } else {
            eventMessageEl.textContent = "얼음 함정이 발동했습니다. 폭발 범위를 피했습니다!";
        }

        const p1Dead = game.players[0].health <= 0;
        const p2Dead = game.players[1].health <= 0;
        if (p1Dead && p2Dead) endGame(0); else if (p1Dead) endGame(2); else if (p2Dead) endGame(1);
        updateHud(now);
    }

    function processInput(now, delta) {
        while (keyQueue.length) {
            const code = keyQueue.shift();
            if (!game.running) continue;
            if (code === "KeyF") placeTrap(game.players[0], now);
            else if (code === "Enter") placeTrap(game.players[1], now);
            else {
                const player = game.players.find(candidate => candidate.controls.special.includes(code));
                if (player) throwIcicle(player, now);
            }
        }

        game.players.forEach(player => {
            if (player.health <= 0 || now < player.frozenUntil) return;
            const c = player.controls;

            let dx = 0, dy = 0;
            if (keysDown.has(c.up)) dy = -1;
            else if (keysDown.has(c.down)) dy = 1;
            else if (keysDown.has(c.left)) dx = -1;
            else if (keysDown.has(c.right)) dx = 1;

            if (!dx && !dy) {
                player.moveTimer = 0;
                player.wasMoving = false;
                player.bufferedDX = 0;
                player.bufferedDY = 0;
                return;
            }

            let currentDelay = BASE_MOVE_DELAY / player.moveSpeedMultiplier;
            // ── ③ 탈것 속도 배율 적용 ──
            if (player.mountType !== null) {
                currentDelay /= MOUNT_SPEED[player.mountType] * player.buffMultiplier;
            } else if (player.hasSkates) {
                currentDelay *= GAME_CONFIG.items.rollerSkates.moveDelayMultiplier / player.buffMultiplier;
            }
            if (now < player.glueUntil) currentDelay *= GAME_CONFIG.items.glue.moveDelayMultiplier;

            // Keep the visual step in motion for almost the full gameplay step interval.
            // Scale with buffs/debuffs so faster mounts still move faster.
            player.moveDuration = currentDelay * 0.99;
            const animationDone = now >= player.moveStartedAt + player.moveDuration;

            if (!animationDone) {
                player.bufferedDX = dx;
                player.bufferedDY = dy;
                return;
            }

            const isFirstPress = !player.wasMoving;
            const directionChanged = player.lastMoveDX !== dx || player.lastMoveDY !== dy;
            const hasBuffered = player.bufferedDX !== 0 || player.bufferedDY !== 0;

            if (isFirstPress || directionChanged || hasBuffered) {
                const finalDX = hasBuffered ? player.bufferedDX : dx;
                const finalDY = hasBuffered ? player.bufferedDY : dy;
                movePlayer(player, finalDX, finalDY, now);
                player.bufferedDX = 0;
                player.bufferedDY = 0;
                player.moveTimer = 0;
                player.wasMoving = true;
                return;
            }

            player.moveTimer += delta;
            if (player.moveTimer >= currentDelay - player.moveDuration) {
                player.moveTimer = 0;
                movePlayer(player, dx, dy, now);
            }
        });
    }

    function updateTraps(now) {
        const ready = game.traps.filter(t => now >= t.detonatesAt);
        ready.forEach(t => {
            if (game.running) detonateTrap(t, now);
        });

        for (const [key, until] of game.iceTiles.entries()) {
            if (now >= until) game.iceTiles.delete(key);
        }

        game.items = game.items.filter(item => now - item.bornAt < ITEM_LIFETIME);
    }

    function updateSupplyDrop(now) {
        if (!game || !game.running) return;

        game.supplies.forEach(supply => {
            supply.items.forEach(item => {
                if (item.spawned || now < item.landsAt) return;
                game.items.push({x: item.x, y: item.y, type: item.type, bornAt: now});
                item.spawned = true;
            });
        });
        game.supplies = game.supplies.filter(supply => now - supply.bornAt < 2400);

        if (game.iceBlocks.size > 0) return;

        if (game.nextSupplyAt === null) {
            game.nextSupplyAt = now + SUPPLY_INTERVAL;
            eventMessageEl.textContent = "얼음이 모두 제거됐습니다. 25초 후 물개가 아이템 보급을 시작합니다!";
            return;
        }
        if (now < game.nextSupplyAt) return;

        const isFreeTile = (x, y) => {
            if (!inside(x, y)) return false;
            const key = tileKey(x, y);
            if (game.walls.has(key) || game.pillars.has(key) || game.iceBlocks.has(key) || game.iceTiles.has(key)) return false;
            if (game.traps.some(trap => trap.x === x && trap.y === y)) return false;
            if (game.items.some(item => item.x === x && item.y === y)) return false;
            if (game.players.some(player => player.health > 0 && player.x === x && player.y === y)) return false;
            if (game.supplies.some(supply => (supply.x === x && supply.y === y) ||
                supply.items.some(item => item.x === x && item.y === y))) return false;
            return true;
        };
        const candidates = [];
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (let y = 1; y < ROWS - 1; y++) {
            for (let x = 1; x < COLS - 1; x++) {
                if (!isFreeTile(x, y)) continue;
                const destinations = dirs
                    .map(([dx, dy]) => ({x: x + dx, y: y + dy}))
                    .filter(destination => isFreeTile(destination.x, destination.y));
                if (destinations.length >= 2) candidates.push({x, y, destinations});
            }
        }

        if (candidates.length === 0) {
            game.nextSupplyAt = now + 5000;
            return;
        }

        const requestedCount = SUPPLY_MIN_ITEMS + Math.floor(Math.random() * (SUPPLY_MAX_ITEMS - SUPPLY_MIN_ITEMS + 1));
        const eligibleSpawns = candidates.filter(candidate => candidate.destinations.length >= requestedCount);
        const itemCount = eligibleSpawns.length ? requestedCount : 2;
        const spawnPool = eligibleSpawns.length ? eligibleSpawns : candidates;
        const spawn = spawnPool[Math.floor(Math.random() * spawnPool.length)];
        for (let i = spawn.destinations.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [spawn.destinations[i], spawn.destinations[j]] = [spawn.destinations[j], spawn.destinations[i]];
        }
        const supplyGroups = GAME_CONFIG.itemPools.supplyCategories.map(category => GAME_CONFIG.itemPools[category]);
        const items = Array.from({length: itemCount}, (_, index) => {
            const group = supplyGroups[Math.floor(Math.random() * supplyGroups.length)];
            const type = group[Math.floor(Math.random() * group.length)];
            const destination = spawn.destinations[index];
            const spitAt = now + 500 + index * 300;
            return {
                x: destination.x, y: destination.y, type, icon: GAME_CONFIG.items[type].icon,
                spitAt, landsAt: spitAt + 500, spawned: false
            };
        });
        game.supplies.push({x: spawn.x, y: spawn.y, bornAt: now, items});
        game.nextSupplyAt = now + SUPPLY_INTERVAL;
        eventMessageEl.textContent = `물개가 아이템 ${itemCount}개를 뱉었습니다!`;
    }

    function loop(now) {
        if (!game || !game.running) return;
        const delta = Math.min(now - lastFrame, 50);
        lastFrame = now;
        elapsedMs += delta;

        processInput(now, delta);
        updateIcicles(now);
        updateTraps(now);
        updateSupplyDrop(now);
        updateParticles(now, delta);

        if (getRemainingTime(now) <= 0) {
            const [p1, p2] = game.players;
            endGame(p1.health === p2.health ? 0 : (p1.health > p2.health ? 1 : 2));
            updateHud(now);
            draw(now);
            return;
        }

        updateHud(now);
        draw(now);

        if (game.running) frameId = requestAnimationFrame(loop);
    }

    const GRID_WIDTH = 69;
    const GRID_HEIGHT = 48;
    const GRID_FIRST_CENTER_X = 159;
    const GRID_FIRST_CENTER_Y = 85;
    const GRID_OBJECT_SIZE = Math.min(GRID_WIDTH, GRID_HEIGHT);

    function tileCenter(x, y) {
        return {
            x: GRID_FIRST_CENTER_X + x * GRID_WIDTH,
            y: GRID_FIRST_CENTER_Y + y * GRID_HEIGHT
        };
    }

    function getVisualPosition(player, now) {
        if (!player.moveStartedAt) return {x: player.x, y: player.y};

        const progress = Math.max(0, Math.min(1, (now - player.moveStartedAt) / player.moveDuration));

        if (progress >= 1) {
            return {x: player.x, y: player.y};
        }

        // Constant-speed interpolation avoids the stop-start feeling at every tile edge.
        const eased = progress;

        const dx = player.x - player.moveFromX;
        const dy = player.y - player.moveFromY;

        return {
            x: dx === 0 ? player.x : player.moveFromX + dx * eased,
            y: dy === 0 ? player.y : player.moveFromY + dy * eased
        };
    }

    function drawAnimalEllipse(ctx, x, y, rx, ry, fill, stroke = "#24364a", lineWidth = 2) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        if (stroke) ctx.stroke();
    }

    function drawAnimalTriangle(ctx, points, fill, stroke = "#24364a", lineWidth = 2) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        points.slice(1).forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        ctx.fill();
        if (stroke) ctx.stroke();
    }

    function drawAnimalCharacter(ctx, characterId, x, y, scarfColor) {
        const outline = "#26364a";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        switch (characterId) {
            case "polarBear":
                drawAnimalEllipse(ctx, x - 9, y + 12, 8, 4.5, "#d9e7ed", outline, 1.5);
                drawAnimalEllipse(ctx, x + 9, y + 12, 8, 4.5, "#d9e7ed", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 3, 18, 21, "#f4f8f8", outline);
                drawAnimalEllipse(ctx, x - 12, y - 33, 5.5, 5.5, "#f4f8f8", outline, 1.5);
                drawAnimalEllipse(ctx, x + 12, y - 33, 5.5, 5.5, "#f4f8f8", outline, 1.5);
                drawAnimalEllipse(ctx, x - 12, y - 33, 2.8, 3, "#e7aab2", null);
                drawAnimalEllipse(ctx, x + 12, y - 33, 2.8, 3, "#e7aab2", null);
                drawAnimalEllipse(ctx, x, y - 23, 15, 13, "#ffffff", outline, 1.8);
                drawAnimalEllipse(ctx, x - 6, y - 26, 1.9, 2.2, "#26364a", null);
                drawAnimalEllipse(ctx, x + 6, y - 26, 1.9, 2.2, "#26364a", null);
                drawAnimalEllipse(ctx, x, y - 20, 3, 2.4, "#3a4650", null);
                drawAnimalEllipse(ctx, x - 5, y - 17, 4, 3, "#edf2f3", null);
                drawAnimalEllipse(ctx, x + 5, y - 17, 4, 3, "#edf2f3", null);
                break;

            case "arcticFox":
                // Large brush tail and narrow muzzle make the fox silhouette distinct.
                drawAnimalEllipse(ctx, x + 18, y + 4, 12, 8, "#e77835", outline, 1.5);
                drawAnimalTriangle(ctx, [[x + 23, y - 1], [x + 30, y + 4], [x + 23, y + 9]], "#fff4df", null);
                drawAnimalEllipse(ctx, x - 8, y + 12, 7, 4, "#f2e7d7", outline, 1.5);
                drawAnimalEllipse(ctx, x + 8, y + 12, 7, 4, "#f2e7d7", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 3, 12, 19, "#e77835", outline);
                drawAnimalTriangle(ctx, [[x - 12, y - 27], [x - 14, y - 44], [x - 2, y - 32]], "#e77835");
                drawAnimalTriangle(ctx, [[x + 12, y - 27], [x + 14, y - 44], [x + 2, y - 32]], "#e77835");
                drawAnimalTriangle(ctx, [[x - 10, y - 30], [x - 11, y - 40], [x - 5, y - 32]], "#f5c0b1", null);
                drawAnimalTriangle(ctx, [[x + 10, y - 30], [x + 11, y - 40], [x + 5, y - 32]], "#f5c0b1", null);
                drawAnimalEllipse(ctx, x, y - 24, 12, 12, "#ed873f", outline, 1.8);
                drawAnimalTriangle(ctx, [[x - 8, y - 21], [x + 8, y - 21], [x, y - 11]], "#fff1df", null);
                drawAnimalEllipse(ctx, x - 4, y - 26, 1.7, 2.1, "#26364a", null);
                drawAnimalEllipse(ctx, x + 4, y - 26, 1.7, 2.1, "#26364a", null);
                drawAnimalTriangle(ctx, [[x - 2.5, y - 17], [x + 2.5, y - 17], [x, y - 14]], "#3b2a27", null);
                break;

            case "mammoth":
                drawAnimalEllipse(ctx, x - 8, y + 12, 7, 4, "#76605a", outline, 1.5);
                drawAnimalEllipse(ctx, x + 8, y + 12, 7, 4, "#76605a", outline, 1.5);
                drawAnimalEllipse(ctx, x - 17, y + 1, 8, 11, "#9c7e70", outline, 1.5);
                drawAnimalEllipse(ctx, x + 17, y + 1, 8, 11, "#9c7e70", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 3, 20, 20, "#8c7165", outline);
                drawAnimalEllipse(ctx, x - 14, y - 26, 8, 9, "#a68676", outline, 1.5);
                drawAnimalEllipse(ctx, x + 14, y - 26, 8, 9, "#a68676", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 24, 16, 14, "#aa8874", outline, 1.8);
                drawAnimalEllipse(ctx, x - 6, y - 27, 1.8, 2.2, "#241f24", null);
                drawAnimalEllipse(ctx, x + 6, y - 27, 1.8, 2.2, "#241f24", null);
                ctx.strokeStyle = "#f4ead6";
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(x - 11, y - 18);
                ctx.quadraticCurveTo(x - 19, y - 9, x - 10, y - 4);
                ctx.moveTo(x + 11, y - 18);
                ctx.quadraticCurveTo(x + 19, y - 9, x + 10, y - 4);
                ctx.stroke();
                ctx.strokeStyle = "#8a5b45";
                ctx.lineWidth = 7;
                ctx.beginPath();
                ctx.moveTo(x, y - 19);
                ctx.bezierCurveTo(x + 4, y - 12, x - 2, y - 7, x + 3, y - 2);
                ctx.stroke();
                break;

            case "owl":
                drawAnimalTriangle(ctx, [[x - 13, y - 27], [x - 12, y - 42], [x - 3, y - 32]], "#765747");
                drawAnimalTriangle(ctx, [[x + 13, y - 27], [x + 12, y - 42], [x + 3, y - 32]], "#765747");
                drawAnimalEllipse(ctx, x - 8, y + 12, 6, 4, "#e4a43e", outline, 1.5);
                drawAnimalEllipse(ctx, x + 8, y + 12, 6, 4, "#e4a43e", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 5, 18, 20, "#765747", outline);
                drawAnimalEllipse(ctx, x - 7, y + 1, 8, 11, "#a67b5c", outline, 1.5);
                drawAnimalEllipse(ctx, x + 7, y + 1, 8, 11, "#a67b5c", outline, 1.5);
                drawAnimalEllipse(ctx, x, y + 1, 11, 11, "#d7b98d", null);
                drawAnimalEllipse(ctx, x - 7, y - 24, 9, 9, "#fff2d5", outline, 1.5);
                drawAnimalEllipse(ctx, x + 7, y - 24, 9, 9, "#fff2d5", outline, 1.5);
                drawAnimalEllipse(ctx, x - 7, y - 24, 4, 5, "#d88926", null);
                drawAnimalEllipse(ctx, x + 7, y - 24, 4, 5, "#d88926", null);
                drawAnimalEllipse(ctx, x - 7, y - 24, 1.8, 2.6, "#172536", null);
                drawAnimalEllipse(ctx, x + 7, y - 24, 1.8, 2.6, "#172536", null);
                drawAnimalTriangle(ctx, [[x - 4, y - 14], [x + 4, y - 14], [x, y - 8]], "#e6a52f", outline, 1);
                ctx.strokeStyle = "#e8d9c5";
                ctx.lineWidth = 1.5;
                [-4, 0, 4].forEach(offset => {
                    ctx.beginPath();
                    ctx.moveTo(x + offset, y + 4);
                    ctx.lineTo(x + offset - 2, y + 10);
                    ctx.stroke();
                });
                break;

            case "arcticHare":
                ctx.save();
                ctx.translate(x - 6, y - 37);
                ctx.rotate(-0.14);
                drawAnimalEllipse(ctx, 0, 0, 6, 20, "#f4f7f7", outline, 1.5);
                drawAnimalEllipse(ctx, 0, -1, 3.1, 15, "#e99aa9", null);
                ctx.restore();
                ctx.save();
                ctx.translate(x + 7, y - 37);
                ctx.rotate(0.2);
                drawAnimalEllipse(ctx, 0, 0, 6, 20, "#f4f7f7", outline, 1.5);
                drawAnimalEllipse(ctx, 0, -1, 3.1, 15, "#e99aa9", null);
                ctx.restore();
                // Round tail and oversized hind feet make the hare silhouette distinct.
                drawAnimalEllipse(ctx, x + 14, y + 2, 6, 6, "#ffffff", outline, 1.2);
                drawAnimalEllipse(ctx, x - 10, y + 12, 10, 5, "#e7edf0", outline, 1.5);
                drawAnimalEllipse(ctx, x + 10, y + 12, 10, 5, "#e7edf0", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 4, 12, 18, "#eef3f4", outline);
                drawAnimalEllipse(ctx, x, y - 23, 14, 13, "#f5f7f7", outline, 1.8);
                drawAnimalEllipse(ctx, x - 4.5, y - 25, 1.8, 2.4, "#273b4c", null);
                drawAnimalEllipse(ctx, x + 4.5, y - 25, 1.8, 2.4, "#273b4c", null);
                // Raised white muzzle pads and pink nose keep the rabbit face readable.
                drawAnimalEllipse(ctx, x - 5.5, y - 16, 5.5, 4, "#ffffff", null);
                drawAnimalEllipse(ctx, x + 5.5, y - 16, 5.5, 4, "#ffffff", null);
                drawAnimalEllipse(ctx, x, y - 18, 2.5, 2, "#e99aa9", null);
                ctx.strokeStyle = "#8a9aa6";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - 8, y - 17);
                ctx.lineTo(x - 15, y - 19);
                ctx.moveTo(x - 8, y - 15);
                ctx.lineTo(x - 15, y - 14);
                ctx.moveTo(x + 8, y - 17);
                ctx.lineTo(x + 15, y - 19);
                ctx.moveTo(x + 8, y - 15);
                ctx.lineTo(x + 15, y - 14);
                ctx.stroke();
                break;

            case "reindeer":
                drawAnimalEllipse(ctx, x - 8, y + 12, 7, 4, "#8c5a3c", outline, 1.5);
                drawAnimalEllipse(ctx, x + 8, y + 12, 7, 4, "#8c5a3c", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 4, 15, 20, "#9b6848", outline);
                drawAnimalEllipse(ctx, x - 11, y - 27, 5, 3, "#9b6848", outline, 1.5);
                drawAnimalEllipse(ctx, x + 11, y - 27, 5, 3, "#9b6848", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 24, 13, 12, "#a97957", outline, 1.8);
                ctx.strokeStyle = "#c5a36b";
                ctx.lineWidth = 3.5;
                [[-7, -13, -11], [7, 13, 11]].forEach(([baseX, tipX, outerX]) => {
                    ctx.beginPath();
                    ctx.moveTo(x + baseX, y - 30);
                    ctx.lineTo(x + tipX, y - 42);
                    ctx.lineTo(x + outerX, y - 46);
                    ctx.moveTo(x + tipX, y - 42);
                    ctx.lineTo(x + tipX, y - 49);
                    ctx.moveTo(x + tipX, y - 42);
                    ctx.lineTo(x + tipX + (tipX < 0 ? -4 : 4), y - 46);
                    ctx.stroke();
                });
                drawAnimalEllipse(ctx, x, y - 20, 8, 6, "#c49170", null);
                drawAnimalEllipse(ctx, x - 4, y - 27, 1.7, 2.1, "#27313e", null);
                drawAnimalEllipse(ctx, x + 4, y - 27, 1.7, 2.1, "#27313e", null);
                drawAnimalEllipse(ctx, x, y - 18, 3, 2.8, "#c8414b", null);
                break;

            case "wolf":
                drawAnimalEllipse(ctx, x - 8, y + 12, 7, 4, "#778897", outline, 1.5);
                drawAnimalEllipse(ctx, x + 8, y + 12, 7, 4, "#778897", outline, 1.5);
                drawAnimalEllipse(ctx, x + 17, y + 1, 11, 6, "#8294a1", outline, 1.5);
                drawAnimalTriangle(ctx, [[x + 22, y - 2], [x + 30, y + 1], [x + 22, y + 5]], "#dbe4e8", null);
                drawAnimalEllipse(ctx, x, y - 4, 14, 19, "#718493", outline);
                drawAnimalTriangle(ctx, [[x - 13, y - 27], [x - 12, y - 43], [x - 2, y - 32]], "#718493");
                drawAnimalTriangle(ctx, [[x + 13, y - 27], [x + 12, y - 43], [x + 2, y - 32]], "#718493");
                drawAnimalTriangle(ctx, [[x - 10, y - 30], [x - 10, y - 38], [x - 5, y - 32]], "#c99ca2", null);
                drawAnimalTriangle(ctx, [[x + 10, y - 30], [x + 10, y - 38], [x + 5, y - 32]], "#c99ca2", null);
                drawAnimalEllipse(ctx, x, y - 23, 13, 12, "#8296a3", outline, 1.8);
                drawAnimalTriangle(ctx, [[x - 11, y - 22], [x + 11, y - 22], [x + 5, y - 13], [x, y - 10], [x - 5, y - 13]], "#dce5e8", null);
                drawAnimalEllipse(ctx, x - 5, y - 25, 1.7, 2, "#ddbd65", null);
                drawAnimalEllipse(ctx, x + 5, y - 25, 1.7, 2, "#ddbd65", null);
                drawAnimalTriangle(ctx, [[x - 4, y - 17], [x + 4, y - 17], [x, y - 12]], "#303a43", null);
                break;

            case "yeti":
                drawAnimalEllipse(ctx, x - 8, y + 12, 7, 4, "#c5dce5", outline, 1.5);
                drawAnimalEllipse(ctx, x + 8, y + 12, 7, 4, "#c5dce5", outline, 1.5);
                drawAnimalEllipse(ctx, x - 16, y + 1, 7, 9, "#cce3e9", outline, 1.5);
                drawAnimalEllipse(ctx, x + 16, y + 1, 7, 9, "#cce3e9", outline, 1.5);
                drawAnimalEllipse(ctx, x - 17, y + 1, 8, 11, "#cce3e9", outline, 1.5);
                drawAnimalEllipse(ctx, x + 17, y + 1, 8, 11, "#cce3e9", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 4, 19, 22, "#d9edf0", outline);
                drawAnimalTriangle(ctx, [[x - 16, y - 25], [x - 21, y - 31], [x - 12, y - 30]], "#d9edf0", outline, 1.5);
                drawAnimalTriangle(ctx, [[x - 12, y - 28], [x - 16, y - 36], [x - 7, y - 33]], "#d9edf0", outline, 1.5);
                drawAnimalTriangle(ctx, [[x - 3, y - 31], [x, y - 40], [x + 4, y - 31]], "#d9edf0", outline, 1.5);
                drawAnimalTriangle(ctx, [[x + 7, y - 33], [x + 16, y - 37], [x + 12, y - 27]], "#d9edf0", outline, 1.5);
                drawAnimalTriangle(ctx, [[x + 12, y - 30], [x + 21, y - 32], [x + 16, y - 24]], "#d9edf0", outline, 1.5);
                drawAnimalEllipse(ctx, x, y - 23, 14, 12, "#b9d6e1", outline, 1.8);
                drawAnimalEllipse(ctx, x - 5, y - 24, 2.2, 2.8, "#443751", null);
                drawAnimalEllipse(ctx, x + 5, y - 24, 2.2, 2.8, "#443751", null);
                drawAnimalEllipse(ctx, x, y - 17, 6, 3, "#778b9a", null);
                break;
        }

        // Shared scarf gives each drawn animal the same player color accent.
        ctx.fillStyle = scarfColor;
        ctx.strokeStyle = "#f5fdff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x - 12, y - 13, 24, 6, 3);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(x + 5, y - 9, 6, 10, 2);
        ctx.fill();
        ctx.stroke();

        if (characterId === "arcticHare") {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = outline;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(x - 3.3, y - 7, 2.8, 5, 1);
            ctx.roundRect(x + 0.5, y - 7, 2.8, 5, 1);
            ctx.fill();
            ctx.stroke();
        }
    }

    function draw(now = performance.now()) {
        if (!game) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (background.complete && background.naturalWidth > 0) {
            ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.fillStyle = "#dff6ff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.save();

        for (const key of game.pillars) {
            const [x, y] = key.split(",").map(Number);
            const c = tileCenter(x, y);
            ctx.save();
            ctx.fillStyle = "rgba(10, 50, 80, 0.22)";
            ctx.beginPath();
            ctx.ellipse(c.x + 2, c.y + 13, 24, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            const side = ctx.createLinearGradient(c.x - 20, c.y, c.x + 22, c.y);
            side.addColorStop(0, "#426f89");
            side.addColorStop(0.35, "#8dc5dc");
            side.addColorStop(0.7, "#4d829d");
            side.addColorStop(1, "#315d78");
            ctx.fillStyle = side;
            ctx.beginPath();
            ctx.roundRect(c.x - 20, c.y - 17, 40, 36, 8);
            ctx.fill();
            const top = ctx.createLinearGradient(c.x - 18, c.y - 28, c.x + 18, c.y - 5);
            top.addColorStop(0, "#f5fdff");
            top.addColorStop(0.5, "#bcecff");
            top.addColorStop(1, "#73b8d5");
            ctx.fillStyle = top;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 17, 20, 11, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 얼음 블록
        for (const key of game.iceBlocks) {
            const [x, y] = key.split(",").map(Number);
            const c = tileCenter(x, y);
            const size = GRID_OBJECT_SIZE - 8;
            const left = c.x - size / 2;
            const top = c.y - size / 2;
            ctx.save();
            ctx.fillStyle = "rgba(35, 145, 190, 0.20)";
            ctx.beginPath();
            ctx.roundRect(left + 3, top + 5, size, size, 12);
            ctx.fill();
            ctx.shadowColor = "rgba(94, 218, 255, 0.5)";
            ctx.shadowBlur = 12;
            const ice = ctx.createLinearGradient(left, top, left + size, top + size);
            ice.addColorStop(0, "rgba(246, 254, 255, 0.98)");
            ice.addColorStop(0.35, "rgba(177, 237, 255, 0.94)");
            ice.addColorStop(0.72, "rgba(116, 207, 239, 0.92)");
            ice.addColorStop(1, "rgba(194, 245, 255, 0.98)");
            ctx.fillStyle = ice;
            ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(left, top, size, size, 11);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // 폭발 얼음 타일
        for (const [key, until] of game.iceTiles.entries()) {
            const [x, y] = key.split(",").map(Number);
            const c = tileCenter(x, y);
            const remaining = Math.max(0, Math.min(1, (until - now) / 500));
            const size = (GRID_OBJECT_SIZE - 4) * (1 + Math.sin(now / 35) * 0.035);
            ctx.save();
            ctx.globalAlpha = remaining;
            ctx.shadowColor = "#4edcff";
            ctx.shadowBlur = 22;
            const blast = ctx.createRadialGradient(c.x, c.y, 2, c.x, c.y, size * 0.72);
            blast.addColorStop(0, "rgba(255,255,255,0.98)");
            blast.addColorStop(0.35, "rgba(131,235,255,0.95)");
            blast.addColorStop(1, "rgba(40,160,255,0.38)");
            ctx.fillStyle = blast;
            ctx.beginPath();
            ctx.roundRect(c.x - size / 2, c.y - size / 2, size, size, 12);
            ctx.fill();
            ctx.restore();
        }

        // 함정
        game.traps.forEach(trap => {
            const c = tileCenter(trap.x, trap.y);
            const pulse = 1 + Math.sin(now / 95) * .10;
            ctx.save();
            ctx.translate(c.x, c.y - 5);
            ctx.scale(pulse, pulse);
            ctx.fillStyle = "rgba(0, 20, 40, .35)";
            ctx.beginPath();
            ctx.ellipse(0, 19, 22, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = .32;
            ctx.fillStyle = "#2dbfff"; // p1, p2의 함정의 색 통일
            ctx.beginPath();
            ctx.arc(0, 3, 26, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            const orb = ctx.createRadialGradient(-7, -10, 3, 0, 0, 22);
            orb.addColorStop(0, "#ffffff");
            orb.addColorStop(.42, "#83e4ff");
            orb.addColorStop(1, "#0879bb");
            ctx.fillStyle = orb;
            ctx.strokeStyle = "#effcff";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 1, 19, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // 아이템
        game.items.forEach(item => {
            if (game.iceBlocks.has(tileKey(item.x, item.y))) return;
            const c = tileCenter(item.x, item.y);
            const bob = Math.sin(now / 180 + item.x) * 4;
            const pulse = 1 + Math.sin(now / 130 + item.y) * 0.06;

            const timeLeft = ITEM_LIFETIME - (now - item.bornAt);
            let alpha = 1;
            if (timeLeft < 3000) {
                alpha = 0.4 + 0.6 * Math.abs(Math.sin(now / 100));
            }

            const itemDefinition = GAME_CONFIG.items[item.type] || {};
            const symbol = itemDefinition.icon || "?";

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(c.x, c.y - 5 + bob);
            ctx.scale(pulse, pulse);

            ctx.fillStyle = "rgba(20, 65, 100, 0.20)";
            ctx.beginPath();
            ctx.ellipse(0, 22 - bob, 14, 5, 0, 0, Math.PI * 2);
            ctx.fill();

            const isDebuff = itemDefinition.category === "debuff";
            if (isDebuff) {
                ctx.shadowColor = "#ef4444";
                ctx.shadowBlur = 20;
                const orb = ctx.createRadialGradient(-6, -7, 2, 0, 0, 21);
                orb.addColorStop(0, "#fee2e2");
                orb.addColorStop(0.4, "#f87171");
                orb.addColorStop(1, "#dc2626");
                ctx.fillStyle = orb;
                ctx.strokeStyle = "rgba(255,225,225,0.98)";
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(0, 0, 17, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }

            ctx.shadowBlur = 0;
            ctx.fillStyle = isDebuff ? "#7f1d1d" : "#263c58";
            ctx.font = "900 20px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(symbol, 0, 1);

            ctx.restore();
        });

        // Moving seal supply: it pops up, tosses an item to a nearby tile, then leaves.
        game.supplies.forEach(supply => {
            const age = now - supply.bornAt;
            const origin = tileCenter(supply.x, supply.y);
            const emerge = Math.min(1, Math.max(0, age / 350));
            const lastLanding = supply.items[supply.items.length - 1].landsAt - supply.bornAt;
            const leave = age > lastLanding + 450 ? Math.max(0, 1 - (age - lastLanding - 450) / 350) : 1;

            ctx.save();
            ctx.globalAlpha = emerge * leave;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(12, 42, 72, .5)";
            ctx.shadowBlur = 10;
            ctx.font = "34px sans-serif";
            ctx.fillText("🦭", origin.x, origin.y + 6 + (1 - emerge) * 24);
            ctx.shadowBlur = 0;

            supply.items.forEach(supplyItem => {
                const flightAge = now - supplyItem.spitAt;
                if (flightAge < 0 || flightAge >= 500) return;
                const target = tileCenter(supplyItem.x, supplyItem.y);
                const flight = flightAge / 500;
                const itemX = origin.x + 12 + (target.x - origin.x - 12) * flight;
                const itemY = origin.y - 15 + (target.y - origin.y + 7) * flight - Math.sin(flight * Math.PI) * 28;
                ctx.font = "20px sans-serif";
                ctx.fillText(supplyItem.icon, itemX, itemY);
            });
            ctx.restore();
        });

        game.icicles.forEach(icicle => {
            const progress = Math.max(0, Math.min(1, (now - icicle.startedAt) / icicle.duration));
            const from = tileCenter(icicle.fromX, icicle.fromY);
            const to = tileCenter(icicle.toX, icicle.toY);
            const x = from.x + (to.x - from.x) * progress;
            const y = from.y - 18 + (to.y - from.y) * progress - Math.sin(progress * Math.PI) * 10;
            const angle = Math.atan2(to.y - from.y, to.x - from.x);

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle + Math.PI / 2);
            ctx.shadowColor = "#8be8ff";
            ctx.shadowBlur = 14;
            ctx.fillStyle = "#dffaff";
            ctx.strokeStyle = "#58c8f2";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(6, -3);
            ctx.lineTo(4, 9);
            ctx.lineTo(0, 13);
            ctx.lineTo(-4, 9);
            ctx.lineTo(-6, -3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // 파티클
        game.particles.forEach(particle => {
            const progress = (now - particle.bornAt) / particle.life;
            const alpha = Math.max(0, 1 - progress);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(particle.x, particle.y);
            ctx.rotate(particle.rotation);
            ctx.fillStyle = particle.color;
            ctx.beginPath();
            ctx.moveTo(0, -particle.size);
            ctx.lineTo(particle.size * 0.8, 0);
            ctx.lineTo(0, particle.size * 0.65);
            ctx.lineTo(-particle.size * 0.65, 0);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        });

        // 플레이어
        game.players.forEach(player => {
            const visual = getVisualPosition(player, now);
            const c = tileCenter(visual.x, visual.y);
            const frozen = now < player.frozenUntil;

            ctx.save();
            if (now < player.supermanUntil) {
                ctx.shadowColor = "#fbbf24";
                ctx.shadowBlur = 25;
            } else if (now < player.devilUntil) {
                ctx.shadowColor = "#9333ea";
                ctx.shadowBlur = 20;
            } else if (player.mountType === "fast") {
                ctx.shadowColor = "#f97316";
                ctx.shadowBlur = 20;
            } else if (player.mountType === "normal") {
                ctx.shadowColor = "#38bdf8";
                ctx.shadowBlur = 18;
            } else if (player.hasSkates) {
                ctx.shadowColor = "#4ade80";
                ctx.shadowBlur = 15;
            } else if (now < player.glueUntil) {
                ctx.shadowColor = "#9ca3af";
                ctx.shadowBlur = 15;
            }

            if (frozen) ctx.globalAlpha = .65;

            // 그림자
            ctx.fillStyle = "rgba(0, 43, 70, .35)";
            ctx.beginPath();
            ctx.ellipse(c.x, c.y + 15, 22, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            if (player.characterId === "penguin") {
            // 발
            ctx.fillStyle = "#ff9e2c";
            ctx.strokeStyle = "#c75a00";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(c.x - 9, c.y + 13, 7, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(c.x + 9, c.y + 13, 7, 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 날개
            ctx.fillStyle = "#1a2a3a";
            ctx.strokeStyle = "#0a1420";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(c.x - 20, c.y - 5, 6, 14, -0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(c.x + 20, c.y - 5, 6, 14, 0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 몸통
            const bodyGrad = ctx.createRadialGradient(c.x - 6, c.y - 20, 4, c.x, c.y - 5, 30);
            bodyGrad.addColorStop(0, "#3a4d5e");
            bodyGrad.addColorStop(0.5, "#1a2a3a");
            bodyGrad.addColorStop(1, "#0a1420");
            ctx.fillStyle = bodyGrad;
            ctx.strokeStyle = "#f5fdff";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 5, 18, 24, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // 흰 배
            const bellyGrad = ctx.createRadialGradient(c.x - 4, c.y, 2, c.x, c.y + 4, 18);
            bellyGrad.addColorStop(0, "#ffffff");
            bellyGrad.addColorStop(1, "#d8ecf5");
            ctx.fillStyle = bellyGrad;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y + 3, 12, 16, 0, 0, Math.PI * 2);
            ctx.fill();

            // 목도리
            ctx.fillStyle = player.color;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y - 18, 15, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(c.x + 6, c.y - 16, 7, 14, 3);
            ctx.fill();
            ctx.stroke();

            // 눈
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(c.x - 6, c.y - 10, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(c.x + 6, c.y - 10, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.arc(c.x - 5, c.y - 10, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(c.x + 7, c.y - 10, 2.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(c.x - 5.5, c.y - 11, 0.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(c.x + 6.5, c.y - 11, 0.9, 0, Math.PI * 2);
            ctx.fill();

            // 부리
            ctx.fillStyle = "#e63946";
            ctx.strokeStyle = "#8b0000";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(c.x - 4, c.y - 4);
            ctx.lineTo(c.x + 4, c.y - 4);
            ctx.lineTo(c.x, c.y + 2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // 볼터치
            ctx.fillStyle = "rgba(255, 140, 180, 0.55)";
            ctx.beginPath();
            ctx.ellipse(c.x - 11, c.y - 4, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(c.x + 11, c.y - 4, 3, 2, 0, 0, Math.PI * 2);
            ctx.fill();
            } else {
                ctx.globalAlpha = 1;
                ctx.globalCompositeOperation = "source-over";
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                drawAnimalCharacter(ctx, player.characterId, c.x, c.y, player.color);
            }

            // 이름표
            ctx.globalAlpha = 1;
            ctx.fillStyle = player.id === 1 ? "#064d7c" : "#8c174c";
            ctx.strokeStyle = "rgba(255,255,255,.9)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(c.x - 22, c.y - 52, 44, 19, 7);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "800 11px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`P${player.id}`, c.x, c.y - 42);

            // 신발 아이콘
            if (player.hasShoes) {
                ctx.font = "14px sans-serif";
                ctx.fillText("👟", c.x + 18, c.y + 5);
            }

            // ③④ 탑승 아이콘 표시
            if (player.mountType !== null) {
                ctx.font = "16px sans-serif";
                ctx.fillText(player.mountType === "fast" ? "🏴‍☠️" : "🦭", c.x - 22, c.y - 35);
            }

            // 상태 아이콘
            if (frozen) {
                ctx.font = "bold 22px sans-serif";
                ctx.fillText("❄", c.x + 22, c.y - 35);
            } else if (now < player.glueUntil) {
                ctx.font = "16px sans-serif";
                ctx.fillText("💧", c.x + 22, c.y - 35);
            } else if (now < player.devilUntil) {
                ctx.font = "16px sans-serif";
                ctx.fillText("😈", c.x + 22, c.y - 35);
            }

            ctx.restore();
        });

        ctx.restore();
    }

    function updateHud(now = performance.now()) {
        if (!game) return;

        const [p1, p2] = game.players;

        const p1CharacterLabel = selectedAsMystery[0] && game.startedAt === null
            ? "❔ ?"
            : `${getCharacterDefinition(p1.characterId).icon} ${getCharacterDefinition(p1.characterId).name}`;
        const p2CharacterLabel = selectedAsMystery[1] && game.startedAt === null
            ? "❔ ?"
            : `${getCharacterDefinition(p2.characterId).icon} ${getCharacterDefinition(p2.characterId).name}`;
        document.getElementById("p1-character-label").textContent = p1CharacterLabel;
        document.getElementById("p2-character-label").textContent = p2CharacterLabel;

        document.getElementById("p1-health").textContent = "♥ ".repeat(Math.max(0, p1.health)).trim() || "—";
        document.getElementById("p2-health").textContent = "♥ ".repeat(Math.max(0, p2.health)).trim() || "—";

        const getStateStr = (p) => {
            if (p.health <= 0) return "탈락";
            if (now < p.frozenUntil) return "얼어붙음";
            if (now < p.glueUntil) return "본드에 붙음";
            if (now < p.devilUntil) return "악마의 저주";
            if (now < p.supermanUntil) return "슈퍼맨!";
            if (p.trapShieldCharges > 0) return "늑대 방어 1회 남음";
            // ③ 탑승 상태 표시
            if (p.mountType === "fast") return "해적 바다코끼리 탑승";
            if (p.mountType === "normal") return "일반 바다코끼리 탑승";
            if (p.hasSkates) return "스케이트!";
            if (p.characterId === "penguin" && now < p.icicleReadyAt) return `고드름 ${Math.ceil((p.icicleReadyAt - now) / 1000)}초`;
            return `함정 ${countPlayerTraps(p.id)}/${p.trapCapacity} · 범위 ${p.blastRange}`;
        };

        document.getElementById("p1-state").textContent = getStateStr(p1);
        document.getElementById("p2-state").textContent = getStateStr(p2);

        trapCountEl.textContent = `P1 ${Math.max(0, p1.trapCapacity - countPlayerTraps(1))} · P2 ${Math.max(0, p2.trapCapacity - countPlayerTraps(2))}`;

        const remainingMs = getRemainingTime(now);
        const totalSeconds = Math.ceil(remainingMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        gameTimeEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    document.addEventListener("keydown", event => {
        if (directions[event.code]) {
            event.preventDefault();
            keysDown.add(event.code);
            return;
        }
        if (event.code === "KeyF" || event.code === "Enter" || event.code === "KeyG" || event.code === "ShiftLeft" || event.code === "ShiftRight") {
            event.preventDefault();
            if (!keysDown.has(event.code)) keyQueue.push(event.code);
            keysDown.add(event.code);
        }
    });

    document.addEventListener("keyup", event => keysDown.delete(event.code));
    window.addEventListener("blur", () => keysDown.clear());
    pickerTabs.forEach((tab, index) => {
        tab.addEventListener("click", () => {
            activePickerPlayer = index;
            renderCharacterPicker();
        });
    });
    startButton.addEventListener("click", () => {
        if (game && game.ended) resetGame(); else startGame();
    });
    restartButton.addEventListener("click", () => resetGame());

    renderCharacterPicker();
    resetGame();
})();
