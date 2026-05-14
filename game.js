// roundRect polyfill for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
        this.beginPath();
        this.moveTo(x+r,y); this.lineTo(x+w-r,y);
        this.arcTo(x+w,y,x+w,y+r,r); this.lineTo(x+w,y+h-r);
        this.arcTo(x+w,y+h,x+w-r,y+h,r); this.lineTo(x+r,y+h);
        this.arcTo(x,y+h,x,y+h-r,r); this.lineTo(x,y+r);
        this.arcTo(x,y,x+r,y,r); this.closePath();
    };
}

// ===== 마법 고양이 수학 RPG - game.js =====
// ES6 Class 기반, 3000x3000 월드 + 카메라 + 3스테이지

const CONFIG = {
    CW: 1024, CH: 768,
    WW: 3000, WH: 3000,
    BASE_SPEED: 240, // Pixels per second (60fps * 4px)
    STONE_COUNT: 40,
    STAGES: [
        { id:1, name:'Stage 1', goalGold:2000,  mathRange:10, filter:'none',                                          label:'마법 초원', maxQ: 3, baseGold: 50 },
        { id:2, name:'Stage 2', goalGold:7000,  mathRange:20, filter:'hue-rotate(200deg) brightness(0.65) saturate(2)', label:'신비한 밤', maxQ: 4, baseGold: 150 },
        { id:3, name:'Stage 3', goalGold:15000, mathRange:30, filter:'sepia(0.7) saturate(2.5) hue-rotate(320deg)',    label:'붉은 노을', maxQ: 5, baseGold: 400 },
    ]
};

// ── AudioManager ──────────────────────────────
class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.bgm = new Audio();
        this.bgm.loop = true;
        this.bgm.volume = 0.2;
        this.bgmEnabled = true; // 기본값: 켜기
    }
    
    playBGM(stageIdx) {
        if (!this.bgmEnabled) {
            this.bgm.pause();
            return;
        }
        
        const src = `images/bg_music${stageIdx + 1}.mp3`;
        if (this.bgm.src && this.bgm.src.endsWith(src)) {
            this.bgm.play().catch(e => console.log('BGM play failed:', e));
            return;
        }
        
        this.bgm.src = src;
        this.bgm.play().catch(e => console.log('BGM play failed:', e));
    }
    
    toggleBGM(stageIdx) {
        this.bgmEnabled = !this.bgmEnabled;
        if (this.bgmEnabled) {
            this.playBGM(stageIdx);
        } else {
            this.bgm.pause();
        }
        return this.bgmEnabled;
    }
    _tone(type, freqs, dur, vol = 0.25) {
        freqs.forEach((f, i) => {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const t = this.ctx.currentTime + i * 0.08;
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(t); o.stop(t + dur);
        });
    }
    playCorrect() { this._tone('triangle', [600, 900, 1200], 0.2); }
    playWrong()   {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const t = this.ctx.currentTime;
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, t);
        o.frequency.linearRampToValueAtTime(80, t + 0.35);
        g.gain.setValueAtTime(0.3, t);
        g.gain.linearRampToValueAtTime(0.001, t + 0.35);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + 0.35);
    }
    playFanfare() { this._tone('sine', [400, 600, 800, 1000], 0.35, 0.2); }
    resume()      { this.ctx.state === 'suspended' && this.ctx.resume(); }
}

// ── SaveManager ───────────────────────────────
class SaveManager {
    static KEY = 'mathRPG_v3';
    static save(player, bestCombo, stageIdx) {
        localStorage.setItem(SaveManager.KEY, JSON.stringify({
            gold: player.gold,
            items: [...player.items],
            bestCombo,
            stageIdx,
            furniturePositions: player.furniturePositions,
            playerLevel: player.level
        }));
    }
    static load() {
        try { return JSON.parse(localStorage.getItem(SaveManager.KEY)); } catch { return null; }
    }
    static clear() { localStorage.removeItem(SaveManager.KEY); }
}

// ── ParticleSystem ────────────────────────────
class Particle {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.r  = Math.random() * 5 + 2;
        this.life = 1;
        this.decay = Math.random() * 0.025 + 0.015;
        const c = ['#ffd166','#a78bfa','#06d6a0','#74b9ff','#fd79a8','#ffeaa7'];
        this.color = c[Math.floor(Math.random() * c.length)];
    }
    update(dt) { 
        this.x += this.vx * 60 * dt; 
        this.y += this.vy * 60 * dt; 
        this.vx *= Math.pow(0.96, 60 * dt); 
        this.vy *= Math.pow(0.96, 60 * dt); 
        this.life -= this.decay * 60 * dt; 
    }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
class ParticleSystem {
    constructor() { this.list = []; }
    burst(x, y, n = 22) { for (let i = 0; i < n; i++) this.list.push(new Particle(x, y)); }
    update(dt) { this.list = this.list.filter(p => { p.update(dt); return p.life > 0; }); }
    draw(ctx) { this.list.forEach(p => p.draw(ctx)); }
}

// ── Camera ────────────────────────────────────
class Camera {
    constructor() { this.x = 0; this.y = 0; }
    follow(target) {
        this.x = target.x + target.w / 2 - CONFIG.CW / 2;
        this.y = target.y + target.h / 2 - CONFIG.CH / 2;
        this.x = Math.max(0, Math.min(this.x, CONFIG.WW - CONFIG.CW));
        this.y = Math.max(0, Math.min(this.y, CONFIG.WH - CONFIG.CH));
    }
}

// ── Entity (base) ─────────────────────────────
class Entity {
    constructor(x, y, w, h, imgId) { this.x=x; this.y=y; this.w=w; this.h=h; this.imgId=imgId; }
    bounds() { return { l:this.x, r:this.x+this.w, t:this.y, b:this.y+this.h }; }
    overlaps(o) {
        const a=this.bounds(), b=o.bounds();
        return a.r>b.l && a.l<b.r && a.b>b.t && a.t<b.b;
    }
    draw(ctx, assets) {
        const img = assets.get(this.imgId);
        if (img) ctx.drawImage(img, this.x, this.y, this.w, this.h);
    }
}

