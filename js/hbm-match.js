// Le match vivant (Pages/Match.razor) : tout le terrain vu de dessus, caméra fixe.
// Le moteur du jeu (MatchEnDirect) décide de tout ; ce fichier rejoue chaque action reçue :
// placement de l'attaque, quelques passes, puis le tir du vrai tireur avec le vrai résultat
// (but, arrêt du gardien, tir raté, perte de balle). Ton équipe attaque toujours vers le haut.
window.hbmMatch = (() => {
    const L = 20, LONG = 40, MARGE = .5;
    const POSTES = ['GB', 'AG', 'AD', 'ARG', 'ARD', 'DC', 'PIV'];   // l'ordre des cases (Equipe.PostesDesCases)
    // Positions d'attaque, en mètres depuis la ligne de but attaquée
    const ATT = { GB: [10, 38.8], AG: [1.6, 4.2], ARG: [5.2, 10.2], DC: [10, 11.2], ARD: [14.8, 10.2], AD: [18.4, 4.2], PIV: [10, 6.6] };
    // Défenses (vues depuis le but défendu)
    const DEFS = {
        '6-0': { AG: [17.2, 6.4], ARG: [13.6, 7.4], DC: [10, 7.6], ARD: [6.4, 7.4], AD: [2.8, 6.4], PIV: [10.4, 6.5] },
        '5-1': { AG: [17.2, 6.4], ARG: [13.6, 7.2], DC: [10, 10.6], ARD: [6.4, 7.2], AD: [2.8, 6.4], PIV: [10, 6.6] },
        '3-2-1': { AG: [16.4, 6.8], ARG: [13.6, 10.4], DC: [10, 11.4], ARD: [6.4, 10.4], AD: [3.6, 6.8], PIV: [10, 7.4] }
    };
    const COULEURS = { moi: ['#E4002B', '#FFB020'], eux: ['#2E7BF0', '#2FCF7A'] };

    let toile = null, ctx = null, raf = 0, echelle = 1, larg = 0, haut = 0, ox = 0, choisi = null, infoMinuteur = 0;
    let fond = null;   // le terrain dessiné une fois (caméra fixe : il ne bouge jamais)
    let equipes = { moi: [], eux: [] }, defenses = { moi: '6-0', eux: '6-0' };
    const ballon = { x: 10, y: 20, z: 0, trace: [], porteur: null, vol: null };
    let possession = 'moi', filet = null, timeline = [], tempsScene = 0;

    const versTerrain = (c, mx, my) => c === 'moi' ? [mx, my] : [L - mx, LONG - my];
    const adv = c => (c === 'moi' ? 'eux' : 'moi');
    const rnd = (a, b) => a + Math.random() * (b - a);
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    function creerJoueurs(c, liste) {
        const anciens = equipes[c];
        return liste.map((j, i) => {
            const vieux = anciens.find(x => x.cle === j.cle) || anciens[i];
            return {
                cote: c, poste: POSTES[i] || 'DC', num: j.num, nom: j.nom, cle: j.cle, forme: j.forme ?? 100,
                x: vieux ? vieux.x : 10, y: vieux ? vieux.y : 20, cx: vieux ? vieux.cx : 10, cy: vieux ? vieux.cy : 20, plonge: 0
            };
        });
    }

    // ----- Placements -----
    function placerAttaque(c) {
        const t = performance.now() / 1000, bx = c === 'moi' ? ballon.x : L - ballon.x;
        for (const j of equipes[c]) {
            if (j.fige) continue;   // (le tireur d'un 7 m attend sur sa ligne)
            let [mx, my] = ATT[j.poste];
            if (j.poste === 'GB') { [j.cx, j.cy] = versTerrain(c, mx, my); continue; }
            if (j.poste === 'ARG' || j.poste === 'DC' || j.poste === 'ARD') mx += (bx - 10) * 0.18;
            if (j.poste === 'PIV') mx += (bx - 10) * 0.3;
            mx += Math.sin(t * 1.3 + j.num) * 0.45; my += Math.cos(t * 1.1 + j.num) * 0.4;
            [j.cx, j.cy] = versTerrain(c, mx, my);
        }
    }
    function placerDefense(c) {
        const att = adv(c), schema = DEFS[defenses[c]] || DEFS['6-0'];
        const bx = att === 'moi' ? ballon.x : L - ballon.x;
        for (const j of equipes[c]) {
            if (j.poste === 'GB') {
                const [gx, gy] = versTerrain(att, 10 + Math.max(-1.2, Math.min(1.2, (bx - 10) * 0.12)), 0.9);
                if (!j.plonge) { j.cx = gx; j.cy = gy; }
                continue;
            }
            let [mx, my] = schema[j.poste];
            mx += (bx - 10) * 0.25;
            const p = ballon.porteur;
            if (p && p.cote === att) {
                const [pmx, pmy] = att === 'moi' ? [p.x, p.y] : [L - p.x, LONG - p.y];
                if (Math.abs(pmx - mx) < 3 && pmy > 7.5) { my = Math.min(pmy - 1.2, my + 1.6); mx = mx * .5 + pmx * .5; }
            }
            [j.cx, j.cy] = versTerrain(att, mx, my);
        }
    }

    // ----- Une action du moteur, jouée en « duree » millisecondes -----
    function joueur(c, i) { return equipes[c][Math.max(0, Math.min(equipes[c].length - 1, i))]; }
    function donner(j) { ballon.porteur = j; ballon.vol = null; }
    function passer(de, a, d) { ballon.porteur = null; ballon.vol = { type: 'passe', de: { x: de.x, y: de.y }, cible: a, t: 0, d: Math.max(.12, d), haut: .6 }; }

    let vitesse = 1, arrivee = 0;   // les joueurs courent plus vite quand le match est accéléré
    function action(a) {
        const c = a.attaque, o = adv(c), d = Math.max(200, a.duree) / 1000;
        vitesse = Math.max(1, Math.min(4, 1.3 / d));
        arrivee = d * .38;   // chacun a rejoint sa place à ce moment de l'action
        possession = c;
        filet = null;
        timeline = [];
        tempsScene = 0;
        // le ballon arrive au demi-centre (relance du gardien, ou engagement)
        const dc = joueur(c, 5);
        if (!ballon.porteur || ballon.porteur.cote !== c) donner(joueur(c, 0));
        const tireur = a.tireur >= 0 ? joueur(c, a.tireur) : joueur(c, [1, 2, 3, 4, 5, 6][Math.floor(Math.random() * 6)]);
        const passeurs = equipes[c].filter(j => j.poste !== 'GB' && j !== tireur);
        let t = 0;
        timeline.push({ t, f: () => { if (ballon.porteur && ballon.porteur.cote === c) passer(ballon.porteur, dc, d * .18); } });
        t += d * .3;
        // une ou deux passes, puis le ballon au tireur
        const n = d > .9 ? 2 : d > .45 ? 1 : 0;
        let dernier = dc;
        for (let k = 0; k < n; k++) {
            const vers = passeurs[Math.floor(Math.random() * passeurs.length)];
            const de = dernier;
            timeline.push({ t, f: () => passer(ballon.porteur || de, vers, d * .12) });
            dernier = vers; t += d * .16;
        }
        if (a.type === 'perte') {
            // une passe interceptée par un défenseur
            const inter = equipes[o].filter(j => j.poste !== 'GB').sort((x, y) => dist(x, tireur) - dist(y, tireur))[0];
            timeline.push({ t, f: () => passer(ballon.porteur || dernier, inter, d * .14) });
            return;
        }
        if (tireur !== dernier) {
            timeline.push({ t, f: () => passer(ballon.porteur || dernier, tireur, d * .12) });
            t += d * .14;
        }
        if (a.septMetres) {
            timeline.push({ t: Math.max(0, t - d * .2), f: () => { const [x, y] = versTerrain(c, 10, 7.2); tireur.cx = x; tireur.cy = y; tireur.fige = true; } });
        }
        timeline.push({ t, f: () => tirer(tireur, a.type) });
    }

    function tirer(tireur, issue) {
        const c = tireur.cote, butY = c === 'moi' ? 0 : LONG;
        const tx = issue === 'rate' ? (Math.random() < .5 ? rnd(7.6, 8.4) : rnd(11.6, 12.4)) : rnd(8.8, 11.2);
        const cible = { x: tx, y: butY + (c === 'moi' ? -.2 : .2) };
        const gb = joueur(adv(c), 0);
        gb.cx = 10 + (tx - 10) * (issue === 'arret' ? .95 : .55); gb.plonge = 1;
        ballon.porteur = null;
        ballon.vol = { type: 'tir', de: { x: tireur.x, y: tireur.y }, cible, t: 0, d: .32 + dist(tireur, cible) * .012, haut: 1.4, issue, gb };
        tireur.fige = false;
    }

    function finVol(v) {
        if (v.type === 'passe') { donner(v.cible); return; }
        if (v.issue === 'but') { filet = { cote: v.cible.y < 20 ? 0 : 1, t: 1 }; ballon.x = v.cible.x; ballon.y = v.cible.y; }
        else if (v.issue === 'arret') donner(v.gb);
        else { ballon.x = v.cible.x; ballon.y = v.cible.y + (v.cible.y < 20 ? -1 : 1); }
    }

    // ----- Boucle -----
    function maj(dt) {
        tempsScene += dt;
        while (timeline.length && timeline[0].t <= tempsScene) timeline.shift().f();
        const c = possession;
        placerAttaque(c); placerDefense(adv(c));
        for (const j of equipes.moi.concat(equipes.eux)) {
            const dx = j.cx - j.x, dy = j.cy - j.y, d = Math.hypot(dx, dy);
            // assez vite pour être en place au moment voulu (les changements de camp sont courts en accéléré)
            const reste = arrivee - tempsScene;
            const v = Math.max((j.poste === 'GB' ? 6 : 9) * vitesse, reste > .05 ? d / reste : 0);
            if (d > .01) { const pas = Math.min(d, v * dt); j.x += dx / d * pas; j.y += dy / d * pas; }
            j.plonge = Math.max(0, j.plonge - dt * 1.4);
        }
        const b = ballon;
        if (b.porteur) { b.x = b.porteur.x + .35; b.y = b.porteur.y - .15; b.z = 0; }
        else if (b.vol) {
            const v = b.vol; v.t += dt / v.d;
            const k = Math.min(1, v.t), cx = v.cible.x, cy = v.cible.y;
            b.x = v.de.x + (cx - v.de.x) * k; b.y = v.de.y + (cy - v.de.y) * k; b.z = Math.sin(k * Math.PI) * v.haut;
            if (v.t >= 1) { b.vol = null; finVol(v); }
        }
        b.trace.push({ x: b.x, y: b.y }); if (b.trace.length > (b.vol && b.vol.type === 'tir' ? 9 : 4)) b.trace.shift();
        if (filet) filet.t = Math.max(0, filet.t - dt * .6);
    }

    const px = x => ox + (x + MARGE) * echelle;
    const py = y => (y + MARGE) * echelle;

    // Le terrain, dessiné une seule fois dans une image (redessiné seulement si la taille change)
    function preparerFond() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        fond = document.createElement('canvas');
        fond.width = Math.round(larg * dpr); fond.height = Math.round(haut * dpr);
        const c = fond.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        const garde = ctx; ctx = c; terrain(); ctx = garde;
    }

    function terrain() {
        ctx.fillStyle = '#1D4592'; ctx.fillRect(0, 0, larg, haut);
        ctx.fillStyle = '#2459B5'; ctx.fillRect(px(0), py(0), L * echelle, LONG * echelle);
        ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
        for (let x = 0; x <= L; x += 1.25) { ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(LONG)); ctx.stroke(); }
        for (const sens of [0, 1]) {
            const gy = sens === 0 ? 0 : LONG, s = sens === 0 ? 1 : -1, a = sens === 0;
            ctx.fillStyle = '#E8913A'; ctx.beginPath(); ctx.moveTo(px(0), py(gy));
            ctx.arc(px(8.5), py(gy), 6 * echelle, Math.PI, a ? Math.PI / 2 : Math.PI * 1.5, a);
            ctx.lineTo(px(11.5), py(gy + s * 6));
            ctx.arc(px(11.5), py(gy), 6 * echelle, a ? Math.PI / 2 : Math.PI * 1.5, 0, a);
            ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.setLineDash([7, 6]); ctx.beginPath();
            ctx.arc(px(8.5), py(gy), 9 * echelle, Math.PI, a ? Math.PI / 2 : Math.PI * 1.5, a);
            ctx.lineTo(px(11.5), py(gy + s * 9));
            ctx.arc(px(11.5), py(gy), 9 * echelle, a ? Math.PI / 2 : Math.PI * 1.5, 0, a);
            ctx.stroke(); ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(px(9.5), py(gy + s * 7)); ctx.lineTo(px(10.5), py(gy + s * 7)); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.18)';
            ctx.fillRect(px(8.5), py(gy) - (s > 0 ? .9 * echelle : 0), 3 * echelle, .9 * echelle);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
            ctx.moveTo(px(8.5), py(gy)); ctx.lineTo(px(8.5), py(gy - s * .9)); ctx.lineTo(px(11.5), py(gy - s * .9)); ctx.lineTo(px(11.5), py(gy)); ctx.stroke();
        }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(px(0), py(0), L * echelle, LONG * echelle);
        ctx.beginPath(); ctx.moveTo(px(0), py(20)); ctx.lineTo(px(L), py(20)); ctx.stroke();
        ctx.beginPath(); ctx.arc(px(10), py(20), 1.4 * echelle, 0, 7); ctx.stroke();
    }

    function dessinerJoueur(j) {
        const x = px(j.x), y = py(j.y), r = Math.max(7.5, .7 * echelle) * (j.poste === 'GB' ? 1.08 : 1);
        const couleur = COULEURS[j.cote][j.poste === 'GB' ? 1 : 0];
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x + r * .18, y + r * .55, r * 1.05, r * .55, 0, 0, 7); ctx.fill();
        if (j.plonge > 0) { ctx.save(); ctx.translate(x, y); ctx.scale(1 + j.plonge * .5, 1 - j.plonge * .2); ctx.translate(-x, -y); }
        ctx.fillStyle = couleur; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.lineWidth = choisi === j ? 3.5 : 2; ctx.strokeStyle = choisi === j ? '#FFD45C' : 'rgba(255,255,255,.95)'; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .32, r * .38, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(r * 1.05)}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(j.num, x, y + r * .06);
        if (j.plonge > 0) ctx.restore();
        if (j.cote === 'moi' && j.forme < 65) {
            ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x - r, y - r - 7, r * 2, 3.5);
            ctx.fillStyle = j.forme < 40 ? '#FF4D6D' : '#FFD45C'; ctx.fillRect(x - r, y - r - 7, r * 2 * j.forme / 100, 3.5);
        }
    }

    function dessinerBallon() {
        const b = ballon;
        ctx.strokeStyle = 'rgba(255,214,92,.45)'; ctx.lineCap = 'round';
        for (let i = 1; i < b.trace.length; i++) {
            ctx.lineWidth = i * .9; ctx.beginPath(); ctx.moveTo(px(b.trace[i - 1].x), py(b.trace[i - 1].y)); ctx.lineTo(px(b.trace[i].x), py(b.trace[i].y)); ctx.stroke();
        }
        const x = px(b.x), y = py(b.y) - b.z * echelle * .9, r = Math.max(3.6, .32 * echelle) * (1 + b.z * .25);
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(px(b.x), py(b.y) + 2, r * .9, r * .45, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#FFE9A8'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
        ctx.strokeStyle = '#B5651D'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - r, y); ctx.quadraticCurveTo(x, y + r * .5, x + r, y); ctx.stroke();
    }

    function dessiner() {
        ctx.drawImage(fond, 0, 0, larg, haut);
        // le filet qui s'allume sur un but
        if (filet && filet.t > 0) {
            const gy = filet.cote === 0 ? 0 : LONG, s = filet.cote === 0 ? 1 : -1;
            ctx.fillStyle = `rgba(255,212,92,${.35 + filet.t * .6})`;
            ctx.fillRect(px(8.5), py(gy) - (s > 0 ? .9 * echelle : 0), 3 * echelle, .9 * echelle);
        }
        for (const j of equipes.moi.concat(equipes.eux).sort((a, b) => a.y - b.y)) dessinerJoueur(j);
        dessinerBallon();
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '700 11px "Barlow Condensed", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(possession === 'moi' ? '▲ TON ATTAQUE' : '▼ ATTAQUE ADVERSE', 10, haut - 10);
    }

    let avant = 0;
    function boucle(t) {
        if (!toile) return;
        const dt = Math.min(.05, (t - avant) / 1000); avant = t;
        if (!document.hidden && toile.isConnected) { maj(dt); dessiner(); }
        raf = requestAnimationFrame(boucle);
    }

    // Tout le terrain, sur toute la largeur de l'écran (pas de bandes sur les côtés)
    function taille() {
        if (!toile) return;
        const w = toile.parentElement.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
        echelle = w / (L + 2 * MARGE);
        larg = w; haut = Math.round((LONG + 2 * MARGE) * echelle);
        ox = (w - (L + 2 * MARGE) * echelle) / 2;
        toile.style.height = haut + 'px';
        toile.width = Math.round(w * dpr); toile.height = Math.round(haut * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        preparerFond();
    }

    function toucher(e) {
        const r = toile.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        let mieux = null, dm = 28;
        for (const j of equipes.moi.concat(equipes.eux)) { const d = Math.hypot(px(j.x) - x, py(j.y) - y); if (d < dm) { dm = d; mieux = j; } }
        choisi = mieux;
        const info = toile.parentElement.querySelector('.info-joueur-match');
        if (!info) return;
        if (!mieux) { info.hidden = true; return; }
        info.hidden = false;
        info.textContent = `${mieux.num} · ${mieux.nom} · ${mieux.poste}` + (mieux.cote === 'moi' ? ` · forme ${Math.round(mieux.forme)} %` : '');
        clearTimeout(infoMinuteur); infoMinuteur = setTimeout(() => { info.hidden = true; choisi = null; }, 2600);
    }

    return {
        // cfg : { moi: [{num, nom, cle, forme}] x7 (ordre des cases), eux: [...], defenses: {moi, eux}, possession }
        monter(el, cfg) {
            if (toile === el) { this.equipes(cfg); return; }
            this.liberer();
            toile = el; ctx = el.getContext('2d');
            equipes = { moi: [], eux: [] };
            this.equipes(cfg);
            for (const c of ['moi', 'eux']) for (const j of equipes[c]) {
                const [x, y] = versTerrain(c, ATT[j.poste][0], j.poste === 'GB' ? 38.8 : 22 + (POSTES.indexOf(j.poste) % 3));
                j.x = j.cx = x; j.y = j.cy = y;
            }
            ballon.x = 10; ballon.y = 20; ballon.porteur = joueur(cfg.possession || 'moi', 5); ballon.vol = null; ballon.trace = [];
            possession = cfg.possession || 'moi'; timeline = [];
            taille();
            window.addEventListener('resize', taille);
            el.addEventListener('pointerdown', toucher);
            avant = performance.now();
            raf = requestAnimationFrame(boucle);
        },
        equipes(cfg) {
            if (cfg.moi) equipes.moi = creerJoueurs('moi', cfg.moi);
            if (cfg.eux) equipes.eux = creerJoueurs('eux', cfg.eux);
            if (cfg.defenses) defenses = cfg.defenses;
            if (ballon.porteur && !equipes[ballon.porteur.cote].includes(ballon.porteur)) ballon.porteur = equipes[ballon.porteur.cote][5] || null;
        },
        // a : { attaque: 'moi'|'eux', type: 'but'|'arret'|'rate'|'perte', tireur: index 0-6 (-1 inconnu), septMetres, duree (ms) }
        action(a) { if (toile && equipes.moi.length) action(a); },
        // Possession sans animation (plusieurs actions d'un coup) : l'équipe se met en place
        placer(c) { possession = c; timeline = []; if (equipes[c].length) donner(joueur(c, 5)); },
        liberer() {
            if (!toile) return;
            cancelAnimationFrame(raf);
            window.removeEventListener('resize', taille);
            toile.removeEventListener('pointerdown', toucher);
            toile = null; ctx = null;
        }
    };
})();
