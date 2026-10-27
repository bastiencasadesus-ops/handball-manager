// Le match vivant (Pages/Match.razor) : tout le terrain vu de dessus, caméra fixe.
// Le moteur du jeu (MatchEnDirect) décide de tout ; ce fichier rejoue chaque action reçue :
// placement de l'attaque, quelques passes, puis le tir du vrai tireur avec le vrai résultat
// (but, arrêt du gardien, tir raté, perte de balle). Ton équipe attaque toujours vers le haut.
//
// FLUIDITÉ : quand le téléphone le permet (OffscreenCanvas, iOS 16.4+), l'animation tourne dans un
// « worker », à côté du jeu : le moteur C# peut calculer une action sans jamais faire sauter une image.
// Ce même fichier sert aux deux côtés : la page (window.hbmMatch) et le worker (le dessin).
(() => {
    const DANS_WORKER = typeof window === 'undefined';
    const SRC = DANS_WORKER ? '' : (document.currentScript && document.currentScript.src) || 'js/hbm-match.js';
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

    let toile = null, ctx = null, raf = 0, echelle = 1, larg = 0, haut = 0, ox = 0, dpr = 1, choisi = null, infoMinuteur = 0, visible = true;
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
    const toileVide = (w, h) => {
        if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
        const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    };
    const rayon = gb => Math.max(7.5, .7 * echelle) * (gb ? 1.08 : 1);

    // Le terrain, dessiné une seule fois dans une image (redessiné seulement si la taille change)
    function preparerFond() {
        fond = toileVide(Math.max(1, Math.round(larg * dpr)), Math.max(1, Math.round(haut * dpr)));
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

    // Les petites images (pastille + numéro de chaque joueur, légende du bas) : dessinées une fois par la page
    // (qui a les polices), puis simplement copiées à chaque image du match.
    let sprites = new Map();
    const cleSprite = (cote, gb, num, ch) => cote + (gb ? 'G' : '') + '|' + num + (ch ? '*' : '');
    function fabriquerSprite(cote, gb, num, ch) {
        const r = rayon(gb), m = r * 1.45, cote2 = Math.ceil(m * 2 + 4);
        const c = toileVide(Math.ceil(cote2 * dpr), Math.ceil(cote2 * dpr)), g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const x = cote2 / 2, y = cote2 / 2;
        g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + r * .18, y + r * .55, r * 1.05, r * .55, 0, 0, 7); g.fill();
        g.fillStyle = COULEURS[cote][gb ? 1 : 0]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        g.lineWidth = ch ? 3.5 : 2; g.strokeStyle = ch ? '#FFD45C' : 'rgba(255,255,255,.95)'; g.stroke();
        g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(x - r * .3, y - r * .32, r * .38, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * 1.05)}px "Barlow Condensed", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(num, x, y + r * .06);
        return { c: c.transferToImageBitmap ? c.transferToImageBitmap() : c, cote: cote2 };
    }
    function fabriquerLegende(texte) {
        const c = toileVide(Math.ceil(140 * dpr), Math.ceil(16 * dpr)), g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 11px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        g.fillText(texte, 0, 12);
        return { c: c.transferToImageBitmap ? c.transferToImageBitmap() : c, cote: 0 };
    }
    // (côté page) toutes les images des joueurs actuels, aux dimensions actuelles
    function fabriquerSprites(cfgMoi, cfgEux) {
        const m = new Map();
        for (const [cote, liste] of [['moi', cfgMoi], ['eux', cfgEux]])
            (liste || []).forEach((j, i) => {
                for (const ch of [false, true]) m.set(cleSprite(cote, i === 0, j.num, ch), fabriquerSprite(cote, i === 0, j.num, ch));
            });
        m.set('lab|moi', fabriquerLegende('▲ TON ATTAQUE'));
        m.set('lab|eux', fabriquerLegende('▼ ATTAQUE ADVERSE'));
        return m;
    }
    function remplacerSprites(m) {
        for (const s of sprites.values()) if (s.c.close) s.c.close();
        sprites = m;
    }

    function dessinerJoueur(j) {
        const x = px(j.x), y = py(j.y), gb = j.poste === 'GB';
        const s = sprites.get(cleSprite(j.cote, gb, j.num, choisi === j));
        if (j.plonge > 0) { ctx.save(); ctx.translate(x, y); ctx.scale(1 + j.plonge * .5, 1 - j.plonge * .2); ctx.translate(-x, -y); }
        if (s) ctx.drawImage(s.c, x - s.cote / 2, y - s.cote / 2, s.cote, s.cote);
        else { const r = rayon(gb); ctx.fillStyle = COULEURS[j.cote][gb ? 1 : 0]; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
        if (j.plonge > 0) ctx.restore();
        if (j.cote === 'moi' && j.forme < 65) {
            const r = rayon(gb);
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

    const tous = [];
    function dessiner() {
        ctx.drawImage(fond, 0, 0, larg, haut);
        // le filet qui s'allume sur un but
        if (filet && filet.t > 0) {
            const gy = filet.cote === 0 ? 0 : LONG, s = filet.cote === 0 ? 1 : -1;
            ctx.fillStyle = `rgba(255,212,92,${.35 + filet.t * .6})`;
            ctx.fillRect(px(8.5), py(gy) - (s > 0 ? .9 * echelle : 0), 3 * echelle, .9 * echelle);
        }
        tous.length = 0;
        for (const j of equipes.moi) tous.push(j);
        for (const j of equipes.eux) tous.push(j);
        tous.sort((a, b) => a.y - b.y);
        for (const j of tous) dessinerJoueur(j);
        dessinerBallon();
        const lab = sprites.get(possession === 'moi' ? 'lab|moi' : 'lab|eux');
        if (lab) ctx.drawImage(lab.c, px(0) + 6, py(20) + 4, 140, 16);   // le long de la ligne médiane
    }

    const prochaineImage = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : f => setTimeout(() => f(performance.now()), 16);
    const annulerImage = typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : clearTimeout;
    let avant = 0, tourne = false, stats = { images: 0, lentes: 0, pire: 0 };
    function boucle(t) {
        if (!tourne || !ctx) return;
        const brut = t - avant; stats.images++; if (brut > 25) stats.lentes++; if (brut > stats.pire) stats.pire = brut;
        const dt = Math.min(.05, Math.max(0, brut / 1000)); avant = t;
        if (visible) { maj(dt); dessiner(); }
        raf = prochaineImage(boucle);
    }
    function demarrer() { if (tourne) return; tourne = true; avant = performance.now(); raf = prochaineImage(boucle); }
    function arreter() { tourne = false; annulerImage(raf); }

    function appliquerTaille(t) {
        larg = t.larg; haut = t.haut; echelle = t.echelle; ox = t.ox; dpr = t.dpr;
        toile.width = Math.round(larg * dpr); toile.height = Math.round(haut * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        preparerFond();
    }

    function monterScene(cfg) {
        equipes = { moi: [], eux: [] };
        equipesDe(cfg);
        for (const c of ['moi', 'eux']) for (const j of equipes[c]) {
            const [x, y] = versTerrain(c, ATT[j.poste][0], j.poste === 'GB' ? 38.8 : 22 + (POSTES.indexOf(j.poste) % 3));
            j.x = j.cx = x; j.y = j.cy = y;
        }
        ballon.x = 10; ballon.y = 20; ballon.porteur = joueur(cfg.possession || 'moi', 5); ballon.vol = null; ballon.trace = [];
        possession = cfg.possession || 'moi'; timeline = [];
    }
    function equipesDe(cfg) {
        if (cfg.moi) equipes.moi = creerJoueurs('moi', cfg.moi);
        if (cfg.eux) equipes.eux = creerJoueurs('eux', cfg.eux);
        if (cfg.defenses) defenses = cfg.defenses;
        if (ballon.porteur && !equipes[ballon.porteur.cote].includes(ballon.porteur)) ballon.porteur = equipes[ballon.porteur.cote][5] || null;
    }
    function placerScene(c) { possession = c; timeline = []; if (equipes[c].length) donner(joueur(c, 5)); }
    function joueurSous(x, y) {
        let mieux = null, dm = 28;
        for (const j of equipes.moi.concat(equipes.eux)) { const d = Math.hypot(px(j.x) - x, py(j.y) - y); if (d < dm) { dm = d; mieux = j; } }
        return mieux;
    }
    const infoDe = j => j ? `${j.num} · ${j.nom} · ${j.poste}` + (j.cote === 'moi' ? ` · forme ${Math.round(j.forme)} %` : '') : null;

    // ======================= Côté worker : le dessin =======================
    if (DANS_WORKER) {
        self.onmessage = e => {
            const m = e.data;
            switch (m.t) {
                case 'init':
                    if (m.toile) { toile = m.toile; ctx = toile.getContext('2d'); }
                    appliquerTaille(m.taille); monterScene(m.cfg); demarrer(); break;
                case 'taille': appliquerTaille(m.taille); break;
                case 'sprites': remplacerSprites(m.sprites); break;
                case 'equipes': equipesDe(m.cfg); break;
                case 'action': if (equipes.moi.length) action(m.a); break;
                case 'placer': placerScene(m.c); break;
                case 'toucher': choisi = joueurSous(m.x, m.y); self.postMessage({ t: 'info', texte: infoDe(choisi) }); break;
                case 'oublier': choisi = null; break;
                case 'visible': visible = m.v; break;
                case 'stop': arreter(); break;
                case 'stats': self.postMessage({ t: 'stats', stats }); stats = { images: 0, lentes: 0, pire: 0 }; break;
            }
        };
        return;
    }

    // ======================= Côté page =======================
    const AVEC_WORKER = typeof OffscreenCanvas !== 'undefined' && typeof Worker !== 'undefined'
        && 'transferControlToOffscreen' in HTMLCanvasElement.prototype && 'transferToImageBitmap' in OffscreenCanvas.prototype;
    let attenteStats = null, worker = null, cfgActuel = { moi: [], eux: [] };
    const workers = new WeakMap();   // une toile confiée à un worker le reste

    function envoyerSprites() {
        const m = fabriquerSprites(cfgActuel.moi, cfgActuel.eux);
        if (worker) worker.postMessage({ t: 'sprites', sprites: m }, [...m.values()].map(s => s.c));
        else remplacerSprites(m);
    }

    // Tout le terrain visible d'un coup en arrivant sur le match : le plus large possible,
    // sans dépasser le bas de l'écran (sous le score).
    function mesurer() {
        const w = toile.parentElement.clientWidth, d = Math.min(2, window.devicePixelRatio || 1);
        const defile = toile.closest('.plein'), r = toile.getBoundingClientRect();
        const haut0 = r.top + (defile ? defile.scrollTop : 0);
        // la place prise sous le terrain par les consignes et les commandes (pause, vitesses…) : elles restent visibles
        const page = toile.closest('.match-page'), cadre = toile.parentElement;
        let dessous = 0;
        if (page) for (const q of ['.consignes-match', '.bandeau-duel', '.commandes']) {
            const e = page.querySelector(q);
            if (e) dessous = Math.max(dessous, e.getBoundingClientRect().bottom - cadre.getBoundingClientRect().bottom);
        }
        const bord = cadre.offsetHeight - cadre.clientHeight;
        const dispo = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - haut0 - dessous - bord - 10;
        const e = Math.max(8, Math.min(w / (L + 2 * MARGE), dispo / (LONG + 2 * MARGE)));
        const h = Math.round((LONG + 2 * MARGE) * e);
        return { larg: w, haut: h, echelle: e, ox: (w - (L + 2 * MARGE) * e) / 2, dpr: d };
    }
    function taille() {
        if (!toile) return;
        const t = mesurer();
        toile.style.height = t.haut + 'px';
        larg = t.larg; haut = t.haut; echelle = t.echelle; ox = t.ox; dpr = t.dpr;
        if (worker) worker.postMessage({ t: 'taille', taille: t });
        else appliquerTaille(t);
        envoyerSprites();
    }
    function visibilite() { visible = !document.hidden; if (worker) worker.postMessage({ t: 'visible', v: visible }); }

    function montrerInfo(texte) {
        const info = toile && toile.parentElement.querySelector('.info-joueur-match');
        if (!info) return;
        if (!texte) { info.hidden = true; return; }
        info.hidden = false; info.textContent = texte;
        clearTimeout(infoMinuteur);
        infoMinuteur = setTimeout(() => { info.hidden = true; choisi = null; if (worker) worker.postMessage({ t: 'oublier' }); }, 2600);
    }
    function toucher(e) {
        const r = toile.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (worker) { worker.postMessage({ t: 'toucher', x, y }); return; }
        choisi = joueurSous(x, y);
        montrerInfo(infoDe(choisi));
    }

    window.hbmMatch = {
        // cfg : { moi: [{num, nom, cle, forme}] x7 (ordre des cases), eux: [...], defenses: {moi, eux}, possession }
        monter(el, cfg) {
            if (toile === el) { this.equipes(cfg); return; }
            this.liberer();
            toile = el;
            cfgActuel = { moi: cfg.moi || [], eux: cfg.eux || [] };
            worker = workers.get(el) || null;
            if (!worker && AVEC_WORKER) {
                try {
                    worker = new Worker(SRC);
                    const off = el.transferControlToOffscreen();
                    workers.set(el, worker);
                    worker.onmessage = e => { if (e.data.t === 'info') montrerInfo(e.data.texte); else if (e.data.t === 'stats' && attenteStats) { attenteStats(e.data.stats); attenteStats = null; } };
                    const t = mesurer(); el.style.height = t.haut + 'px';
                    larg = t.larg; haut = t.haut; echelle = t.echelle; ox = t.ox; dpr = t.dpr;
                    worker.postMessage({ t: 'init', toile: off, taille: t, cfg }, [off]);
                } catch (_) { worker = null; }
            } else if (worker) {
                const t = mesurer(); el.style.height = t.haut + 'px';
                larg = t.larg; haut = t.haut; echelle = t.echelle; ox = t.ox; dpr = t.dpr;
                worker.postMessage({ t: 'init', taille: t, cfg });
            }
            if (!worker) {
                ctx = el.getContext('2d');
                monterScene(cfg);
                taille();
                demarrer();
            } else envoyerSprites();
            if (document.fonts) document.fonts.ready.then(() => { if (toile === el) envoyerSprites(); });
            window.addEventListener('resize', taille);
            document.addEventListener('visibilitychange', visibilite);
            el.addEventListener('pointerdown', toucher);
        },
        equipes(cfg) {
            const avantNums = JSON.stringify([cfgActuel.moi.map(j => j.num), cfgActuel.eux.map(j => j.num)]);
            if (cfg.moi) cfgActuel.moi = cfg.moi;
            if (cfg.eux) cfgActuel.eux = cfg.eux;
            if (worker) worker.postMessage({ t: 'equipes', cfg });
            else equipesDe(cfg);
            if (JSON.stringify([cfgActuel.moi.map(j => j.num), cfgActuel.eux.map(j => j.num)]) !== avantNums) envoyerSprites();
        },
        // a : { attaque: 'moi'|'eux', type: 'but'|'arret'|'rate'|'perte', tireur: index 0-6 (-1 inconnu), septMetres, duree (ms) }
        action(a) {
            if (!toile) return;
            if (worker) worker.postMessage({ t: 'action', a });
            else if (equipes.moi.length) action(a);
        },
        // Possession sans animation (plusieurs actions d'un coup) : l'équipe se met en place
        placer(c) { if (worker) worker.postMessage({ t: 'placer', c }); else placerScene(c); },
        liberer() {
            if (!toile) return;
            if (worker) {
                worker.postMessage({ t: 'stop' });
                const el = toile, w = worker;   // toile retirée de la page : on libère aussi son worker
                setTimeout(() => { if (!el.isConnected && workers.get(el) === w) { w.terminate(); workers.delete(el); } }, 1500);
            } else arreter();
            window.removeEventListener('resize', taille);
            document.removeEventListener('visibilitychange', visibilite);
            toile.removeEventListener('pointerdown', toucher);
            toile = null; ctx = null; worker = null;
        },
        avecWorker: () => !!worker,
        // (mesure de fluidité) les images dessinées depuis la dernière demande
        stats() {
            if (!worker) { const r = stats; stats = { images: 0, lentes: 0, pire: 0 }; return Promise.resolve(r); }
            return new Promise(ok => { attenteStats = ok; worker.postMessage({ t: 'stats' }); });
        }
    };
})();