// ── Player ────────────────────────────────────
class Player extends Entity {
    constructor() {
        super(CONFIG.WW/2, CONFIG.WH/2, 64, 64, 'player_cat');
        this.speed  = CONFIG.BASE_SPEED;
        this.gold   = 0;
        this.items  = new Set();
        this.hasOwl = false;
        this.owlLevel = 0;
        this.level = 1; 
        this.solvedInStage = 0; // 현재 스테이지에서 맞춘 문제 수
        this.furniturePositions = {}; // itemId -> {x, y}
        this.vx = 0; this.vy = 0;
        // 애니메이션용
        this.facing = 1;   // 1: 오른쪽, -1: 왼쪽
        this.tick   = 0;   // 프레임 카운터
        this.moving = false;
    }
    update(dt) {
        // 속도 계산 로직을 update 상단으로 이동하여 항상 최신화 유지
        this.updateSpeed();

        let dx = this.vx, dy = this.vy;
        this.moving = (dx !== 0 || dy !== 0);
        
        // 8방향 시점 결정을 위한 facing 로직 보강
        if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
        
        if (dx && dy) { const m = Math.SQRT2; dx/=m; dy/=m; }
        
        // Delta Time 적용 이동
        const moveDist = this.speed * dt;
        this.x = Math.max(0, Math.min(this.x + dx * moveDist, CONFIG.WW - this.w));
        this.y = Math.max(0, Math.min(this.y + dy * moveDist, CONFIG.WH - this.h));
        
        this.tick += 60 * dt;

        // 3단계 마법 효과 (이동 시 파티클 생성)
        if (this.level >= 3 && this.moving && Math.random() > 0.6) {
            // 이 시점에서는 game 객체를 직접 참조하기 어려울 수 있으니
            // Entity 업데이트 루프에서 처리하는 것이 좋지만, 
            // 현재 구조상 Player.update(dt)에 파티클을 쏘기 위해선
            // Game 인스턴스에서 ParticleSystem을 업데이트 할때 추가해주거나
            // 여기서 window.game?.particles.burst() 같은 편법을 써야함.
            // 더 안전하게는 Entity가 game을 알게 하는 것.
            // 일단 임시로 글로벌에서 가져올수 없으니 Game.update에서 처리하도록 미룸.
        }
    }
    updateSpeed() {
        let multiplier = 1;
        
        // 레벨업에 따른 이동 속도 보너스 (2단계: +10%, 3단계: +30%, 4단계: +50%)
        if (this.level === 2) multiplier += 0.1;
        else if (this.level === 3) multiplier += 0.3;
        else if (this.level === 4) multiplier += 0.5;

        if (this.items.has('boots_lv3')) multiplier *= 2.0;
        else if (this.items.has('boots_lv2')) multiplier *= 1.6;
        else if (this.items.has('boots_lv1')) multiplier *= 1.3;
        this.speed = Math.round(CONFIG.BASE_SPEED * multiplier);
    }
    addGold(amt) {
        let bonus = 1;
        if (this.owlLevel === 1) bonus += 0.05;
        else if (this.owlLevel === 2) bonus += 0.10;
        else if (this.owlLevel === 3) bonus += 0.20;

        // 레벨업에 따른 골드 획득 보너스 (2단계: +10%, 3단계: +30%, 4단계: +50%)
        if (this.level === 2) bonus += 0.1;
        else if (this.level === 3) bonus += 0.3;
        else if (this.level === 4) bonus += 0.5;

        const earned = Math.round(amt * bonus);
        this.gold += earned;
        return earned;
    }
    draw(ctx, assets) {
        const cx = this.x + this.w / 2;
        const cy = this.y + this.h / 2;

        // 1. 바닥 그림자
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        // 레벨에 따른 그림자 크기 조절
        const shadowSize = 15 + (this.level * 5);
        ctx.ellipse(cx, this.y + this.h - 5, shadowSize, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 레벨에 따른 스프라이트 시트 결정
        let sheetId = 'cat_level11';
        if (this.level === 2) sheetId = 'cat_level12';
        else if (this.level === 3) sheetId = 'cat_level13';
        else if (this.level >= 4) sheetId = 'cat_level14';

        const sheet = assets.get(sheetId) || assets.get('cat_player');
        if (!sheet) {
            const img = assets.get('player_cat');
            if (!img) return;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(this.facing, 1);
            ctx.drawImage(img, -this.w/2, -this.h/2, this.w, this.h);
            ctx.restore();
            return;
        }

        // ─ 스프라이트 시트 정보 ─
        const frameW = sheet.width / 4;
        const frameH = sheet.height / 4;

        let row = 0;
        if (Math.abs(this.vx) > Math.abs(this.vy)) row = this.vx > 0 ? 2 : 3;
        else if (Math.abs(this.vy) > 0) row = this.vy > 0 ? 0 : 1;
        else row = this.facing === 1 ? 2 : 3;

        let frameIdx = this.moving ? Math.floor(this.tick / 10) % 4 : 0;
        const breathe = this.moving ? 1 : 1 + Math.sin(this.tick * 0.05) * 0.02;

        ctx.save();
        ctx.translate(cx, cy);

        // 초월(4단계) 오라 효과
        if (this.level >= 4) {
            ctx.save();
            const time = Date.now() / 200;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                const radius = this.w / 2 + 5 + Math.sin(time + i) * 12;
                ctx.arc(0, 5, radius, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${(time * 50 + i * 40) % 360}, 100%, 75%, 0.15)`;
                ctx.fill();
            }
            // 위로 솟아오르는 빛 효과
            ctx.globalCompositeOperation = 'lighter';
            const gradient = ctx.createLinearGradient(0, 10, 0, -this.h - 30);
            gradient.addColorStop(0, 'rgba(255, 209, 102, 0)');
            gradient.addColorStop(0.5, 'rgba(255, 209, 102, 0.4)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            const gw = this.w + Math.sin(time*1.5)*10;
            ctx.fillRect(-gw/2, -this.h - 30, gw, this.h + 40);
            ctx.restore();
        }

        ctx.scale(breathe, breathe);
        
        // 1레벨 제외 (2,3레벨) 연한 보라색 원 유지
        if (this.level > 1 && this.level < 4) {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#a78bfa';
            ctx.beginPath();
            ctx.arc(0, 0, this.w/2 + 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
        
        ctx.drawImage(
            sheet,
            frameIdx * frameW, row * frameH,
            frameW, frameH,
            -this.w / 2, -this.h / 2,
            this.w, this.h
        );
        ctx.restore();
    }
}

// ── Pet (황금 부엉이) ─────────────────────────
class Pet extends Entity {
    constructor(player) {
        super(player.x - 40, player.y - 30, 44, 44, 'pet_owl');
        this.player = player;
        this.t = 0; // for hover animation
    }
    update(dt) {
        this.t += 0.06 * 60 * dt;
        const tx = this.player.x - 40;
        const ty = this.player.y - 30 + Math.sin(this.t) * 6;
        this.x += (tx - this.x) * (1 - Math.pow(0.9, 60 * dt));
        this.y += (ty - this.y) * (1 - Math.pow(0.9, 60 * dt));
    }
}

// ── MagicStone ────────────────────────────────
class MagicStone extends Entity {
    constructor(x, y) { super(x, y, 72, 72, 'magic_stone'); }
}

// ── Portal (회전하는 magic_stone x2 크기) ─────
class Portal extends Entity {
    constructor(x, y) {
        super(x, y, 160, 160, 'potal');
        this.active = true;
        this.t = 0; // for float animation
    }
    update(dt) { this.t += 0.05 * 60 * dt; }
    draw(ctx, assets) {
        const img = assets.get(this.imgId);
        if (!img) return;
        
        const cx = this.x + this.w/2;
        const cy = this.y + this.h/2;

        ctx.save();
        // 1. 포탈 빛무리 (Glow)
        const pulse = 1 + Math.sin(this.t * 0.5) * 0.1;
        const grd = ctx.createRadialGradient(cx, cy, 20, cx, cy, 100 * pulse);
        grd.addColorStop(0, 'rgba(167,139,250,0.6)');
        grd.addColorStop(0.5, 'rgba(124,92,252,0.3)');
        grd.addColorStop(1, 'rgba(124,92,252,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); 
        ctx.arc(cx, cy, 110 * pulse, 0, Math.PI * 2); 
        ctx.fill();

        // 2. 블랙홀 회전 효과 (여러 겹의 이미지 회전)
        for (let i = 0; i < 3; i++) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(this.t * (0.5 + i * 0.3) * (i % 2 === 0 ? 1 : -1));
            const scale = (1 - i * 0.2) * pulse;
            ctx.scale(scale, scale);
            ctx.globalAlpha = 1 - i * 0.3;
            ctx.drawImage(img, -this.w/2, -this.h/2, this.w, this.h);
            ctx.restore();
        }

        // 3. 상단 가이드 화살표
        const ay = this.y - 40 + Math.sin(this.t * 2) * 10;
        ctx.fillStyle = '#ffd166';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ffd166';
        ctx.beginPath();
        ctx.moveTo(cx - 15, ay);
        ctx.lineTo(cx + 15, ay);
        ctx.lineTo(cx, ay + 20);
        ctx.closePath();
        ctx.fill();
        
        // 'ENTRY' 텍스트
        ctx.shadowBlur = 5;
        ctx.font = 'bold 20px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('ENTRY', cx, ay - 10);
        
        ctx.restore();
    }
}

// ── AssetManager ──────────────────────────────
class AssetManager {
    constructor() { this.cache = {}; }
    async preload(list) {
        const timeout = 90000; // 90초 (대용량 에셋 고려)
        const loadingText = document.querySelector('#loading-screen p');
        let count = 0;

        await Promise.all(list.map(({id, path}) =>
            new Promise((res, rej) => {
                const img = new Image();
                const timer = setTimeout(() => {
                    console.error(`Preload Timeout: ${path}`);
                    rej(`Timeout: ${path}`);
                }, timeout);
                
                img.onload  = () => { 
                    clearTimeout(timer); 
                    this.cache[id] = img; 
                    count++;
                    if (loadingText) loadingText.innerText = `마법 세계 불러오는 중... (${count}/${list.length})`;
                    res(); 
                };
                img.onerror = () => { clearTimeout(timer); rej(`Failed: ${path}`); };
                img.src = path;
            })
        ));
    }
    /** 흰 배경을 투명으로 제거하여 offscreen canvas로 교체 */
    removeWhiteBg(id, threshold = 230) {
        const img = this.cache[id];
        if (!img) return;
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        const oc = document.createElement('canvas');
        oc.width = w; oc.height = h;
        const c = oc.getContext('2d');
        c.drawImage(img, 0, 0);
        const d = c.getImageData(0, 0, w, h);
        const px = d.data;
        for (let i = 0; i < px.length; i += 4) {
            const r = px[i], g = px[i+1], b = px[i+2];
            if (r > threshold && g > threshold && b > threshold) {
                // 밝기에 비례해 알파 감소 (부드러운 엣지)
                px[i+3] = Math.round((1 - (r+g+b)/(255*3)) * 255 * 2);
            }
        }
        c.putImageData(d, 0, 0);
        this.cache[id] = oc; // canvas도 drawImage 호환
    }
    get(id) { return this.cache[id]; }
    getSrc(id) {
        const asset = this.cache[id];
        if (!asset) return '';
        if (asset instanceof HTMLCanvasElement) return asset.toDataURL();
        return asset.src || '';
    }
}


// ── QuizManager ───────────────────────────────
class QuizManager {
    constructor(game) {
        this.game    = game;
        this.modal   = document.getElementById('quiz-modal');
        this.qEl     = document.getElementById('quiz-question');
        this.inp     = document.getElementById('quiz-input');
        this.fbEl    = document.getElementById('quiz-feedback');
        this.comboEl = document.getElementById('combo-count');
        this.submitBtn = document.getElementById('quiz-submit-btn');
        this.answer  = 0;
        this.combo   = 0;
        this.totalCorrect = 0;
        this.active  = false;
        this.inp.addEventListener('keydown', e => { 
            if (e.key === 'Enter') this.check(); 
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
            }
        });
        this.inp.addEventListener('input', () => {
            // 음수 입력 방지
            if (this.inp.value.includes('-')) {
                this.inp.value = this.inp.value.replace('-', '');
            }
        });
        this.submitBtn.addEventListener('click', () => this.check());
    }
    start(stone) {
        if (this.active) return;
        this.active = true;
        this.targetStone = stone;  // 풀고 나면 이 광맥을 제거
        this.qCount  = 0;          // 이번 광맥에서 푼 문제 수
        this.maxQ    = this.game.stageManager.currentStage().maxQ || 3;
        this.game.paused = true;
        this.modal.classList.remove('hidden');
        this.nextQ();
        setTimeout(() => this.inp.focus(), 50);
    }
    nextQ() {
        const stageIdx = this.game.stageManager.idx;
        let a, b;

        if (stageIdx === 0) {
            // Stage 1: 한자리 + 한자리 (1~9)
            a = Math.floor(Math.random() * 9) + 1;
            b = Math.floor(Math.random() * 9) + 1;
        } else if (stageIdx === 1) {
            // Stage 2: 두자리 + 한자리 (10~99, 1~9)
            a = Math.floor(Math.random() * 90) + 10;
            b = Math.floor(Math.random() * 9) + 1;
        } else {
            // Stage 3: 두자리 + 두자리 (10~99, 10~99)
            a = Math.floor(Math.random() * 90) + 10;
            b = Math.floor(Math.random() * 90) + 10;
        }
        
        // 가끔 뺄셈 문제도 섞어줌 (단, 결과가 양수여야 함)
        if (Math.random() > 0.6 && a !== b) {
            const max = Math.max(a, b);
            const min = Math.min(a, b);
            this.answer = max - min;
            this.qEl.textContent = `${max} - ${min} = ?`;
        } else {
            this.answer = a + b;
            this.qEl.textContent = `${a} + ${b} = ?`;
        }
        // 제목에 스테이지 명칭과 남은 문제 수 표시
        const stageName = this.game.stageManager.currentStage().label;
        document.querySelector('#quiz-modal .modal-title').textContent =
            `[${stageName}] 마법 해제 (${this.qCount+1}/${this.maxQ})`;
        this.inp.value = '';
        this.fbEl.textContent = '';
        this.comboEl.textContent = this.combo;
    }
    check() {
        const val = parseInt(this.inp.value);
        if (isNaN(val)) return;
        if (val === this.answer) {
            this.combo++;
            this.qCount++;
            this.totalCorrect++;
            this.game.player.solvedInStage++; // 스테이지 내 정답 카운트
            
            if (this.combo > this.game.bestCombo) this.game.bestCombo = this.combo;

            const stage = this.game.stageManager.currentStage();
            const base = stage.baseGold || 50;
            const earned = this.game.player.addGold(Math.round(base * (1 + (this.combo - 1) * 0.1)));

            this.fbEl.style.color = '#06d6a0';
            this.fbEl.textContent = `정답! +${earned}G 🎉`;
            this.game.audio.playCorrect();
            this.game.particles.burst(this.game.player.x + 32, this.game.player.y + 32);
            
            // 50문제를 맞추면 포탈 생성
            if (this.game.player.solvedInStage >= 50 && !this.game.portal) {
                this.game.notify('🌌 마법 에너지가 충분합니다! 포탈이 열렸습니다!');
                this.game.spawnPortal();
            }

            this.game.updateHUD();
            SaveManager.save(this.game.player, this.game.bestCombo, this.game.stageManager.idx);
            
            if (this.qCount >= this.maxQ) {
                this.fbEl.textContent = `완벽! 광맥이 사라집니다 ✨`;
                setTimeout(() => this.closeAndRemoveStone(), 700);
            } else {
                setTimeout(() => this.nextQ(), 500);
            }
        } else {
            this.combo = 0;
            const stageIdx = this.game.stageManager.idx;
            const penalty = 50 + (stageIdx * 50); // 스테이지가 높을수록 페널티 증가
            this.game.player.gold = Math.max(0, this.game.player.gold - penalty);
            this.fbEl.style.color = '#ef476f';
            this.fbEl.textContent = `오답... -${penalty}G 😢 (광맥 이탈)`;
            this.game.audio.playWrong();
            SaveManager.save(this.game.player, this.game.bestCombo, this.game.stageManager.idx);
            this.game.updateHUD();
            setTimeout(() => this.close(), 1000);
        }
    }
    closeAndRemoveStone() {
        // 클리어한 광맥 제거
        this.game.stones = this.game.stones.filter(s => s !== this.targetStone);
        this.close();
    }
    close() {
        this.active = false;
        this.game.paused = false;
        this.modal.classList.add('hidden');
        document.querySelector('#quiz-modal .modal-title').textContent = '마법 봉인 해제!';
        this.game.player.x -= 30; // 튕겨내기 (무한 충돌 방지)
    }
}

// ── ShopManager ───────────────────────────────
class ShopManager {
    constructor(game) {
        this.game   = game;
        this.modal  = document.getElementById('shop-modal');
        this.grid   = document.getElementById('shop-items');
        this.goldEl = document.getElementById('shop-gold');
        document.getElementById('close-shop').onclick = () => this.toggle();
        document.getElementById('open-shop-btn').onclick = () => this.toggle();

        // 아이템 데이터 배열 (마법 테마로 대개편)
        this.items = [
            {
                id:'boots_lv1', name:'바람의 부츠 (Lv.1)', price:1000, imgId:'item_boots',
                desc:'이동 속도가 30% 증가합니다.',
                effect: p => {}
            },
            {
                id:'boots_lv2', name:'질주의 부츠 (Lv.2)', price:3000, imgId:'item_boots',
                desc:'이동 속도가 60% 증가합니다.', requires:'boots_lv1',
                effect: p => {}
            },
            {
                id:'boots_lv3', name:'신속의 부츠 (Lv.3)', price:6000, imgId:'item_boots',
                desc:'이동 속도가 100% 증가합니다!', requires:'boots_lv2',
                effect: p => {}
            },
            {
                id:'owl_lv1', name:'초보 부엉이 (Lv.1)', price:3000, imgId:'pet_owl',
                desc:'골드 획득 +5% 보너스!',
                effect: p => { p.hasOwl = true; p.owlLevel = 1; this.game.pet = new Pet(p); }
            },
            {
                id:'owl_lv2', name:'숙련 부엉이 (Lv.2)', price:4000, imgId:'pet_owl',
                desc:'골드 획득 +10% 보너스!', requires:'owl_lv1',
                effect: p => { p.owlLevel = 2; }
            },
            {
                id:'owl_lv3', name:'대마법 부엉이 (Lv.3)', price:10000, imgId:'pet_owl',
                desc:'골드 획득 +20% 보너스!', requires:'owl_lv2',
                effect: p => { p.owlLevel = 3; }
            },
            {
                id:'evolve_lv2', name:'견습 진화', price:10000, imgId:'room_bookshelf',
                desc:'골드 및 이속 10% 증가!',
                effect: p => { p.level = 2; this.game.notify('✨ 견습 고양이로 진화했습니다!'); this.game.audio.playFanfare(); }
            },
            {
                id:'evolve_lv3', name:'대마법 진화', price:30000, imgId:'room_bookshelf',
                desc:'골드 및 이속 30% 증가!', requires:'evolve_lv2',
                effect: p => { p.level = 3; this.game.notify('✨ 대마법 고양이로 진화했습니다!'); this.game.audio.playFanfare(); }
            },
            {
                id:'evolve_lv4', name:'초월 진화', price:50000, imgId:'room_magic_crystal',
                desc:'골드 및 이속 50% 증가, 초월 효과!', requires:'evolve_lv3',
                effect: p => { p.level = 4; this.game.notify('✨ 전설의 초월 고양이로 진화했습니다!'); this.game.audio.playFanfare(); }
            }
        ];
    }
    toggle() {
        const wasHidden = this.modal.classList.contains('hidden');
        this.modal.classList.toggle('hidden');
        this.game.paused = wasHidden ? true : false;
        if (wasHidden) { 
            this.goldEl.textContent = this.game.player.gold; 
            this.render(); 
        }
    }
    render() {
        const grid = this.grid;
        grid.innerHTML = '';

        this.items.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'shop-item';
            
            const img = this.game.assets.get(item.imgId);
            const isOwned = this.game.player.items.has(item.id);
            
            const imgContainerId = `shop-img-${item.id}`;
            itemDiv.innerHTML = `
                <div class="item-img" id="${imgContainerId}"></div>
                <div class="item-info">
                    <div class="item-name">${item.name}</div>
                    <div class="item-desc">${item.desc}</div>
                </div>
                <button class="buy-btn ${isOwned ? 'owned' : ''}" ${isOwned ? 'disabled' : ''}>
                    ${isOwned ? '보유중' : `${item.price} G`}
                </button>
            `;
            
            grid.appendChild(itemDiv);
            
            const container = document.getElementById(imgContainerId);
            if (container && img) {
                const displayImg = img.cloneNode ? img.cloneNode(true) : img;
                if (img instanceof HTMLCanvasElement) {
                    displayImg.style.width = '100%';
                    displayImg.style.height = '100%';
                    displayImg.style.objectFit = 'contain';
                }
                container.appendChild(displayImg);
            }
            if (!isOwned) itemDiv.onclick = () => this.buy(item);
        });
    }
    buy(item) {
        if (item.requires && !this.game.player.items.has(item.requires)) {
            this.game.notify('⚠️ 이전 단계 아이템을 먼저 구매해야 합니다!');
            return;
        }
        if (this.game.player.gold < item.price) { this.game.notify('⚠️ 골드가 부족합니다!'); return; }
        
        if (!confirm(`[${item.name}]을(를) 구매하시겠습니까?\n가격: ${item.price}G`)) return;

        this.game.player.gold -= item.price;
        this.game.player.items.add(item.id);
        
        if (item.effect) item.effect(this.game.player);
        
        this.game.updateHUD();
        this.goldEl.textContent = this.game.player.gold;
        SaveManager.save(this.game.player, this.game.bestCombo, this.game.stageManager.idx);
        this.render();
        
        this.game.notify(`🎉 [${item.name}] 구매 완료!`);
    }
    applyEffect(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (item && item.effect) item.effect(this.game.player);
    }
}



// ── StageManager ──────────────────────────────
class StageManager {
    constructor(game) {
        this.game = game;
        this.idx = 0;
        this.prevBtn = document.getElementById('prev-stage-btn');
        if (this.prevBtn) this.prevBtn.onclick = () => this.prevStage();
    }
    currentStage() { return CONFIG.STAGES[this.idx]; }
    checkGoal() {
        // 3단계는 마지막이라 포탈이 생기지 않음
        if (this.idx === 2) return;

        const stage = this.currentStage();
        if (this.game.player.gold >= stage.goalGold && !this.game.portal) {
            this.game.spawnPortal();
            this.game.notify(`✨ 목표 달성! 포탈이 나타났습니다!`);
            this.game.audio.playFanfare();
        }
    }
    advance() {
        if (this.idx < CONFIG.STAGES.length - 1) {
            this.idx++;
            this.resetStage();
            
            const s = this.currentStage();
            this.game.notify(`🌟 ${s.name} - ${s.label} 시작!`);
            this.game.audio.playFanfare();
            this.game.updateHUD();
        } else {
            this.game.notify('🎉 모든 스테이지 클리어! 전설의 대마법사 달성!');
        }
    }
    prevStage() {
        if (this.idx > 0) {
            const prevLabel = CONFIG.STAGES[this.idx - 1].label;
            if (!confirm(`[${prevLabel}](으)로 돌아가시겠습니까?\n현재 스테이지의 진행 상황이 저장되지 않을 수 있습니다.`)) return;

            this.idx--;
            this.resetStage();
            const s = this.currentStage();
            this.game.notify(`🔙 ${s.name} - ${s.label}(으)로 돌아왔습니다.`);
        }
    }
    resetStage() {
        this.game.portal = null;
        this.game.stones = this.game.makeStones();
        this.game.player.solvedInStage = 0; // 스테이지 점수 초기화
        this.game.updateHUD();
        this.game.updateBackgroundPattern(); 
        SaveManager.save(this.game.player, this.game.bestCombo, this.idx);
        this.game.audio.playBGM(this.idx);
    }
    updateUI() {
        if (!this.prevBtn) return;
        if (this.idx > 0) {
            this.prevBtn.classList.remove('hidden');
            const prevLabel = CONFIG.STAGES[this.idx - 1].label;
            const textSpan = this.prevBtn.querySelector('.btn-text');
            if (textSpan) textSpan.textContent = prevLabel;
        } else {
            this.prevBtn.classList.add('hidden');
        }
    }
}

// ── VirtualJoystick ────────────────────────────
class VirtualJoystick {
    constructor() {
        this.zone = document.getElementById('joystick-zone');
        this.base = document.getElementById('joystick-base');
        this.stick = document.getElementById('joystick-stick');
        this.active = false;
        this.value = { x: 0, y: 0 };
        this.startPos = { x: 0, y: 0 };
        this.maxRadius = 50;

        this.init();
    }
    init() {
        const handleStart = (e) => {
            this.active = true;
            const touch = e.touches ? e.touches[0] : e;
            const rect = this.base.getBoundingClientRect();
            this.startPos = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            this.handleMove(e);
        };
        const handleEnd = () => {
            this.active = false;
            this.value = { x: 0, y: 0 };
            this.stick.style.transform = `translate(0px, 0px)`;
        };
        const handleMove = (e) => {
            if (!this.active) return;
            e.preventDefault();
            const touch = e.touches ? e.touches[0] : e;
            const dx = touch.clientX - this.startPos.x;
            const dy = touch.clientY - this.startPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const limitedDist = Math.min(distance, this.maxRadius);

            this.value.x = (Math.cos(angle) * limitedDist) / this.maxRadius;
            this.value.y = (Math.sin(angle) * limitedDist) / this.maxRadius;

            const moveX = Math.cos(angle) * limitedDist;
            const moveY = Math.sin(angle) * limitedDist;
            this.stick.style.transform = `translate(${moveX}px, ${moveY}px)`;
        };

        this.zone.addEventListener('touchstart', handleStart, { passive: false });
        this.zone.addEventListener('touchmove', handleMove, { passive: false });
        this.zone.addEventListener('touchend', handleEnd);
        this.zone.addEventListener('mousedown', handleStart);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
    }
    handleMove(e) {
        const touch = e.touches ? e.touches[0] : e;
        const dx = touch.clientX - this.startPos.x;
        const dy = touch.clientY - this.startPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const limitedDist = Math.min(distance, this.maxRadius);

        this.value.x = (Math.cos(angle) * limitedDist) / this.maxRadius;
        this.value.y = (Math.sin(angle) * limitedDist) / this.maxRadius;

        const moveX = Math.cos(angle) * limitedDist;
        const moveY = Math.sin(angle) * limitedDist;
        this.stick.style.transform = `translate(${moveX}px, ${moveY}px)`;
    }
}

// ── Game (메인 클래스) ────────────────────────
class Game {
    constructor() {
        this.canvas  = document.getElementById('gameCanvas');
        this.ctx     = this.canvas.getContext('2d');
        this.assets  = new AssetManager();
        this.audio   = new AudioManager();
        this.camera  = new Camera();
        this.particles = new ParticleSystem();

        this.player  = new Player();
        this.pet     = null;
        this.portal  = null;
        this.stones  = [];
        this.bestCombo = 0;
        this.paused  = false;
        this.keys    = {};
        this._bgPat  = null; // 배경 패턴 캐시
        this._secretCode = 'catmaster';
        this._secretBuffer = '';

        this.stageManager = new StageManager(this);
        this.shopManager  = new ShopManager(this);
        this.quizManager  = new QuizManager(this);
        this.joystick     = null;

        // 스테이지별 필터 적용된 배경 패턴 저장소
        this._stagePatterns = [];

        this.init();
        this.handleResize();
        window.addEventListener('resize', () => this.handleResize());
        
        // Delta Time 초기화
        this.lastTime = 0;
        
        document.getElementById('exit-btn').onclick = () => {
            if (confirm('메인 화면으로 돌아가시겠습니까? 현재 진행 상황은 저장됩니다.')) {
                this.goToStartScreen();
            }
        };
    }
    
    goToStartScreen() {
        this.paused = true;
        document.getElementById('start-screen').classList.remove('hidden');
    }

    activateAdminMode() {
        this.player.gold = 99999999;
        this.player.solvedInStage = 50;
        this.spawnPortal();
        this.notify('✨ 관리자 권한 획득: 무한 골드 및 차원의 문이 개방되었습니다!');
        this.updateHUD();
        this.audio.playFanfare();
        SaveManager.save(this.player, this.bestCombo, this.stageManager.idx);
    }

    handleResize() {
        // 태블릿 가로모드 및 다양한 해상도 대응 (1366px까지 확대)
        const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isMobileOrTablet = window.innerWidth <= 1366 || isTouchDevice;
        
        const mobileControls = document.getElementById('mobile-controls');
        if (isMobileOrTablet) {
            mobileControls.classList.remove('hidden');
            if (!this.joystick) this.joystick = new VirtualJoystick();
        } else {
            mobileControls.classList.add('hidden');
        }
    }

    async init() {
        try {
            console.log("🎮 마법 세계 로딩 시작...");
            await this.assets.preload([
                { id:'player_cat',  path:'images/player_cat.png'  },
                { id:'cat_player',  path:'images/cat_player.png'  },
                { id:'magic_stone', path:'images/magic_stone.png' },
                { id:'bg_floor',    path:'images/bg_floor.png'    },
                { id:'item_boots',  path:'images/item_boots.png'  },
                { id:'pet_owl',     path:'images/pet_owl.png'     },
                // 고양이 레벨별 에셋 (사용자가 업로드한 파일명에 맞춤)
                { id:'cat_level11', path:'images/cat_level11.png' },
                { id:'cat_level12', path:'images/cat_level12.png' },
                { id:'cat_level13', path:'images/cat_level13.png' },
                { id:'cat_level14', path:'images/cat_level14.png' },
                // 방 관련 에셋
                { id:'room_bg',     path:'images/room_bg.png'     },
                { id:'room_bed',    path:'images/room_bed.png'    },
                { id:'room_desk',   path:'images/room_desk.png'   },
                { id:'room_rug',    path:'images/room_rug.png'    },
                { id:'room_chair',  path:'images/room_chair.png'  },
                { id:'room_bookshelf', path:'images/room_bookshelf.png' },
                { id:'room_lamp',   path:'images/room_lamp.png'   },
                { id:'room_plant',  path:'images/room_plant.png'  },
                { id:'room_window', path:'images/room_window.png' },
                { id:'room_broom',  path:'images/room_broom.png'  },
                { id:'room_potion', path:'images/room_potion.png' },
                { id:'room_magic_crystal', path:'images/room_magic_crystal.png' },
                { id:'potal',       path:'images/potal.png'       },
            ]);

            // 배경 투명화 처리 (태블릿 부하를 줄이기 위해 순차적 처리)
            const transparentList = [
                {id: 'player_cat', t: 230},
                {id: 'cat_level11', t: 230}, {id: 'cat_level12', t: 230}, {id: 'cat_level13', t: 230}, {id: 'cat_level14', t: 230}, {id: 'cat_player', t: 230},
                {id: 'room_bed', t: 245}, {id: 'room_desk', t: 245}, {id: 'room_rug', t: 245}, {id: 'room_chair', t: 245},
                {id: 'room_bookshelf', t: 245}, {id: 'room_lamp', t: 245}, {id: 'room_plant', t: 245}, {id: 'room_window', t: 245},
                {id: 'room_broom', t: 245}, {id: 'room_potion', t: 245}, {id: 'room_magic_crystal', t: 245},
                {id: 'item_boots', t: 245}, {id: 'pet_owl', t: 245}
            ];

            for (const item of transparentList) {
                try {
                    this.assets.removeWhiteBg(item.id, item.t);
                    // 대용량 이미지 처리 시 브라우저 멈춤 방지를 위한 미세한 지연
                    await new Promise(r => setTimeout(r, 20));
                } catch (e) { console.warn(`Transparency fail: ${item.id}`, e); }
            }

            // 배경 패턴 및 필터 최적화
            this.updateBackgroundPattern();

            console.log("✅ 게임 준비 완료!");
        } catch (err) {
            console.error("❌ 초기화 중 치명적 오류 발생:", err);
            // 태블릿에서 로딩이 안 될 경우 사용자에게 알림 및 재시도 제안
            const loadingEl = document.getElementById('loading-screen');
            if (loadingEl) {
                loadingEl.innerHTML = `
                    <div class="modal-card" style="width:300px;">
                        <p style="color:#ef476f; margin-bottom:20px;">로딩 지연 또는 오류</p>
                        <button onclick="location.reload()" class="primary-btn">다시 시도</button>
                    </div>
                `;
            }
        } finally {
            const loadingEl = document.getElementById('loading-screen');
            if (loadingEl && !loadingEl.querySelector('.primary-btn')) {
                loadingEl.classList.add('hidden');
            }
        }

        this.stones = this.makeStones();
        this.loadSave();
        this.showStartScreen();
    }

    showStartScreen() {
        const ss  = document.getElementById('start-screen');
        const btn = document.getElementById('start-btn');
        const rst = document.getElementById('reset-btn');
        const bgmToggleBtn = document.getElementById('bgm-toggle-btn');

        if (bgmToggleBtn) {
            bgmToggleBtn.onclick = () => {
                const isEnabled = this.audio.toggleBGM(this.stageManager.idx);
                const textSpan = bgmToggleBtn.querySelector('.btn-text');
                if (isEnabled) {
                    textSpan.textContent = 'BGM 끄기';
                    bgmToggleBtn.style.opacity = '1';
                } else {
                    textSpan.textContent = 'BGM 켜기';
                    bgmToggleBtn.style.opacity = '0.5';
                }
            };
        }

        ss.classList.remove('hidden');
        this.paused = true;

        btn.onclick = () => {
            this.audio.resume();
            if (this.audio.bgmEnabled) this.audio.playBGM(this.stageManager.idx);

            // 전체화면 요청
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => console.log(err));
            } else if (elem.webkitRequestFullscreen) { /* Safari */
                elem.webkitRequestFullscreen();
            }

            ss.classList.add('hidden');
            this.paused = false;
            this.bindKeys();
            this.bindTouch(); // 터치 이벤트 바인딩 추가
            this.loop();
        };

        rst.onclick = () => {
            if (!confirm('저장 데이터를 초기화하시겠습니까?')) return;
            SaveManager.clear();
            location.reload(); // 리로드해서 초기화 상태로 시작
        };
    }

    loadSave() {
        const d = SaveManager.load();
        if (!d) return;
        this.player.gold = d.gold ?? 0;
        this.bestCombo   = d.bestCombo ?? 0;
        this.player.level = d.playerLevel ?? 1;
        this.stageManager.idx = Math.min(d.stageIdx ?? 0, CONFIG.STAGES.length - 1);
        (d.items ?? []).forEach(id => {
            this.player.items.add(id);
            this.shopManager.applyEffect(id);
        });
        this.updateHUD();
    }

    makeStones() {
        const list = [];
        for (let i = 0; i < CONFIG.STONE_COUNT; i++) {
            const x = 200 + Math.random() * (CONFIG.WW - 400);
            const y = 200 + Math.random() * (CONFIG.WH - 400);
            // 플레이어 스폰 근처 제외
            const dx = x - CONFIG.WW/2, dy = y - CONFIG.WH/2;
            if (Math.sqrt(dx*dx+dy*dy) < 200) { i--; continue; }
            list.push(new MagicStone(x, y));
        }
        return list;
    }

    spawnPortal() {
        const px = 600 + Math.random() * (CONFIG.WW - 1200);
        const py = 600 + Math.random() * (CONFIG.WH - 1200);
        this.portal = new Portal(px, py);
    }

    updateBackgroundPattern() {
        const bgImg = this.assets.get('bg_floor');
        if (!bgImg) return;

        const stage = this.stageManager.currentStage();
        // 매 프레임 ctx.filter를 쓰는 대신, 오프스크린 캔버스에서 한 번만 필터를 입힌 패턴을 생성합니다.
        const oc = document.createElement('canvas');
        const tw = bgImg.naturalWidth || 512;
        const th = bgImg.naturalHeight || 512;
        oc.width = tw; oc.height = th;
        const octx = oc.getContext('2d');
        
        octx.filter = stage.filter;
        octx.drawImage(bgImg, 0, 0, tw, th);
        
        this._bgPat = this.ctx.createPattern(oc, 'repeat');
    }

    bindKeys() {
        window.addEventListener('keydown', e => {
            this.keys[e.code] = true;

            // 비밀 코드 체크 (catmaster)
            if (e.key && e.key.length === 1) {
                this._secretBuffer += e.key.toLowerCase();
                if (this._secretBuffer.endsWith(this._secretCode)) {
                    this.activateAdminMode();
                    this._secretBuffer = '';
                }
                if (this._secretBuffer.length > 20) this._secretBuffer = this._secretBuffer.slice(-20);
            }

            if (e.code === 'KeyS' && !this.quizManager.active) {
                this.shopManager.toggle();
            }
        });
        window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    }

    bindTouch() {
        // 모바일에서 캔버스 터치 시 상호작용 (필요할 경우)
        this.canvas.addEventListener('touchstart', (e) => {
            if (this.paused) return;
            // 특정 액션이 필요하면 여기에 추가
        }, { passive: true });
    }

    updateHUD() {
        const s = this.stageManager.currentStage();
        const goldEl = document.getElementById('gold-display');
        const stageEl = document.getElementById('stage-display');
        const progEl = document.getElementById('progress-display');
        const comboEl = document.getElementById('best-combo-display');
        
        if (goldEl) goldEl.textContent = this.player.gold;
        if (stageEl) stageEl.textContent = s.name;
        
        // 정답 수 기반 포탈 안내
        if (progEl) progEl.textContent = `포탈 개방: 50문제 (현재: ${this.player.solvedInStage})`;
        
        // 콤보 패널을 '차원문 개방'으로 활용
        const comboPanel = document.getElementById('combo-panel');
        if (comboPanel) {
            const label = comboPanel.querySelector('.label');
            if (label) label.textContent = '차원문 개방';
        }
        if (comboEl) comboEl.textContent = `${this.player.solvedInStage} / 50`;
        
        this.stageManager.updateUI();
    }

    notify(msg) {
        const el = document.getElementById('notification');
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(this._notifyTimer);
        this._notifyTimer = setTimeout(() => el.classList.add('hidden'), 3000);
    }

    // ── update ──
    update(dt) {
        if (this.paused) return;

        this.player.vx = 0; this.player.vy = 0;
        
        // 키보드 입력
        if (this.keys['ArrowLeft']  || this.keys['KeyA']) this.player.vx = -1;
        if (this.keys['ArrowRight'] || this.keys['KeyD']) this.player.vx =  1;
        if (this.keys['ArrowUp']    || this.keys['KeyW']) this.player.vy = -1;
        if (this.keys['ArrowDown']  || this.keys['KeyS']) this.player.vy =  1;

        // 조이스틱 입력 (키보드보다 우선순위 혹은 합산)
        if (this.joystick && this.joystick.active) {
            this.player.vx = this.joystick.value.x;
            this.player.vy = this.joystick.value.y;
        }

        this.player.update(dt);
        
        // 3단계 마법 효과: 이동할 때 파티클 생성
        if (this.player.level >= 3 && this.player.moving && Math.random() > 0.6) {
            this.particles.burst(this.player.x + this.player.w/2, this.player.y + this.player.h - 10, 1);
        }

        this.camera.follow(this.player);
        if (this.pet) this.pet.update(dt);
        if (this.portal) this.portal.update(dt);
        this.particles.update(dt);
        this.checkCollisions();
    }

    checkCollisions() {
        // 돌과 충돌
        for (const stone of this.stones) {
            if (this.player.overlaps(stone)) {
                this.quizManager.start(stone); // 어떤 돌인지 전달
                break;
            }
        }
        // 포탈과 충돌
        if (this.portal && this.portal.active && this.player.overlaps(this.portal)) {
            this.portal.active = false;
            this.stageManager.advance();
        }
    }

    // ── render ──
    render() {
        const ctx = this.ctx;
        const cam = this.camera;
        const stage = this.stageManager.currentStage();

        // 배경 (사전에 필터링된 패턴 사용으로 성능 극대화)
        if (this._bgPat) {
            const bg = this.assets.get('bg_floor');
            const tw = bg.naturalWidth  || 512;
            const th = bg.naturalHeight || 512;
            const ox = -(cam.x % tw);
            const oy = -(cam.y % th);
            ctx.save();
            ctx.translate(ox, oy);
            ctx.fillStyle = this._bgPat;
            ctx.fillRect(-tw, -th, CONFIG.CW + tw*2, CONFIG.CH + th*2);
            ctx.restore();
        }

        // 월드 엔티티는 카메라 오프셋 적용
        ctx.save();
        ctx.translate(-cam.x, -cam.y);

        this.stones.forEach(s => s.draw(ctx, this.assets));
        if (this.portal) this.portal.draw(ctx, this.assets);
        if (this.pet)    this.pet.draw(ctx, this.assets);
        this.player.draw(ctx, this.assets);
        this.particles.draw(ctx);

        ctx.restore();

        // 미니맵 (우하단)
        this.drawMinimap(ctx);
    }

    drawMinimap(ctx) {
        const mw = 100, mh = 100, mx = CONFIG.CW - mw - 10, my = CONFIG.CH - mh - 10;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#1a1235';
        ctx.strokeStyle = '#7c5cfc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, mh, 6);
        ctx.fill(); ctx.stroke();
        // 플레이어 점
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd166';
        const px = mx + (this.player.x / CONFIG.WW) * mw;
        const py = my + (this.player.y / CONFIG.WH) * mh;
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill();
        // 포탈 점
        if (this.portal) {
            ctx.fillStyle = '#a78bfa';
            const ppx = mx + (this.portal.x / CONFIG.WW) * mw;
            const ppy = my + (this.portal.y / CONFIG.WH) * mh;
            ctx.beginPath(); ctx.arc(ppx, ppy, 4, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }

    loop(timestamp = 0) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1); // 최대 0.1초 캡 (끊김 방지)
        this.lastTime = timestamp;

        this.update(dt);
        this.render();
        requestAnimationFrame((t) => this.loop(t));
    }
}

window.onload = () => { new Game(); };
