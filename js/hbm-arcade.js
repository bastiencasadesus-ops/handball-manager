// LE MATCH ARCADE (bêta, Pages/Beta.razor) : un vrai petit match où tu diriges toi-même ton joueur.
// 7 contre 7, terrain vu de dessus en vertical, ton équipe attaque vers le haut. L'IA joue tous les autres.
//   Attaque : tu contrôles le porteur du ballon. PASSE (vers où pointe le joystick), TIR (maintenir = plus puissant).
//   Défense : tu contrôles un défenseur. CONTRER (vol de balle, contre d'un tir), CHANGER (le défenseur le plus proche).
// Les notes des joueurs comptent : vitesse de course, puissance et précision du tir, vols, arrêts du gardien.
// Clavier (ordinateur) : flèches/ZQSD, Espace = tir, X = passe / changer, C = contrer.
(() => {
    const L = 20, LONG = 40, PI = Math.PI;
    const DUREE_MITEMPS = 180;                 // secondes réelles par mi-temps (affiché comme 30 minutes)
    const POSTES = ['GB', 'AG', 'AD', 'ARG', 'ARD', 'DC', 'PIV'];
    // Attaque : mètres depuis la ligne de but attaquée (x, distance)
    const ATT = { GB: [10, 38.6], AG: [1.4, 3.6], ARG: [4.8, 10.2], DC: [10, 11.4], ARD: [15.2, 10.2], AD: [18.6, 3.6], PIV: [10, 6.4] };
    // Défense 6-0 : mètres depuis le but défendu (vu de face : x de l'attaquant miroir)
    const DEF = { GB: [10, 0.7], AG: [17.4, 6.5], ARG: [13.7, 7.3], DC: [10, 7.6], ARD: [6.3, 7.3], AD: [2.6, 6.5], PIV: [10.6, 6.6] };
    const PEAUX = ['#F6D3B3', '#E8B48A', '#C68A5E', '#8D5A3B', '#5C3A24'];
    const CHEVEUX = ['#1E1A17', '#4A2E1C', '#A0662F', '#D9B26A', '#7B7B7B'];

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
    const adv = c => (c === 'moi' ? 'eux' : 'moi');
    // le but attaqué par chaque camp : moi vers le haut (y = 0), eux vers le bas (y = 40)
    const butAttaque = c => (c === 'moi' ? 0 : LONG);
    const versTerrain = (c, mx, my) => c === 'moi' ? [mx, my] : [L - mx, LONG - my];
    // distance à la ligne de but (segment entre les poteaux) d'un but donné
    function distZone(x, y, gy) {
        const dx = x < 8.5 ? 8.5 - x : x > 11.5 ? x - 11.5 : 0;
        return Math.hypot(dx, y - gy);
    }

    let S = null;   // l'état de la partie en cours

    // ----- Création -----
    function creerJoueur(c, j, i) {
        const poste = POSTES[i] || 'DC', h = hash(j.nom + j.num);
        const vit = j.vit ?? 55, note = j.note ?? 55;
        const [x, y] = versTerrain(c, ...(poste === 'GB' ? [10, 39.2] : [ATT[poste][0], 22 + (ATT[poste][1] - 6) * 0.4]));
        return {
            cote: c, poste, gb: poste === 'GB', num: j.num, nom: j.nom, court: (j.nom || '').split(' ').slice(-1)[0],
            note, vit, tir: j.tir ?? 55, att: j.att ?? 55, def: j.def ?? 55, arr: j.arr ?? 50,
            vmax: 4.4 + (vit - 50) / 50 * 1.5, x, y, cx: x, cy: y, vx: 0, vy: 0, dirx: 0, diry: c === 'moi' ? -1 : 1,
            phase: Math.random() * 6, etourdi: 0, geste: 0, plonge: null, peau: PEAUX[h % 5], cheveux: CHEVEUX[(h >> 3) % 5], chauve: (h >> 6) % 7 === 0
        };
    }

    function demarrer(toile, config, dotnet) {
        arreter();
        const ctx = toile.getContext('2d');
        S = {
            toile, ctx, dotnet, config, dpr: Math.min(2, window.devicePixelRatio || 1),
            equipes: { moi: config.moi.joueurs.map((j, i) => creerJoueur('moi', j, i)), eux: config.eux.joueurs.map((j, i) => creerJoueur('eux', j, i)) },
            couleurs: { moi: config.moi.couleurs, eux: config.eux.couleurs },
            noms: { moi: config.moi.court, eux: config.eux.court },
            score: { moi: 0, eux: 0 }, temps: 0, mitemps: 1, etat: 'engagement', minuteur: 1.4, possession: 'moi',
            ballon: { x: 10, y: 20, z: 0, vz: 0, vx: 0, vy: 0, porteur: null, vol: null },
            controle: null, camY: 22, camX: 10, joy: { actif: false, id: null, ox: 0, oy: 0, x: 0, y: 0, dx: 0, dy: 0 },
            boutons: { a: { appui: false, debut: 0, id: null }, b: { appui: false, id: null } },
            clavier: {}, textes: [], tempsPossession: 0, derniere: performance.now(), raf: 0, stats: { tirs: { moi: 0, eux: 0 }, arrets: { moi: 0, eux: 0 } }
        };
        engagement('moi');
        redimensionner();
        S.surResize = () => redimensionner();
        window.addEventListener('resize', S.surResize);
        S.surTouche = e => toucher(e);
        for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) toile.addEventListener(t, S.surTouche, { passive: false });
        S.surSouris = e => souris(e);
        for (const t of ['mousedown', 'mousemove', 'mouseup']) toile.addEventListener(t, S.surSouris);
        S.surClavier = e => { S.clavier[e.key.toLowerCase()] = e.type === 'keydown'; clavierBoutons(e); };
        window.addEventListener('keydown', S.surClavier); window.addEventListener('keyup', S.surClavier);
        S.raf = requestAnimationFrame(boucle);
    }

    function arreter() {
        if (!S) return;
        cancelAnimationFrame(S.raf);
        window.removeEventListener('resize', S.surResize);
        window.removeEventListener('keydown', S.surClavier); window.removeEventListener('keyup', S.surClavier);
        for (const t of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) S.toile.removeEventListener(t, S.surTouche);
        for (const t of ['mousedown', 'mousemove', 'mouseup']) S.toile.removeEventListener(t, S.surSouris);
        S = null;
    }

    function redimensionner() {
        const r = S.toile.getBoundingClientRect();
        S.larg = r.width; S.haut = r.height;
        S.toile.width = Math.round(r.width * S.dpr); S.toile.height = Math.round(r.height * S.dpr);
        S.vue = S.larg < 600 ? 14.5 : 19;                 // mètres visibles en largeur : on voit les joueurs de près
        S.echelle = S.larg / S.vue;
    }

    // ----- Phases de jeu -----
    function placerTous(engageant) {
        for (const c of ['moi', 'eux']) for (const j of S.equipes[c]) {
            let mx, my;
            if (j.gb) { [mx, my] = [10, 39.3]; }
            else if (c === engageant) { mx = ATT[j.poste][0]; my = j.poste === 'DC' ? 20 : 20.6 + (ATT[j.poste][1] - 3) * 0.3; }
            else { mx = L - DEF[j.poste][0]; my = 40 - (DEF[j.poste][1] + 5); }
            const [x, y] = versTerrain(c, mx, my);
            j.x = j.cx = x; j.y = j.cy = y; j.vx = j.vy = 0; j.etourdi = 0; j.plonge = null; j.geste = 0;
        }
    }
    function engagement(c) {
        placerTous(c);
        const dc = S.equipes[c].find(j => j.poste === 'DC') || S.equipes[c][1];
        dc.x = dc.cx = 10; dc.y = dc.cy = 20;
        donner(dc);
        S.etat = 'engagement'; S.minuteur = 1.3;
    }
    function donner(j) {
        const b = S.ballon;
        b.porteur = j; b.vol = null; b.z = 0; b.vz = 0; b.vx = b.vy = 0;
        if (S.possession !== j.cote) { S.possession = j.cote; S.tempsPossession = 0; S.controleManuel = false; }
        j.recu = performance.now();
        j.decision = rnd(0.5, 1.4);
        choisirControle();
    }
    function controler(j) {
        if (S.controle === j) return;
        if (S.controle) S.controle.manuel = false;
        S.controle = j;
        if (j) j.manuel = false;
    }
    function choisirControle() {
        const b = S.ballon;
        if (b.porteur && b.porteur.cote === 'moi') { controler(b.porteur.gb ? plusAvance('moi') : b.porteur); return; }
        if (b.vol && b.vol.type === 'passe' && b.vol.cible && b.vol.cible.cote === 'moi') { controler(b.vol.cible); return; }
        if (!S.controle || S.controle.gb || S.controle.cote !== 'moi' || (b.porteur && b.porteur.cote === 'eux' && !S.controleManuel)) controler(plusProche('moi'));
    }
    const champ = c => S.equipes[c].filter(j => !j.gb);
    const plusProche = (c, sauf) => champ(c).filter(j => j !== sauf).sort((a, b) => dist(a, S.ballon) - dist(b, S.ballon))[0];
    const plusAvance = c => champ(c).sort((a, b) => Math.abs(a.y - butAttaque(c)) - Math.abs(b.y - butAttaque(c)))[0];
    const gardien = c => S.equipes[c].find(j => j.gb);

    // ----- Boucle -----
    function boucle(t) {
        if (!S) return;
        const dt = Math.min(0.05, (t - S.derniere) / 1000);
        S.derniere = t;
        maj(dt);
        dessiner();
        S.raf = requestAnimationFrame(boucle);
    }

    function maj(dt) {
        for (const tx of S.textes) tx.t -= dt;
        S.textes = S.textes.filter(tx => tx.t > 0);
        if (S.etat === 'pause' || S.etat === 'mitempsPause' || S.etat === 'fin') return;
        if (S.etat === 'engagement' || S.etat === 'but') {
            S.minuteur -= dt;
            animerSeulement(dt);
            if (S.minuteur <= 0) {
                if (S.etat === 'but') engagement(S.apresBut);
                else S.etat = 'jeu';
            }
            return;
        }
        S.temps += dt;
        S.tempsPossession += dt;
        if (S.temps >= DUREE_MITEMPS) {
            if (S.mitemps === 1) { S.mitemps = 2; S.temps = 0; S.etat = 'mitempsPause'; S.ballon.vol = null; return; }
            S.etat = 'fin'; S.ballon.vol = null;
            try { S.dotnet && S.dotnet.invokeMethodAsync('FinDuMatch', S.score.moi, S.score.eux); } catch { }
            return;
        }
        commandes(dt);
        cibles();
        bouger(dt);
        ballonMaj(dt);
        ia(dt);
        // caméra : suit le ballon, un peu en avance vers le but attaqué par le porteur
        const b = S.ballon, avance = S.possession === 'moi' ? -3 : 3;
        S.camY += ((b.y + avance) - S.camY) * Math.min(1, dt * 3);
        camX(dt);
    }
    function bornerCamera() {
        const e = S.echelle, haut = (S.haut * 0.46 - 60) / e - 1.5, bas = LONG + 1.5 - (S.haut * 0.54) / e;
        S.camY = haut <= bas ? clamp(S.camY, haut, bas) : LONG / 2;
    }
    function camX(dt) {
        bornerCamera();
        const demi = S.vue / 2, cible = clamp(S.ballon.x, demi - 0.6, L - demi + 0.6);
        S.camX += (cible - S.camX) * Math.min(1, dt * 2.5);
    }
    function animerSeulement(dt) {
        cibles(); bouger(dt);
        const b = S.ballon;
        if (b.porteur) { b.x = b.porteur.x + 0.25; b.y = b.porteur.y; }
        S.camY += (b.y - S.camY) * Math.min(1, dt * 3);
        camX(dt);
    }

    // ----- Commandes -----
    function direction() {
        const j = S.joy, k = S.clavier;
        let dx = j.dx, dy = j.dy;
        const kx = (k['arrowright'] || k['d'] ? 1 : 0) - (k['arrowleft'] || k['q'] || k['a'] ? 1 : 0);
        const ky = (k['arrowdown'] || k['s'] ? 1 : 0) - (k['arrowup'] || k['z'] || k['w'] ? 1 : 0);
        if (kx || ky) { const n = Math.hypot(kx, ky); dx = kx / n; dy = ky / n; }
        return [dx, dy];
    }
    function commandes(dt) {
        const c = S.controle;
        if (!c || c.etourdi > 0) return;
        const [dx, dy] = direction();
        const v = c.vmax * (S.ballon.porteur === c ? 0.93 : 1) * (S.boutons.a.appui && S.ballon.porteur === c ? 0.55 : 1);
        c.vx += (dx * v - c.vx) * Math.min(1, dt * 10);
        c.vy += (dy * v - c.vy) * Math.min(1, dt * 10);
        const maintenant = performance.now();
        if (Math.hypot(dx, dy) > 0.1) { c.dirx = dx; c.diry = dy; c.manuel = true; c.dernierGeste = maintenant; }
        else if (S.ballon.porteur === c) { c.manuel = true; c.cx = c.x; c.cy = c.y; }          // le porteur attend tes ordres
        else if (maintenant - (c.dernierGeste || 0) > 700) c.manuel = false;                  // sans consigne, l'IA le replace
    }
    // bouton A : TIR (attaque) / CONTRER (défense) ; bouton B : PASSE (attaque) / CHANGER (défense)
    function appuiA() {
        if (S.etat === 'mitempsPause') { S.etat = 'engagement'; S.minuteur = 1; engagement('eux'); return; }
        if (S.etat !== 'jeu') return;
        if (S.possession === 'moi' && S.ballon.porteur === S.controle) { S.boutons.a.debut = performance.now(); return; }
        if (S.possession === 'eux' || !S.ballon.porteur) contrer(S.controle);
    }
    function relacheA() {
        if (S.etat !== 'jeu') return;
        const c = S.controle;
        if (S.possession === 'moi' && S.ballon.porteur === c && S.boutons.a.debut) {
            const charge = clamp((performance.now() - S.boutons.a.debut) / 750, 0, 1);
            S.boutons.a.debut = 0;
            const [dx] = direction();
            tirer(c, 0.35 + charge * 0.65, dx);
        }
    }
    function appuiB() {
        if (S.etat === 'mitempsPause') { appuiA(); return; }
        if (S.etat !== 'jeu') return;
        const c = S.controle;
        if (S.ballon.porteur === c && c.cote === 'moi') {
            const [dx, dy] = direction();
            const cible = cibleDePasse(c, Math.hypot(dx, dy) > 0.3 ? [dx, dy] : null);
            if (cible) passer(c, cible);
            return;
        }
        if (S.possession === 'eux' || (S.ballon.porteur && S.ballon.porteur.cote === 'eux') || !S.ballon.porteur) {
            const n = plusProche('moi', S.controle);
            if (n) { controler(n); S.controleManuel = true; }
        }
    }
    function clavierBoutons(e) {
        if (e.repeat) return;
        const k = e.key.toLowerCase(), bas = e.type === 'keydown';
        if (k === ' ' || k === 'c') { e.preventDefault(); if (bas) { S.boutons.a.appui = true; appuiA(); } else { S.boutons.a.appui = false; relacheA(); } }
        if (k === 'x' && bas) appuiB();
    }

    // zones tactiles : joystick à gauche (flottant), deux boutons ronds à droite
    function zonesBoutons() {
        const r = Math.min(46, S.larg * 0.11), bas = S.haut - 30 - r;
        return { a: { x: S.larg - 26 - r, y: bas - r * 0.4, r }, b: { x: S.larg - 26 - r * 3.2, y: bas + r * 0.55, r: r * 0.82 } };
    }
    function debutContact(id, x, y) {
        if (S.etat === 'fin') { finClic(x, y); return; }
        if (S.etat === 'mitempsPause') { appuiA(); return; }
        if (x < 54 && y < 60) { S.etat = S.etat === 'pause' ? 'jeu' : (S.etat === 'jeu' ? 'pause' : S.etat); return; }
        if (S.etat === 'pause') { pauseClic(x, y); return; }
        const z = zonesBoutons();
        if (Math.hypot(x - z.a.x, y - z.a.y) < z.a.r * 1.25) { S.boutons.a = { appui: true, id, debut: 0 }; appuiA(); return; }
        if (Math.hypot(x - z.b.x, y - z.b.y) < z.b.r * 1.25) { S.boutons.b = { appui: true, id }; appuiB(); return; }
        if (x < S.larg * 0.6 && y > S.haut * 0.35) { S.joy = { actif: true, id, ox: x, oy: y, x, y, dx: 0, dy: 0 }; }
    }
    function moveContact(id, x, y) {
        const j = S.joy;
        if (j.actif && j.id === id) {
            let dx = x - j.ox, dy = y - j.oy; const n = Math.hypot(dx, dy), max = 50;
            if (n > max) { j.ox = x - dx / n * max; j.oy = y - dy / n * max; dx = x - j.ox; dy = y - j.oy; }
            j.x = x; j.y = y;
            const m = Math.min(1, Math.hypot(dx, dy) / max);
            j.dx = m < 0.15 ? 0 : dx / (Math.hypot(dx, dy) || 1) * m; j.dy = m < 0.15 ? 0 : dy / (Math.hypot(dx, dy) || 1) * m;
        }
    }
    function finContact(id) {
        if (S.joy.id === id) S.joy = { actif: false, id: null, dx: 0, dy: 0 };
        if (S.boutons.a.id === id) { S.boutons.a.appui = false; relacheA(); S.boutons.a.id = null; }
        if (S.boutons.b.id === id) { S.boutons.b = { appui: false, id: null }; }
    }
    function toucher(e) {
        e.preventDefault();
        if (!S) return;
        const r = S.toile.getBoundingClientRect();
        for (const t of e.changedTouches) {
            const x = t.clientX - r.left, y = t.clientY - r.top;
            if (e.type === 'touchstart') debutContact(t.identifier, x, y);
            else if (e.type === 'touchmove') moveContact(t.identifier, x, y);
            else finContact(t.identifier);
        }
    }
    function souris(e) {
        if (!S) return;
        const r = S.toile.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        if (e.type === 'mousedown') { S.sourisBas = true; debutContact('m', x, y); }
        else if (e.type === 'mousemove' && S.sourisBas) moveContact('m', x, y);
        else if (e.type === 'mouseup') { S.sourisBas = false; finContact('m'); }
    }
    function boutonsFin() {
        const w = Math.min(300, S.larg - 60), x = (S.larg - w) / 2, y = S.haut / 2 + 40;
        return { rejouer: { x, y, w, h: 50 }, quitter: { x, y: y + 62, w, h: 50 } };
    }
    const dans = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    function finClic(x, y) {
        const b = boutonsFin();
        if (dans(b.rejouer, x, y)) { const { toile, config, dotnet } = S; demarrer(toile, config, dotnet); }
        else if (dans(b.quitter, x, y)) { try { S.dotnet.invokeMethodAsync('Quitter'); } catch { } }
    }
    function pauseClic(x, y) {
        const b = boutonsFin();
        if (dans(b.rejouer, x, y)) S.etat = 'jeu';
        else if (dans(b.quitter, x, y)) { try { S.dotnet.invokeMethodAsync('Quitter'); } catch { } }
    }

    // ----- Actions -----
    function cibleDePasse(p, dir) {
        const coeq = S.equipes[p.cote].filter(j => j !== p && !j.gb);
        let meilleur = null, score = 1e9;
        for (const j of coeq) {
            const d = dist(p, j);
            if (d < 1.5 || d > 24) continue;
            const ouvert = Math.min(...S.equipes[adv(p.cote)].map(a => dist(a, j)));
            let s;
            if (dir) {
                const ang = Math.acos(clamp(((j.x - p.x) * dir[0] + (j.y - p.y) * dir[1]) / d, -1, 1));
                s = ang * 10 + d * 0.15;
            } else {
                const versBut = Math.abs(j.y - butAttaque(p.cote));
                s = versBut * 0.35 + d * 0.15 - ouvert * 1.2;
            }
            if (s < score) { score = s; meilleur = j; }
        }
        return meilleur;
    }
    function passer(p, cible) {
        const b = S.ballon, d = dist(p, cible), v = 15 + p.att / 25, t = d / v;
        const tx = cible.x + cible.vx * t * 0.8, ty = cible.y + cible.vy * t * 0.8;
        const n = Math.hypot(tx - p.x, ty - p.y) || 1;
        b.porteur = null; b.x = p.x; b.y = p.y; b.z = 1.1;
        b.vx = (tx - p.x) / n * v; b.vy = (ty - p.y) / n * v; b.vz = 0;
        b.vol = { type: 'passe', de: p, cible, t: 0, testes: new Set([p]) };
        p.geste = 0.25;
        choisirControle();
    }
    function tirer(p, puissance, visee) {
        const b = S.ballon, gy = butAttaque(p.cote), d = distZone(p.x, p.y, gy);
        const g = gardien(adv(p.cote));
        // où il vise : le joystick (gauche/droite) ou le côté opposé au gardien
        let cx = visee && Math.abs(visee) > 0.25 ? 10 + visee * 1.35 : (g && g.x > 10 ? 8.75 : 11.25);
        if (p.cote === 'eux' && visee) cx = 10 - visee * 1.35;
        const precision = (p.tir - 30) / 70;                         // 0..1
        const ecart = (1 - precision) * (0.25 + d / 14) * (0.6 + puissance * 0.7);
        cx += rnd(-1, 1) * ecart;
        const vitesse = (12 + puissance * 11) * (0.8 + p.tir / 250);
        const cy = gy, n = Math.hypot(cx - p.x, cy - p.y) || 1;
        b.porteur = null; b.x = p.x; b.y = p.y; b.z = 1.5;
        b.vx = (cx - p.x) / n * vitesse; b.vy = (cy - p.y) / n * vitesse; b.vz = rnd(-0.3, 0.6);
        // l'issue se décide au départ du tir : hors cadre, arrêt, ou but
        let issue = 'but';
        if (Math.abs(cx - 10) > 1.48) issue = 'rate';
        else if (g) {
            const coin = Math.abs(cx - 10) / 1.5;
            let pArret = 0.24 + (g.arr - 60) * 0.011 + Math.max(0, d - 7) * 0.035 - puissance * 0.12 - coin * 0.14;
            if (d > 11) pArret += 0.1;
            if (Math.random() < clamp(pArret, 0.06, 0.82)) issue = 'arret';
        }
        // contre d'un défenseur collé au tireur, dans l'axe du tir
        for (const def of champ(adv(p.cote))) {
            const dd = dist(def, p);
            if (dd < 1.6 && ((def.x - p.x) * (cx - p.x) + (def.y - p.y) * (cy - p.y)) > 0 && Math.random() < 0.28 + (def.def - p.tir) / 200) { issue = 'contre'; break; }
        }
        b.vol = { type: 'tir', de: p, issue, cx, t: 0, temps: n / vitesse };
        S.stats.tirs[p.cote]++;
        p.geste = 0.4;
        if (g && issue !== 'rate') {
            const vers = issue === 'arret' ? cx : (cx > 10 ? cx - rnd(1.2, 2) : cx + rnd(1.2, 2));
            g.plonge = { x: clamp(vers, 8.3, 11.7), t: 0, duree: Math.max(0.15, n / vitesse * 0.9) };
        }
    }
    function contrer(c) {
        if (!c || c.etourdi > 0) return;
        const b = S.ballon;
        c.geste = 0.3;
        if (b.porteur && b.porteur.cote !== c.cote && dist(c, b.porteur) < 1.4) {
            const p = b.porteur;
            const chance = clamp(0.32 + (c.def - p.att) / 110, 0.12, 0.6);
            if (Math.random() < chance) { texte('INTERCEPTÉ !', '#3DDC84'); p.etourdi = 0.5; donner(c); }
            else if (Math.random() < 0.3) { texte('FAUTE', '#FFD45C'); c.etourdi = 1.1; p.decision = 0.6; }
            else c.etourdi = 0.45;
        } else if (b.vol && b.vol.type === 'tir' && b.vol.de.cote !== c.cote && dist(c, b) < 1.8 && b.vol.issue !== 'rate') {
            b.vol.issue = 'contre';
        } else c.etourdi = 0.2;
    }
    function texte(t, couleur) { S.textes.push({ t: 1.3, texte: t, couleur }); }

    // ----- Ballon -----
    function ballonMaj(dt) {
        const b = S.ballon;
        if (b.porteur) {
            const p = b.porteur, rebond = Math.abs(Math.sin(p.phase * 2)) * 0.7;
            b.x = p.x + (p.cote === 'moi' ? 0.3 : -0.3); b.y = p.y + 0.05; b.z = p.geste > 0 ? 1.6 : 0.2 + rebond;
            return;
        }
        if (!b.vol) {   // ballon libre : il roule et le plus proche le ramasse
            b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - dt * 1.6; b.vy *= 1 - dt * 1.6; b.z = Math.max(0, b.z - dt * 3);
            b.x = clamp(b.x, 0.2, L - 0.2); b.y = clamp(b.y, 0.3, LONG - 0.3);
            for (const c of ['moi', 'eux']) for (const j of S.equipes[c]) if (dist(j, b) < 0.6 && j.etourdi <= 0) { donner(j); return; }
            return;
        }
        const v = b.vol;
        v.t += dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (v.type === 'passe') {
            b.z = 1.1 + Math.sin(Math.min(1, v.t / 1.2) * PI) * 0.6;
            for (const c of ['moi', 'eux']) for (const j of S.equipes[c]) {
                if (v.testes.has(j) || j.etourdi > 0) continue;
                const d = dist(j, b);
                if (j.cote === v.de.cote) { if (d < 0.75) { donner(j); return; } continue; }
                if (d < (j.gb ? 1.1 : 0.62)) {
                    v.testes.add(j);
                    if (Math.random() < clamp(0.45 + (j.def - v.de.att) / 120, 0.2, 0.75)) { if (j.cote === 'moi') texte('INTERCEPTION !', '#3DDC84'); donner(j); return; }
                }
            }
            if (b.x < 0 || b.x > L || b.y < 0 || b.y > LONG || v.t > 2.2) { horsJeu(v.de.cote); return; }
            return;
        }
        // tir
        const gy = butAttaque(v.de.cote), g = gardien(adv(v.de.cote));
        b.z = Math.max(0.3, 1.5 + b.vz * v.t);
        const dLigne = Math.abs(b.y - gy);
        if (v.issue === 'contre' && v.t > 0.08) {
            texte('CONTRÉ !', '#FFD45C');
            b.vol = null; b.vx = -b.vx * 0.3 + rnd(-3, 3); b.vy = -b.vy * 0.3; b.z = 0.5; return;
        }
        if (v.issue === 'arret' && dLigne < 0.9) {
            S.stats.arrets[g.cote]++;
            texte(g.cote === 'moi' ? 'ARRÊT !' : 'ARRÊT DU GARDIEN', g.cote === 'moi' ? '#3DDC84' : '#FF9AAA');
            if (Math.random() < 0.6) { donner(g); g.decision = 0.7; }
            else { b.vol = null; b.vx = rnd(-5, 5); b.vy = (gy === 0 ? 1 : -1) * rnd(3, 6); b.z = 0.8; }
            return;
        }
        if ((gy === 0 && b.y <= 0) || (gy === LONG && b.y >= LONG)) {
            if (v.issue === 'but') { but(v.de); return; }
            texte(v.de.cote === 'moi' ? 'À CÔTÉ…' : 'À CÔTÉ', '#C9D4EE');
            const gg = gardien(adv(v.de.cote)); donner(gg); gg.decision = 0.9; return;
        }
    }
    function horsJeu(cotePerdant) {
        const autre = adv(cotePerdant), b = S.ballon;
        const j = champ(autre).sort((a, c) => dist(a, b) - dist(c, b))[0];
        b.x = clamp(b.x, 0.3, L - 0.3); b.y = clamp(b.y, 0.5, LONG - 0.5);
        j.x = b.x; j.y = b.y;
        donner(j); j.decision = 0.8;
    }
    function but(tireur) {
        S.score[tireur.cote]++;
        texte(tireur.cote === 'moi' ? `BUT ! ${tireur.court}` : `BUT ${S.noms.eux}`, tireur.cote === 'moi' ? '#FFD45C' : '#FF7A90');
        S.filet = { cote: tireur.cote, t: 0.8, x: S.ballon.x };
        S.ballon.vol = null; S.ballon.vx = S.ballon.vy = 0;
        S.etat = 'but'; S.minuteur = 1.7; S.apresBut = adv(tireur.cote);
        try { navigator.vibrate && tireur.cote === 'moi' && navigator.vibrate(60); } catch { }
    }

    // ----- Placement des joueurs sans ballon -----
    function cibles() {
        const b = S.ballon, att = S.possession, dfc = adv(att), t = performance.now() / 1000;
        const bxAtt = att === 'moi' ? b.x : L - b.x;   // ballon vu depuis l'attaque
        for (const j of S.equipes[att]) {
            if (j === b.porteur || (j === S.controle && j.manuel)) continue;
            let mx, my;
            if (j.gb) { [mx, my] = [10, 39.3]; }
            else {
                [mx, my] = ATT[j.poste];
                if (j.poste !== 'AG' && j.poste !== 'AD') mx += (bxAtt - 10) * 0.2;
                // en contre-attaque, les ailiers filent devant
                const prog = att === 'moi' ? b.y : LONG - b.y;
                if (prog > 22 && (j.poste === 'AG' || j.poste === 'AD')) my = Math.min(my, prog - 14);
                else if (prog > 22) my = Math.max(my, prog - 9);
                mx += Math.sin(t * 1.3 + j.num) * 0.8; my += Math.cos(t * 0.9 + j.num) * 0.7;
            }
            [j.cx, j.cy] = versTerrain(att, mx, my);
        }
        const porteur = b.porteur, gy = butAttaque(att);
        for (const j of S.equipes[dfc]) {
            if (j === S.controle && j.manuel) continue;
            if (j.gb) {
                const bx = clamp(10 + (b.x - 10) * 0.28, 8.8, 11.2);
                j.cx = bx; j.cy = gy === 0 ? 0.7 : LONG - 0.7;
                continue;
            }
            const [dx, dd] = DEF[j.poste];
            let mx = L - dx + (bxAtt - 10) * 0.35, my = dd;   // vu depuis l'attaque : x miroir
            [j.cx, j.cy] = versTerrain(att, mx, my);
        }
        // le défenseur le plus proche du porteur monte sur lui
        if (porteur && !porteur.gb) {
            const presseur = champ(dfc).filter(j => !(j === S.controle && j.manuel)).sort((a, c) => dist(a, porteur) - dist(c, porteur))[0];
            if (presseur && distZone(porteur.x, porteur.y, gy) < 13) {
                const nx = gy - porteur.y, n = Math.abs(nx) || 1;
                presseur.cx = porteur.x; presseur.cy = porteur.y + nx / n * 0.9;
            }
        }
    }

    function bouger(dt) {
        const tous = [...S.equipes.moi, ...S.equipes.eux];
        for (const j of tous) {
            if (j.etourdi > 0) j.etourdi -= dt;
            if (j.geste > 0) j.geste -= dt;
            if (j.plonge) {
                j.plonge.t += dt;
                const k = Math.min(1, j.plonge.t / j.plonge.duree);
                j.x += (j.plonge.x - j.x) * Math.min(1, dt * 12 * k + 0.05);
                if (j.plonge.t > j.plonge.duree + 0.5) j.plonge = null;
                continue;
            }
            if (!(j === S.controle && j.manuel) || j.etourdi > 0) {
                const dx = j.cx - j.x, dy = j.cy - j.y, d = Math.hypot(dx, dy);
                const v = j.etourdi > 0 ? 0 : Math.min(j.vmax * (j === S.ballon.porteur ? 0.9 : 1), d * 3);
                const tvx = d > 0.05 ? dx / d * v : 0, tvy = d > 0.05 ? dy / d * v : 0;
                j.vx += (tvx - j.vx) * Math.min(1, dt * 6); j.vy += (tvy - j.vy) * Math.min(1, dt * 6);
                if (d > 0.2) { j.dirx = dx / d; j.diry = dy / d; }
            }
            if (j === S.controle && j.etourdi > 0) { j.vx *= 0.8; j.vy *= 0.8; }
            j.x += j.vx * dt; j.y += j.vy * dt;
            j.phase += Math.hypot(j.vx, j.vy) * dt * 2.4;
            j.x = clamp(j.x, 0.3, L - 0.3); j.y = clamp(j.y, 0.3, LONG - 0.3);
        }
        // pas deux joueurs l'un sur l'autre
        for (let i = 0; i < tous.length; i++) for (let k = i + 1; k < tous.length; k++) {
            const a = tous[i], c = tous[k], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
            if (d > 0 && d < 0.7) { const p = (0.7 - d) / 2; a.x -= dx / d * p; a.y -= dy / d * p; c.x += dx / d * p; c.y += dy / d * p; }
        }
        // la zone des 6 m : interdite aux joueurs de champ (sauf le tireur en suspension)
        for (const j of tous) {
            if (j.gb) { const gy = j.cote === 'moi' ? LONG : 0; j.y = gy === 0 ? clamp(j.y, 0.3, 3.5) : clamp(j.y, LONG - 3.5, LONG - 0.3); continue; }
            if (j.geste > 0) continue;
            for (const gy of [0, LONG]) {
                const d = distZone(j.x, j.y, gy);
                if (d < 6) {
                    const px = clamp(j.x, 8.5, 11.5), dx = j.x - px, dy = j.y - gy, n = Math.hypot(dx, dy) || 1;
                    j.x = px + dx / n * 6.02; j.y = gy + (dy === 0 ? (gy === 0 ? 6.02 : -6.02) : dy / n * 6.02);
                }
            }
        }
    }

    // ----- L'IA -----
    function ia(dt) {
        const b = S.ballon, p = b.porteur;
        // les défenseurs de l'IA tentent de voler le ballon
        if (p) for (const d of champ(adv(p.cote))) {
            if (d === S.controle) continue;
            d.tentative = (d.tentative ?? rnd(0.6, 1.4)) - dt;
            if (d.tentative <= 0 && dist(d, p) < 1.1 && d.etourdi <= 0) {
                d.tentative = rnd(1.2, 2.4);
                const chance = clamp(0.1 + (d.def - p.att) / 220, 0.04, 0.22);
                if (Math.random() < chance) { if (p.cote === 'moi') texte('BALLON PERDU', '#FF9AAA'); p.etourdi = 0.5; donner(d); return; }
                if (Math.random() < 0.18) { d.etourdi = 1; if (d.cote === 'eux') texte('FAUTE', '#FFD45C'); }
            }
        }
        if (!p) return;
        // le gardien relance vite (contre-attaque)
        if (p.gb) {
            p.decision -= dt;
            if (p.decision <= 0) {
                const cible = p.cote === 'moi' ? (S.controle && !S.controle.gb ? S.controle : plusAvance('moi')) : cibleDePasse(p, null);
                if (cible) passer(p, cible);
            }
            return;
        }
        if (p.cote === 'moi' && p === S.controle) {
            // jeu passif : au bout de 25 s, l'arbitre lève le bras
            if (S.tempsPossession > 25) { texte('JEU PASSIF', '#FFD45C'); horsJeu('moi'); }
            return;
        }
        // un attaquant de l'IA
        const gy = butAttaque(p.cote), d = distZone(p.x, p.y, gy);
        const defs = champ(adv(p.cote));
        const devant = defs.filter(x => Math.abs(x.y - gy) < Math.abs(p.y - gy)).length;
        const libre = Math.min(...defs.map(x => dist(x, p)));
        p.decision -= dt;
        if (devant <= 1 && d > 7) { p.cx = 10 + (p.x - 10) * 0.5; p.cy = gy === 0 ? 6.5 : LONG - 6.5; }   // contre-attaque : il file au but
        else if (d > 9.5 && libre > 1.5) { p.cx = p.x + (10 - p.x) * 0.2; p.cy = p.y + (gy - p.y) * 0.12; }  // il avance
        if (devant <= 1 && d < 7.5) { tirer(p, rnd(0.6, 1), 0); return; }
        if (p.decision <= 0) {
            p.decision = rnd(0.7, 1.6);
            const forcer = S.tempsPossession > 18;
            if ((d < 9.6 && libre > 1.3 && Math.random() < 0.55) || (forcer && d < 12) || (p.poste === 'PIV' && d < 7.5) || ((p.poste === 'AG' || p.poste === 'AD') && d < 7.5 && Math.random() < 0.7)) {
                tirer(p, rnd(0.45, 1), 0); return;
            }
            const cible = cibleDePasse(p, null);
            if (cible) passer(p, cible);
        }
    }

    // ----- Dessin -----
    const px = x => S.larg / 2 + (x - S.camX) * S.echelle;
    const py = y => S.haut * 0.46 + (y - S.camY) * S.echelle;

    function dessiner() {
        const ctx = S.ctx, e = S.echelle;
        ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
        ctx.fillStyle = '#122E66'; ctx.fillRect(0, 0, S.larg, S.haut);
        terrain(ctx, e);
        const b = S.ballon;
        const tous = [...S.equipes.moi, ...S.equipes.eux].sort((a, c) => a.y - c.y);
        // ombre du ballon
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(px(b.x), py(b.y), e * 0.2, e * 0.1, 0, 0, 7); ctx.fill();
        const ctl = S.controle;
        if (ctl) {
            ctx.strokeStyle = '#FFD45C'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px(ctl.x), py(ctl.y) + e * 0.05, e * 0.55, e * 0.28, 0, 0, 7); ctx.stroke();
        }
        for (const j of tous) joueur(ctx, j, e);
        // le ballon
        const bx = px(b.x), by = py(b.y) - b.z * e * 0.55;
        ctx.fillStyle = '#FFF4DA'; ctx.beginPath(); ctx.arc(bx, by, e * 0.2, 0, 7); ctx.fill();
        ctx.strokeStyle = '#E8913A'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(bx, by, e * 0.2, 0.6, 2.4); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by, e * 0.2, 3.7, 5.5); ctx.stroke();
        if (ctl) {   // le triangle au-dessus du joueur contrôlé
            const tx = px(ctl.x), ty = py(ctl.y) - e * 1.75;
            ctx.fillStyle = '#FFD45C'; ctx.beginPath(); ctx.moveTo(tx - 7, ty - 9); ctx.lineTo(tx + 7, ty - 9); ctx.lineTo(tx, ty); ctx.closePath(); ctx.fill();
        }
        hud(ctx);
        commandesDessin(ctx);
        textes(ctx);
        if (S.etat === 'mitempsPause') rideau(ctx, 'MI-TEMPS', `${S.noms.moi} ${S.score.moi} – ${S.score.eux} ${S.noms.eux}`, 'Touche pour la 2e mi-temps');
        if (S.etat === 'pause') { rideau(ctx, 'PAUSE', '', ''); boutons(ctx, 'REPRENDRE', 'QUITTER'); }
        if (S.etat === 'fin') {
            const r = S.score.moi > S.score.eux ? 'VICTOIRE !' : S.score.moi < S.score.eux ? 'DÉFAITE' : 'MATCH NUL';
            rideau(ctx, r, `${S.noms.moi} ${S.score.moi} – ${S.score.eux} ${S.noms.eux}`, `Tirs : ${S.stats.tirs.moi} – ${S.stats.tirs.eux} · Arrêts : ${S.stats.arrets.moi} – ${S.stats.arrets.eux}`);
            boutons(ctx, 'REJOUER', 'QUITTER');
        }
    }

    function terrain(ctx, e) {
        ctx.fillStyle = '#2459B5'; ctx.fillRect(px(0), py(0), L * e, LONG * e);
        ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
        for (let x = 0; x <= L; x += 1.25) { ctx.beginPath(); ctx.moveTo(px(x), py(0)); ctx.lineTo(px(x), py(LONG)); ctx.stroke(); }
        // les tribunes, de chaque côté
        ctx.fillStyle = '#0B1E46'; ctx.fillRect(0, 0, Math.max(0, px(0) - 2), S.haut); ctx.fillRect(px(L) + 2, 0, S.larg, S.haut);
        for (const gyv of [0, LONG]) {
            const a = gyv === 0, s = a ? 1 : -1;
            ctx.fillStyle = '#E8913A'; ctx.beginPath(); ctx.moveTo(px(0), py(gyv));
            ctx.arc(px(8.5), py(gyv), 6 * e, PI, a ? PI / 2 : PI * 1.5, a);
            ctx.lineTo(px(11.5), py(gyv + s * 6));
            ctx.arc(px(11.5), py(gyv), 6 * e, a ? PI / 2 : PI * 1.5, 0, a);
            ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.setLineDash([7, 6]); ctx.beginPath();
            ctx.arc(px(8.5), py(gyv), 9 * e, PI, a ? PI / 2 : PI * 1.5, a);
            ctx.lineTo(px(11.5), py(gyv + s * 9));
            ctx.arc(px(11.5), py(gyv), 9 * e, a ? PI / 2 : PI * 1.5, 0, a);
            ctx.stroke(); ctx.setLineDash([]);
            ctx.beginPath(); ctx.moveTo(px(9.5), py(gyv + s * 7)); ctx.lineTo(px(10.5), py(gyv + s * 7)); ctx.stroke();
            // le but et son filet
            const flash = S.filet && S.filet.t > 0 && ((S.filet.cote === 'moi') === a);
            ctx.fillStyle = flash ? 'rgba(255,212,92,.55)' : 'rgba(255,255,255,.16)';
            ctx.fillRect(px(8.5), a ? py(gyv) - 1.0 * e : py(gyv), 3 * e, 1.0 * e);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
            ctx.moveTo(px(8.5), py(gyv)); ctx.lineTo(px(8.5), py(gyv - s * 1)); ctx.lineTo(px(11.5), py(gyv - s * 1)); ctx.lineTo(px(11.5), py(gyv)); ctx.stroke();
            ctx.strokeStyle = '#E4002B'; ctx.lineWidth = 3; ctx.setLineDash([e * 0.2, e * 0.2]);
            ctx.beginPath(); ctx.moveTo(px(8.5), py(gyv)); ctx.lineTo(px(11.5), py(gyv)); ctx.stroke(); ctx.setLineDash([]);
        }
        if (S.filet) S.filet.t -= 1 / 60;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.strokeRect(px(0), py(0), L * e, LONG * e);
        ctx.beginPath(); ctx.moveTo(px(0), py(20)); ctx.lineTo(px(L), py(20)); ctx.stroke();
        ctx.beginPath(); ctx.arc(px(10), py(20), 1.5 * e, 0, 7); ctx.stroke();
    }

    function joueur(ctx, j, e) {
        const x = px(j.x), y = py(j.y), [c1, c2] = S.couleurs[j.cote];
        const maillot = j.gb ? c2 : c1, k = e / 26;   // taille relative
        const v = Math.hypot(j.vx, j.vy), pas = v > 0.4 ? Math.sin(j.phase * 2) : 0;
        ctx.save(); ctx.translate(x, y);
        if (j.plonge) { const s = j.plonge.x > j.x ? 1 : -1; ctx.rotate(s * Math.min(1.1, j.plonge.t * 5)); }
        // ombre
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 0, 13 * k, 5 * k, 0, 0, 7); ctx.fill();
        // jambes
        ctx.fillStyle = '#1B1B22';
        ctx.fillRect(-7 * k, -12 * k + pas * 3 * k, 5 * k, 12 * k - pas * 3 * k);
        ctx.fillRect(2 * k, -12 * k - pas * 3 * k, 5 * k, 12 * k + pas * 3 * k);
        ctx.fillStyle = '#fff'; ctx.fillRect(-7.5 * k, -2 * k + pas * 1 * k, 6 * k, 3 * k); ctx.fillRect(1.5 * k, -2 * k - pas * 1 * k, 6 * k, 3 * k);
        // corps (maillot)
        ctx.fillStyle = maillot; ctx.beginPath(); ctx.roundRect(-10 * k, -32 * k, 20 * k, 21 * k, 6 * k); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(-10 * k, -14 * k, 20 * k, 3 * k);
        // bras
        const leve = j.geste > 0 ? -1 : 0;
        ctx.strokeStyle = j.peau; ctx.lineWidth = 4.5 * k; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-10 * k, -28 * k); ctx.lineTo(-14 * k, (-18 - pas * 3) * k); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10 * k, -28 * k); ctx.lineTo(leve ? 13 * k : 14 * k, leve ? -42 * k : (-18 + pas * 3) * k); ctx.stroke();
        if (j.gb) { ctx.beginPath(); ctx.moveTo(-10 * k, -28 * k); ctx.lineTo(-17 * k, -36 * k); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10 * k, -28 * k); ctx.lineTo(17 * k, -36 * k); ctx.stroke(); }
        // numéro
        ctx.fillStyle = clair(maillot) ? '#111' : '#fff'; ctx.font = `800 ${Math.round(10 * k)}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(j.num, 0, -21.5 * k);
        // tête (grosse, style cartoon)
        ctx.fillStyle = j.peau; ctx.beginPath(); ctx.arc(0, -41 * k, 10.5 * k, 0, 7); ctx.fill();
        if (!j.chauve) { ctx.fillStyle = j.cheveux; ctx.beginPath(); ctx.arc(0, -43 * k, 10.8 * k, PI * 1.02, PI * 1.98); ctx.fill(); }
        ctx.fillStyle = '#1d1d1d';
        const ox = j.dirx * 2.2 * k;
        ctx.beginPath(); ctx.arc(-3.5 * k + ox, -40 * k, 1.3 * k, 0, 7); ctx.arc(3.5 * k + ox, -40 * k, 1.3 * k, 0, 7); ctx.fill();
        if (j.etourdi > 0.3) { ctx.fillStyle = '#FFD45C'; ctx.font = `${Math.round(10 * k)}px sans-serif`; ctx.fillText('💫', 0, -56 * k); }
        ctx.restore();
        if (j === S.controle) {
            ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(10, Math.round(11 * k))}px "Barlow Condensed", sans-serif`; ctx.textAlign = 'center';
            ctx.fillText(j.court.toUpperCase(), x, y + 14 * k);
        }
    }
    function clair(hex) {
        const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        return r * 0.3 + g * 0.59 + b * 0.11 > 170;
    }

    function hud(ctx) {
        const w = S.larg, h = 52;
        ctx.fillStyle = 'rgba(5,15,42,.88)'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = S.couleurs.moi[0]; ctx.fillRect(60, 10, 8, 32);
        ctx.fillStyle = S.couleurs.eux[0]; ctx.fillRect(w - 68, 10, 8, 32);
        ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        ctx.font = '800 20px "Barlow Condensed", sans-serif';
        ctx.textAlign = 'left'; ctx.fillText(S.noms.moi, 76, 26);
        ctx.textAlign = 'right'; ctx.fillText(S.noms.eux, w - 76, 26);
        ctx.textAlign = 'center'; ctx.font = '900 30px "Barlow Condensed", sans-serif';
        ctx.fillText(`${S.score.moi} : ${S.score.eux}`, w / 2, 22);
        const minutes = Math.floor((S.temps / DUREE_MITEMPS) * 30 + (S.mitemps - 1) * 30);
        ctx.font = '700 13px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#FFD45C';
        ctx.fillText(`${minutes}'  ·  ${S.mitemps === 1 ? '1re' : '2e'} MT`, w / 2, 43);
        // bouton pause
        ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(28, 26, 18, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(22, 18, 4, 16); ctx.fillRect(30, 18, 4, 16);
        // ligne de « BÊTA »
        ctx.font = '700 10px "Barlow Condensed", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText('BÊTA · MATCH ARCADE', w / 2, h + 10);
    }

    function commandesDessin(ctx) {
        if (S.etat === 'fin' || S.etat === 'pause' || S.etat === 'mitempsPause') return;
        const z = zonesBoutons(), attaque = S.possession === 'moi' && S.ballon.porteur === S.controle;
        const charge = S.boutons.a.debut ? clamp((performance.now() - S.boutons.a.debut) / 750, 0, 1) : 0;
        rond(ctx, z.a, attaque ? 'TIR' : 'CONTRER', attaque ? '#E4002B' : '#1B7F3B', S.boutons.a.appui, charge);
        rond(ctx, z.b, attaque ? 'PASSE' : 'CHANGER', '#1B4DB1', S.boutons.b.appui, 0);
        const j = S.joy;
        if (j.actif) {
            ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(j.ox, j.oy, 52, 0, 7); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(j.ox + j.dx * 50, j.oy + j.dy * 50, 22, 0, 7); ctx.fill();
        } else {
            const x = 80, y = S.haut - 100;
            ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 46, 0, 7); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(x, y, 20, 0, 7); ctx.fill();
        }
    }
    function rond(ctx, z, label, couleur, appui, charge) {
        ctx.globalAlpha = appui ? 0.95 : 0.8;
        ctx.fillStyle = couleur; ctx.beginPath(); ctx.arc(z.x, z.y, z.r * (appui ? 0.94 : 1), 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
        if (charge > 0) { ctx.strokeStyle = '#FFD45C'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(z.x, z.y, z.r + 6, -PI / 2, -PI / 2 + charge * 2 * PI); ctx.stroke(); }
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(z.r * 0.36)}px "Barlow Condensed", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, z.x, z.y);
    }
    function textes(ctx) {
        let y = S.haut * 0.3;
        for (const t of S.textes) {
            ctx.globalAlpha = Math.min(1, t.t * 2);
            ctx.font = '900 34px "Barlow Condensed", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(t.texte, S.larg / 2, y);
            ctx.fillStyle = t.couleur; ctx.fillText(t.texte, S.larg / 2, y);
            y += 40;
        }
        ctx.globalAlpha = 1;
        if (S.etat === 'engagement') {
            ctx.font = '800 18px "Barlow Condensed", sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
            ctx.fillText(S.possession === 'moi' ? 'ENGAGEMENT · À TOI !' : 'ENGAGEMENT ADVERSE', S.larg / 2, S.haut * 0.22);
        }
    }
    function rideau(ctx, titre, ligne, sous) {
        ctx.fillStyle = 'rgba(3,10,30,.82)'; ctx.fillRect(0, 0, S.larg, S.haut);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#FFD45C';
        ctx.font = '900 46px "Barlow Condensed", sans-serif'; ctx.fillText(titre, S.larg / 2, S.haut / 2 - 70);
        ctx.fillStyle = '#fff'; ctx.font = '800 26px "Barlow Condensed", sans-serif'; ctx.fillText(ligne, S.larg / 2, S.haut / 2 - 22);
        ctx.fillStyle = '#C9D4EE'; ctx.font = '600 15px "Barlow Condensed", sans-serif'; ctx.fillText(sous, S.larg / 2, S.haut / 2 + 10);
    }
    function boutons(ctx, a, b) {
        const z = boutonsFin();
        for (const [r, t, c] of [[z.rejouer, a, '#E4002B'], [z.quitter, b, 'rgba(255,255,255,.14)']]) {
            ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = '800 20px "Barlow Condensed", sans-serif'; ctx.fillText(t, r.x + r.w / 2, r.y + r.h / 2);
        }
    }

    window.hbmArcade = { demarrer, arreter, etat: () => S && { etat: S.etat, score: S.score, temps: S.temps, possession: S.possession, controle: S.controle && S.controle.nom } };
})();
