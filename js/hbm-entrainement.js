// =====================================================================================
//  Les MINI-JEUX D'ENTRAÎNEMENT (EntrainementsJeux.cs) : un jeu de 15 secondes par exercice.
//  hbmEntrainement.jouer(exercice, joueur, couleur) ouvre le jeu en plein écran et renvoie une promesse :
//  le score de 0 à 100 (ou -1 si le joueur ferme sans jouer).
//    Tir       : vise les lucarnes, évite le gardien
//    Arrets    : plonge du bon côté avant que le ballon n'arrive
//    Vitesse   : gauche, droite, gauche, droite… le plus vite possible sans s'emmêler
//    Defense   : touche l'attaquant qui arme son tir avant qu'il ne déclenche
//    Endurance : garde le curseur dans la zone d'effort, qui bouge et rétrécit
//    Attaque   : trouve le coéquipier démarqué et fais la passe
// =====================================================================================
window.hbmEntrainement = (() => {
    const W = 360, H = 540;
    const TITRES = {
        Tir: ['🎯', 'TIR', 'Touche pour tirer : vise les coins, loin du gardien'],
        Arrets: ['🧤', 'ARRÊTS', 'Touche la zone où part le ballon pour plonger'],
        Vitesse: ['⚡', 'VITESSE', 'Alterne GAUCHE et DROITE le plus vite possible'],
        Defense: ['🛡', 'DÉFENSE', "Touche l'attaquant qui arme son tir avant qu'il ne déclenche"],
        Endurance: ['🔋', 'ENDURANCE', "Garde ton doigt sur la piste : reste dans la zone verte"],
        Attaque: ['⚔', 'ATTAQUE', 'Touche le coéquipier démarqué pour lui passer le ballon'],
    };
    const DUREE = { Tir: 15, Arrets: 16, Vitesse: 10, Defense: 15, Endurance: 15, Attaque: 15 };

    // ---------- outils de dessin ----------
    const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rnd = (a, b) => a + Math.random() * (b - a);

    function rr(ctx, x, y, w, h, r) {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
    function ballon(ctx, x, y, r, rot = 0) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = r * .6; ctx.shadowOffsetY = r * .25;
        const g = ctx.createRadialGradient(-r * .35, -r * .4, r * .1, 0, 0, r);
        g.addColorStop(0, '#FFF6D8'); g.addColorStop(.45, '#F6B23C'); g.addColorStop(1, '#C8641A');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(40,20,0,.55)'; ctx.lineWidth = Math.max(1, r * .12);
        ctx.beginPath(); ctx.arc(0, 0, r * .98, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-r, 0); ctx.quadraticCurveTo(0, r * .45, r, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -r); ctx.quadraticCurveTo(-r * .45, 0, 0, r); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(-r * .35, -r * .42, r * .28, r * .16, -.6, 0, 7); ctx.fill();
        ctx.restore();
    }
    function joueur(ctx, x, y, s, couleur, numero, opts = {}) {
        ctx.save(); ctx.translate(x, y);
        // ombre au sol
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0, s * .95, s * .75, s * .22, 0, 0, 7); ctx.fill();
        if (opts.halo) {
            ctx.strokeStyle = opts.halo; ctx.lineWidth = 4; ctx.globalAlpha = opts.haloAlpha ?? 1;
            ctx.beginPath(); ctx.arc(0, 0, s * 1.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (opts.haloPart ?? 1)); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        const g = ctx.createRadialGradient(-s * .3, -s * .35, s * .1, 0, 0, s);
        g.addColorStop(0, eclaircir(couleur, .35)); g.addColorStop(1, couleur);
        ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, s, 0, 7); ctx.fill(); ctx.stroke();
        if (numero !== undefined) {
            ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(s * .95)}px "Barlow Condensed", Inter, sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(numero, 0, s * .06);
        }
        ctx.restore();
    }
    // Une couleur d'adversaire bien distincte de celle de ton club
    function adversaireDe(hex) {
        const n = parseInt(hex.replace('#', ''), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        return r > b + 30 ? '#1E5BD6' : '#D0342C';
    }
    function eclaircir(hex, k) {
        const n = parseInt(hex.replace('#', ''), 16);
        let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        r = Math.round(r + (255 - r) * k); g = Math.round(g + (255 - g) * k); b = Math.round(b + (255 - b) * k);
        return `rgb(${r},${g},${b})`;
    }
    function parquet(ctx, haut, bas) {
        const g = ctx.createLinearGradient(0, haut, 0, bas);
        g.addColorStop(0, '#2B63C8'); g.addColorStop(1, '#173C8A');
        ctx.fillStyle = g; ctx.fillRect(0, haut, W, bas - haut);
        ctx.globalAlpha = .07; ctx.fillStyle = '#fff';
        for (let x = -40; x < W + 40; x += 26) { ctx.fillRect(x, haut, 2, bas - haut); }
        ctx.globalAlpha = 1;
    }

    // ---------- textes flottants, particules, secousse ----------
    function effets() {
        const flottants = [], particules = [];
        let secousse = 0;
        return {
            texte(x, y, t, couleur = '#FFD45C', taille = 30) { flottants.push({ x, y, t, couleur, taille, vie: 1 }); },
            eclat(x, y, couleurs = ['#FFD45C', '#FF4D6D', '#3DDC84', '#2EC4F1', '#fff'], n = 22) {
                for (let i = 0; i < n; i++) {
                    const a = rnd(0, Math.PI * 2), v = rnd(90, 260);
                    particules.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, vie: rnd(.6, 1.1), c: couleurs[i % couleurs.length], s: rnd(3, 6), r: rnd(0, 6) });
                }
            },
            secouer(f = 8) { secousse = f; },
            decalage() { const s = secousse; secousse *= .85; return s > .3 ? [rnd(-s, s), rnd(-s, s)] : [0, 0]; },
            dessiner(ctx, dt) {
                for (const p of particules) {
                    p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vie -= dt; p.r += dt * 8;
                    ctx.save(); ctx.globalAlpha = clamp(p.vie, 0, 1); ctx.translate(p.x, p.y); ctx.rotate(p.r);
                    ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
                }
                for (let i = particules.length - 1; i >= 0; i--) if (particules[i].vie <= 0) particules.splice(i, 1);
                for (const f of flottants) {
                    f.vie -= dt * .9; f.y -= 40 * dt;
                    const k = 1 + (1 - f.vie) * .15, a = clamp(f.vie * 1.6, 0, 1);
                    ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, f.y); ctx.scale(k, k);
                    ctx.font = `900 ${f.taille}px "Barlow Condensed", Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(5,15,42,.9)'; ctx.strokeText(f.t, 0, 0);
                    ctx.fillStyle = f.couleur; ctx.fillText(f.t, 0, 0); ctx.restore();
                }
                for (let i = flottants.length - 1; i >= 0; i--) if (flottants[i].vie <= 0) flottants.splice(i, 1);
            }
        };
    }

    // =====================================================================================
    //  Les jeux. Chacun : { maj(dt, t), dessiner(ctx, t), toucher(x, y, type), score() }
    // =====================================================================================
    function jeuTir(fx, couleur) {
        const but = { x: 40, y: 96, w: 280, h: 186 };
        let gk = { x: W / 2, cible: W / 2, vitesse: 120 }, viseur = { x: W / 2, y: 180 }, phase = 0;
        let tir = null, recharge = 0, buts = 0, lucarnes = 0, tirs = 0, filet = 0;
        return {
            maj(dt, t) {
                phase += dt;
                viseur.x = W / 2 + Math.sin(phase * 2.3) * 128 + Math.sin(phase * 5.1) * 12;
                viseur.y = but.y + but.h / 2 + Math.sin(phase * 3.1 + 1) * 74;
                if (Math.abs(gk.x - gk.cible) < 6) gk.cible = rnd(but.x + 50, but.x + but.w - 50);
                gk.x += Math.sign(gk.cible - gk.x) * Math.min(Math.abs(gk.cible - gk.x), (130 + t * 5) * dt);
                recharge -= dt; filet = Math.max(0, filet - dt * 2);
                if (tir) {
                    tir.t += dt / .38;
                    if (tir.t >= 1 && !tir.fini) {
                        tir.fini = true;
                        const pare = Math.abs(tir.x - gk.x) < 46 && tir.y > but.y + 30;
                        if (pare) { fx.texte(tir.x, tir.y - 10, 'ARRÊT !', '#FF8FA3'); fx.secouer(6); tir.pare = true; }
                        else {
                            const coin = (tir.x < but.x + 60 || tir.x > but.x + but.w - 60) && tir.y < but.y + 70;
                            buts++; if (coin) lucarnes++; filet = 1;
                            fx.texte(tir.x, tir.y - 10, coin ? 'LUCARNE !' : 'BUT !', coin ? '#FFD45C' : '#3DDC84', coin ? 36 : 30);
                            fx.eclat(tir.x, tir.y, undefined, coin ? 30 : 16);
                        }
                    }
                    if (tir.t > 1.6) tir = null;
                }
            },
            dessiner(ctx, t) {
                // tribune et parquet
                const g = ctx.createLinearGradient(0, 0, 0, but.y + but.h);
                g.addColorStop(0, '#0B1E4A'); g.addColorStop(1, '#14306E');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, but.y + but.h);
                for (let i = 0; i < 46; i++) { ctx.fillStyle = `rgba(255,255,255,${.04 + (i % 5) * .015})`; ctx.beginPath(); ctx.arc((i * 37) % W, 20 + (i * 13) % 70, 3, 0, 7); ctx.fill(); }
                parquet(ctx, but.y + but.h, H);
                // zone des 6 m
                ctx.fillStyle = 'rgba(232,163,61,.9)'; ctx.beginPath(); ctx.ellipse(W / 2, but.y + but.h, 210, 110, 0, 0, Math.PI); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W / 2, but.y + but.h, 210, 110, 0, 0, Math.PI); ctx.stroke();
                ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.ellipse(W / 2, but.y + but.h, 290, 170, 0, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
                // filet
                ctx.save(); ctx.beginPath(); ctx.rect(but.x, but.y, but.w, but.h); ctx.clip();
                ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(but.x, but.y, but.w, but.h);
                ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = 1;
                const ond = filet * 6;
                for (let x = but.x; x <= but.x + but.w; x += 14) { ctx.beginPath(); for (let y = but.y; y <= but.y + but.h; y += 6) ctx.lineTo(x + Math.sin(y * .1 + t * 20) * ond, y); ctx.stroke(); }
                for (let y = but.y; y <= but.y + but.h; y += 14) { ctx.beginPath(); for (let x = but.x; x <= but.x + but.w; x += 6) ctx.lineTo(x, y + Math.sin(x * .1 + t * 20) * ond); ctx.stroke(); }
                // zones lucarnes
                ctx.fillStyle = 'rgba(255,212,92,.10)'; ctx.fillRect(but.x, but.y, 60, 70); ctx.fillRect(but.x + but.w - 60, but.y, 60, 70);
                ctx.restore();
                // poteaux rouges et blancs
                const poteau = (x, y, w, h) => { for (let k = 0; k < (w > h ? w : h); k += 20) { ctx.fillStyle = (k / 20) % 2 ? '#fff' : '#E4002B'; if (w > h) ctx.fillRect(x + k, y, Math.min(20, w - k), h); else ctx.fillRect(x, y + k, w, Math.min(20, h - k)); } };
                poteau(but.x - 8, but.y - 8, 8, but.h + 8); poteau(but.x + but.w, but.y - 8, 8, but.h + 8); poteau(but.x - 8, but.y - 8, but.w + 16, 8);
                // gardien
                const gy = but.y + but.h - 70;
                ctx.save(); ctx.translate(gk.x, gy);
                ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 72, 40, 9, 0, 0, 7); ctx.fill();
                ctx.strokeStyle = '#2B2B2B'; ctx.lineWidth = 12; ctx.lineCap = 'round';
                const bras = Math.sin(t * 6) * 6;
                ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-42, -18 + bras); ctx.moveTo(14, 10); ctx.lineTo(42, -18 - bras); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-9, 40); ctx.lineTo(-20, 68); ctx.moveTo(9, 40); ctx.lineTo(20, 68); ctx.stroke();
                const mg = ctx.createLinearGradient(0, -10, 0, 45); mg.addColorStop(0, '#3DDC84'); mg.addColorStop(1, '#1B8F52');
                ctx.fillStyle = mg; rr(ctx, -20, -6, 40, 52, 12); ctx.fill();
                ctx.fillStyle = '#F2C9A0'; ctx.beginPath(); ctx.arc(0, -20, 13, 0, 7); ctx.fill();
                ctx.fillStyle = '#FFD45C'; ctx.beginPath(); ctx.arc(-44, -20 + bras, 8, 0, 7); ctx.arc(44, -20 - bras, 8, 0, 7); ctx.fill();
                ctx.restore();
                // viseur
                if (!tir) {
                    ctx.save(); ctx.translate(viseur.x, viseur.y);
                    ctx.strokeStyle = '#FFD45C'; ctx.lineWidth = 3; ctx.shadowColor = '#FFD45C'; ctx.shadowBlur = 12;
                    ctx.beginPath(); ctx.arc(0, 0, 16 + Math.sin(t * 10) * 2, 0, 7); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-8, 0); ctx.moveTo(26, 0); ctx.lineTo(8, 0); ctx.moveTo(0, -26); ctx.lineTo(0, -8); ctx.moveTo(0, 26); ctx.lineTo(0, 8); ctx.stroke();
                    ctx.restore();
                }
                // le tireur (de dos) et le ballon
                joueur(ctx, W / 2, H - 70, 26, couleur, '9');
                if (tir) {
                    const k = ease(Math.min(1, tir.t));
                    const x = W / 2 + (tir.x - W / 2) * k, y = (H - 100) + (tir.y - (H - 100)) * k - Math.sin(k * Math.PI) * 60;
                    if (!tir.fini || tir.t < 1.15) ballon(ctx, tir.pare && tir.t > 1 ? x + (tir.t - 1) * 200 : x, y, 16 - k * 7, tir.t * 14);
                } else if (recharge <= 0) ballon(ctx, W / 2 + 22, H - 96, 11, 0);
                // compteurs
                ctx.fillStyle = 'rgba(5,15,42,.6)'; rr(ctx, 12, H - 44, 120, 30, 15); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '700 15px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(`⚽ ${buts} / ${tirs}  ★ ${lucarnes}`, 24, H - 29);
            },
            toucher() {
                if (tir || recharge > 0) return;
                tirs++; recharge = .45; tir = { x: viseur.x, y: viseur.y, t: 0 };
            },
            score: () => clamp(Math.round(buts * 8.5 + lucarnes * 4 - Math.max(0, tirs - buts - 3) * 3), 0, 100)
        };
    }

    function jeuArrets(fx, couleur) {
        const but = { x: 30, y: 150, w: 300, h: 200 };
        const zones = [[0, 0], [1, 0], [0, 1], [1, 1]];
        let tirs = [], prochain = .8, total = 0, arrets = 0, plongeon = null;
        const centre = z => ({ x: but.x + but.w * (.25 + .5 * zones[z][0]), y: but.y + but.h * (.27 + .5 * zones[z][1]) });
        return {
            maj(dt, t) {
                prochain -= dt;
                if (prochain <= 0 && total < 11) {
                    total++;
                    tirs.push({ z: Math.floor(rnd(0, 4)), t: 0, duree: clamp(1.25 - t * .045, .6, 1.25), fini: false });
                    prochain = clamp(1.45 - t * .05, .75, 1.45);
                }
                for (const b of tirs) {
                    b.t += dt / b.duree;
                    if (b.t >= 1 && !b.fini) {
                        b.fini = true;
                        const c = centre(b.z);
                        if (plongeon && plongeon.z === b.z && plongeon.t < 1.2) {
                            arrets++; b.pare = true; fx.texte(c.x, c.y, 'ARRÊT !', '#3DDC84', 34); fx.eclat(c.x, c.y, ['#3DDC84', '#fff', '#FFD45C'], 18);
                        } else { fx.texte(c.x, c.y, 'BUT…', '#FF8FA3'); fx.secouer(7); }
                    }
                }
                tirs = tirs.filter(b => b.t < 1.5);
                if (plongeon) plongeon.t += dt * 3;
            },
            dessiner(ctx, t) {
                const g = ctx.createLinearGradient(0, 0, 0, H);
                g.addColorStop(0, '#0B1E4A'); g.addColorStop(.42, '#1A3E86'); g.addColorStop(.43, '#2B63C8'); g.addColorStop(1, '#173C8A');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // le tireur au loin
                joueur(ctx, W / 2, 96, 20, adversaireDe(couleur), '7');
                ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('le tireur', W / 2, 132);
                // le but vu de l'intérieur : 4 zones
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 5; ctx.strokeRect(but.x, but.y, but.w, but.h);
                zones.forEach((zz, i) => {
                    const x = but.x + zz[0] * but.w / 2, y = but.y + zz[1] * but.h / 2;
                    const actif = plongeon && plongeon.z === i && plongeon.t < 1.2;
                    ctx.fillStyle = actif ? 'rgba(61,220,132,.30)' : 'rgba(255,255,255,.07)';
                    rr(ctx, x + 6, y + 6, but.w / 2 - 12, but.h / 2 - 12, 14); ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.stroke();
                });
                // les ballons qui arrivent (de petits à gros)
                for (const b of tirs) {
                    const c = centre(b.z), k = ease(Math.min(1, b.t));
                    const x = W / 2 + (c.x - W / 2) * k, y = 110 + (c.y - 110) * k;
                    if (b.t < 1) {
                        ctx.strokeStyle = 'rgba(255,212,92,.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
                        ctx.beginPath(); ctx.moveTo(W / 2, 110); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
                    }
                    if (b.t < 1.2) ballon(ctx, b.pare ? x + (b.t - 1) * 300 * (c.x < W / 2 ? -1 : 1) : x, y, 6 + k * 18, b.t * 18);
                }
                // les gants du gardien
                if (plongeon) {
                    const c = centre(plongeon.z), k = Math.min(1, plongeon.t);
                    const x = W / 2 + (c.x - W / 2) * ease(k), y = H - 80 + (c.y - (H - 80)) * ease(k);
                    ctx.save(); ctx.translate(x, y); ctx.rotate((c.x < W / 2 ? -1 : 1) * .4 * k);
                    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 10;
                    for (const dx of [-20, 20]) { const gg = ctx.createLinearGradient(0, -24, 0, 24); gg.addColorStop(0, '#FFE680'); gg.addColorStop(1, '#E2A920'); ctx.fillStyle = gg; rr(ctx, dx - 16, -24, 32, 46, 14); ctx.fill(); }
                    ctx.restore();
                } else {
                    for (const dx of [-24, 24]) { ctx.fillStyle = 'rgba(255,230,128,.85)'; rr(ctx, W / 2 + dx - 14, H - 102, 28, 40, 12); ctx.fill(); }
                }
                ctx.fillStyle = 'rgba(5,15,42,.6)'; rr(ctx, 12, H - 44, 130, 30, 15); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '700 15px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(`🧤 ${arrets} / ${total}`, 24, H - 29);
            },
            toucher(x, y) {
                if (x < but.x || x > but.x + but.w || y < but.y - 30 || y > but.y + but.h + 60) return;
                const z = (x > W / 2 ? 1 : 0) + (y > but.y + but.h / 2 ? 2 : 0);
                plongeon = { z, t: 0 };
            },
            score: () => clamp(Math.round(arrets * 10.5), 0, 100)
        };
    }

    function jeuVitesse(fx, couleur) {
        let distance = 0, vitesse = 0, dernier = null, faux = 0, pas = 0, flash = { g: 0, d: 0 };
        const cible = 44;
        return {
            maj(dt) { vitesse *= Math.pow(.25, dt); distance += vitesse * dt; flash.g = Math.max(0, flash.g - dt * 5); flash.d = Math.max(0, flash.d - dt * 5); },
            dessiner(ctx, t) {
                // ciel de salle, tribunes, piste en parallaxe
                const g = ctx.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, '#0B1E4A'); g.addColorStop(1, '#1D4592');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
                for (let i = 0; i < 30; i++) { const x = ((i * 53 - distance * 8) % (W + 60) + W + 60) % (W + 60) - 30; ctx.fillStyle = `hsla(${(i * 47) % 360},70%,65%,.5)`; ctx.beginPath(); ctx.arc(x, 150 + (i % 3) * 22, 7, 0, 7); ctx.fill(); }
                parquet(ctx, 260, 400);
                ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 3;
                for (let k = 0; k < 8; k++) { const x = ((k * 70 - distance * 30) % 560 + 560) % 560 - 100; ctx.beginPath(); ctx.moveTo(x, 300); ctx.lineTo(x + 30, 300); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - 40, 360); ctx.lineTo(x - 10, 360); ctx.stroke(); }
                // le fantôme (rythme parfait)
                const fantome = cible * (t / DUREE.Vitesse);
                const fx_ = clamp(W / 2 + (fantome - distance) * 18, 20, W - 20);
                ctx.globalAlpha = .35; joueur(ctx, fx_, 300, 18, '#ffffff', '★'); ctx.globalAlpha = 1;
                // le coureur
                const saut = Math.abs(Math.sin(pas * Math.PI / 2)) * 8 * Math.min(1, vitesse / 4);
                joueur(ctx, W / 2, 332 - saut, 24, couleur, '⚡');
                // traînée
                for (let i = 1; i < 6; i++) { ctx.globalAlpha = .12 * (6 - i) / 5 * Math.min(1, vitesse / 3); ctx.fillStyle = '#fff'; ctx.fillRect(W / 2 - 24 - i * 10, 328 - saut, 8, 4); }
                ctx.globalAlpha = 1;
                // distance
                ctx.fillStyle = '#fff'; ctx.font = '900 54px "Barlow Condensed", Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`${distance.toFixed(1)} m`, W / 2, 70);
                ctx.font = '600 13px Inter, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(`objectif ${cible} m · ★ = le rythme parfait`, W / 2, 104);
                // boutons gauche / droite
                for (const [i, cle] of [[0, 'g'], [1, 'd']]) {
                    const x = 18 + i * (W / 2), w = W / 2 - 36, attendu = dernier !== cle;
                    const gg = ctx.createLinearGradient(0, 420, 0, 520);
                    gg.addColorStop(0, flash[cle] > 0 ? '#FFD45C' : attendu ? '#E4002B' : '#5A6A8A'); gg.addColorStop(1, flash[cle] > 0 ? '#E2A920' : attendu ? '#9E001E' : '#3A4660');
                    ctx.fillStyle = gg; rr(ctx, x, 424, w, 96, 22); ctx.fill();
                    ctx.fillStyle = '#fff'; ctx.font = '900 30px "Barlow Condensed", Inter, sans-serif'; ctx.fillText(i ? 'DROITE' : 'GAUCHE', x + w / 2, 472);
                }
            },
            toucher(x, y) {
                if (y < 400) return;
                const cle = x < W / 2 ? 'g' : 'd';
                flash[cle] = 1;
                if (cle === dernier) { faux++; vitesse *= .4; fx.texte(W / 2, 250, 'MÊME PIED !', '#FF8FA3', 26); fx.secouer(5); return; }
                dernier = cle; pas++;
                vitesse = Math.min(9, vitesse + 1.15);
                if (pas % 15 === 0) fx.texte(W / 2, 250, `${pas} foulées !`, '#3DDC84', 24);
            },
            score: () => clamp(Math.round(distance / cible * 100), 0, 100)
        };
    }

    function jeuDefense(fx, couleur) {
        const pos = [{ x: 60, y: 210 }, { x: 140, y: 150 }, { x: 220, y: 150 }, { x: 300, y: 210 }, { x: 180, y: 250 }];
        let arme = null, attente = .9, contres = 0, actions = 0, pertes = 0;
        return {
            maj(dt, t) {
                if (!arme) {
                    attente -= dt;
                    if (attente <= 0 && actions < 13) { actions++; arme = { i: Math.floor(rnd(0, pos.length)), t: 0, duree: clamp(1.0 - t * .03, .55, 1) }; }
                } else {
                    arme.t += dt / arme.duree;
                    if (arme.t >= 1) {
                        const p = pos[arme.i]; pertes++;
                        fx.texte(p.x, p.y - 40, 'TROP TARD !', '#FF8FA3'); fx.secouer(7);
                        arme = null; attente = rnd(.35, .7);
                    }
                }
                pos.forEach((p, i) => { p.ox = Math.sin(t * 1.7 + i) * 8; p.oy = Math.cos(t * 1.3 + i * 2) * 5; });
            },
            dessiner(ctx, t) {
                parquet(ctx, 0, H);
                // la zone et la ligne des 9 m (vue de dessus)
                ctx.fillStyle = 'rgba(232,163,61,.92)'; ctx.beginPath(); ctx.ellipse(W / 2, H + 10, 200, 170, 0, Math.PI, 0); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W / 2, H + 10, 200, 170, 0, Math.PI, 0); ctx.stroke();
                ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.ellipse(W / 2, H + 10, 270, 260, 0, Math.PI, 0); ctx.stroke(); ctx.setLineDash([]);
                // tes défenseurs sur la zone
                for (let k = 0; k < 6; k++) joueur(ctx, 60 + k * 48, H - 150 + Math.abs(k - 2.5) * 14, 14, couleur);
                // les attaquants
                pos.forEach((p, i) => {
                    const a = arme && arme.i === i;
                    joueur(ctx, p.x + p.ox, p.y + p.oy, 20, adversaireDe(couleur), i + 3, a ? { halo: '#FFD45C', haloPart: arme.t } : {});
                    if (a) {
                        ctx.save(); ctx.translate(p.x + p.ox + 18, p.y + p.oy - 22); ctx.rotate(-.5 - arme.t * .9);
                        ballon(ctx, 10, 0, 9, 0); ctx.restore();
                        ctx.fillStyle = '#FFD45C'; ctx.font = '900 16px "Barlow Condensed", Inter'; ctx.textAlign = 'center'; ctx.fillText('ARME !', p.x + p.ox, p.y + p.oy - 34);
                    }
                });
                ctx.fillStyle = 'rgba(5,15,42,.6)'; rr(ctx, 12, 14, 150, 30, 15); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '700 15px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(`🛡 ${contres} contrés · ❌ ${Math.floor(pertes)}`, 24, 29);
            },
            toucher(x, y) {
                const i = pos.findIndex(p => Math.hypot(p.x + (p.ox || 0) - x, p.y + (p.oy || 0) - y) < 38);
                if (i < 0) return;
                const p = pos[i];
                if (arme && arme.i === i) {
                    contres++; fx.texte(p.x, p.y - 40, arme.t < .5 ? 'INTERCEPTÉ !' : 'CONTRÉ !', '#3DDC84', 30); fx.eclat(p.x, p.y, ['#3DDC84', '#fff', '#2EC4F1'], 16);
                    arme = null; attente = rnd(.3, .65);
                } else { fx.texte(p.x, p.y - 40, 'PAS LUI !', '#FF8FA3', 22); pertes += .5; }
            },
            score: () => clamp(Math.round((contres - pertes * .3) / 12 * 100), 0, 100)
        };
    }

    function jeuEndurance(fx, couleur) {
        let curseur = W / 2, doigt = false, zone = W / 2, vZone = 0, dedans = 0, total = 0, coeur = 0;
        return {
            largeur: 120, ok: false,
            maj(dt, t) {
                vZone += rnd(-260, 260) * dt; vZone *= .985; vZone = clamp(vZone, -120 - t * 6, 120 + t * 6);
                zone += vZone * dt;
                const largeur = 120 - t * 4.2;
                if (zone < 30 + largeur / 2 || zone > W - 30 - largeur / 2) { vZone = -vZone; zone = clamp(zone, 30 + largeur / 2, W - 30 - largeur / 2); }
                total += dt;
                const ok = doigt && Math.abs(curseur - zone) < largeur / 2;
                if (ok) dedans += dt;
                coeur += dt * (ok ? 6 : 11);
                this.largeur = largeur; this.ok = ok;
            },
            dessiner(ctx, t) {
                const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0B1E4A'); g.addColorStop(1, '#173C8A');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                // le cœur qui bat
                const pulse = 1 + Math.max(0, Math.sin(coeur)) * .12;
                ctx.save(); ctx.translate(W / 2, 140); ctx.scale(pulse, pulse);
                ctx.fillStyle = this.ok ? '#3DDC84' : '#FF4D6D'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24;
                ctx.beginPath(); ctx.moveTo(0, 30); ctx.bezierCurveTo(-60, -10, -30, -55, 0, -25); ctx.bezierCurveTo(30, -55, 60, -10, 0, 30); ctx.fill();
                ctx.restore();
                // électrocardiogramme
                ctx.strokeStyle = this.ok ? 'rgba(61,220,132,.8)' : 'rgba(255,77,109,.8)'; ctx.lineWidth = 3; ctx.beginPath();
                for (let x = 0; x <= W; x += 4) { const ph = (x + t * 160) % 120; const y = 240 + (ph > 50 && ph < 58 ? -40 : ph > 58 && ph < 64 ? 28 : 0) + Math.sin(x * .05) * 2; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
                ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = '900 40px "Barlow Condensed", Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round(total ? dedans / total * 100 : 0)} %`, W / 2, 300);
                ctx.font = '600 13px Inter'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText("du temps dans la zone d'effort", W / 2, 330);
                // la piste
                const y = 420;
                ctx.fillStyle = 'rgba(255,255,255,.1)'; rr(ctx, 20, y - 30, W - 40, 60, 30); ctx.fill();
                const gz = ctx.createLinearGradient(zone - this.largeur / 2, 0, zone + this.largeur / 2, 0);
                gz.addColorStop(0, 'rgba(61,220,132,.25)'); gz.addColorStop(.5, 'rgba(61,220,132,.65)'); gz.addColorStop(1, 'rgba(61,220,132,.25)');
                ctx.fillStyle = gz; rr(ctx, zone - this.largeur / 2, y - 30, this.largeur, 60, 30); ctx.fill();
                ctx.strokeStyle = '#3DDC84'; ctx.lineWidth = 2; ctx.stroke();
                joueur(ctx, curseur, y - 6, 22, couleur, doigt ? '💪' : '👆');
                if (!doigt) { ctx.fillStyle = '#FFD45C'; ctx.font = '700 15px Inter'; ctx.fillText('Pose ton doigt sur la piste et suis la zone', W / 2, y + 62); }
            },
            toucher(x, y, type) {
                if (type === 'haut') { doigt = false; return; }
                if (y > 340) { doigt = true; curseur = clamp(x, 40, W - 40); }
            },
            score: () => clamp(Math.round((total ? dedans / total : 0) / .85 * 100), 0, 100)
        };
    }

    function jeuAttaque(fx, couleur) {
        const places = [{ x: 50, y: 300 }, { x: 120, y: 200 }, { x: 240, y: 200 }, { x: 310, y: 300 }, { x: 180, y: 140 }];
        let libre = -1, fenetre = 0, attente = .7, bonnes = 0, ratees = 0, passes = 0, passe = null;
        const defs = places.map(p => ({ x: p.x, y: p.y + 40 }));
        return {
            maj(dt, t) {
                if (libre < 0) {
                    attente -= dt;
                    if (attente <= 0 && passes < 12) { libre = Math.floor(rnd(0, places.length)); fenetre = clamp(1.3 - t * .05, .6, 1.3); passes++; }
                } else {
                    fenetre -= dt;
                    if (fenetre <= 0) { const p = places[libre]; fx.texte(p.x, p.y - 34, 'TROP TARD', '#FF8FA3', 22); ratees++; libre = -1; attente = rnd(.3, .6); }
                }
                defs.forEach((d, i) => {
                    const p = places[i], cx = p.x + (i === libre ? (p.x < W / 2 ? 46 : -46) : 0), cy = p.y + (i === libre ? 46 : 26);
                    d.x += (cx - d.x) * Math.min(1, dt * 9); d.y += (cy - d.y) * Math.min(1, dt * 9);
                });
                if (passe) { passe.t += dt / .32; if (passe.t >= 1) passe = null; }
            },
            dessiner(ctx, t) {
                parquet(ctx, 0, H);
                ctx.fillStyle = 'rgba(232,163,61,.92)'; ctx.beginPath(); ctx.ellipse(W / 2, -20, 200, 120, 0, 0, Math.PI); ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(W / 2, -20, 200, 120, 0, 0, Math.PI); ctx.stroke();
                ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.ellipse(W / 2, -20, 280, 190, 0, 0, Math.PI); ctx.stroke(); ctx.setLineDash([]);
                // le porteur (toi)
                const porteur = { x: W / 2, y: 430 };
                joueur(ctx, porteur.x, porteur.y, 24, couleur, 'C');
                if (!passe) ballon(ctx, porteur.x + 22, porteur.y - 18, 10, t * 3);
                // défenseurs et coéquipiers
                defs.forEach(d => joueur(ctx, d.x, d.y, 15, adversaireDe(couleur)));
                places.forEach((p, i) => {
                    const l = i === libre;
                    joueur(ctx, p.x, p.y, 20, couleur, i + 2, l ? { halo: '#3DDC84', haloPart: 1, haloAlpha: .5 + .5 * Math.sin(t * 14) } : {});
                });
                if (passe) {
                    const p = places[passe.i], k = ease(passe.t);
                    ballon(ctx, porteur.x + (p.x - porteur.x) * k, porteur.y + (p.y - porteur.y) * k - Math.sin(k * Math.PI) * 30, 10, passe.t * 10);
                }
                ctx.fillStyle = 'rgba(5,15,42,.6)'; rr(ctx, 12, H - 44, 170, 30, 15); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = '700 15px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(`🎯 ${bonnes} passes · ❌ ${ratees}`, 24, H - 29);
            },
            toucher(x, y) {
                if (passe) return;
                const i = places.findIndex(p => Math.hypot(p.x - x, p.y - y) < 40);
                if (i < 0) return;
                const p = places[i];
                passe = { i, t: 0 };
                if (i === libre) {
                    bonnes++; fx.texte(p.x, p.y - 36, fenetre > .6 ? 'CAVIAR !' : 'BONNE PASSE', '#3DDC84', 28); fx.eclat(p.x, p.y, ['#3DDC84', '#fff', '#FFD45C'], 14);
                    libre = -1; attente = rnd(.3, .6);
                } else { ratees++; fx.texte(p.x, p.y - 36, 'INTERCEPTÉ', '#FF8FA3', 24); fx.secouer(6); }
            },
            score: () => clamp(Math.round((bonnes - ratees * .4) / 11 * 100), 0, 100)
        };
    }

    const JEUX = { Tir: jeuTir, Arrets: jeuArrets, Vitesse: jeuVitesse, Defense: jeuDefense, Endurance: jeuEndurance, Attaque: jeuAttaque };

    // =====================================================================================
    //  La scène : plein écran, compte à rebours, chrono, fin
    // =====================================================================================
    function jouer(exercice, nom, couleur) {
        couleur = /^#[0-9a-f]{6}$/i.test(couleur || '') ? couleur : '#1B4DB1';
        const fabrique = JEUX[exercice] || jeuTir;
        const [icone, titre, consigne] = TITRES[exercice] || TITRES.Tir;
        const duree = DUREE[exercice] || 15;
        return new Promise(resoudre => {
            const fond = document.createElement('div');
            fond.className = 'mj-fond';
            fond.innerHTML = `
                <div class="mj-cadre">
                    <div class="mj-tete"><span class="mj-ico">${icone}</span><div class="mj-titres"><b>${titre}</b><small>${nom}</small></div>
                        <button class="mj-fermer" aria-label="Fermer">✕</button></div>
                    <div class="mj-chrono"><span></span></div>
                    <div class="mj-scene"><canvas></canvas>
                        <div class="mj-intro"><div class="mj-consigne">${consigne}</div><div class="mj-decompte">3</div></div>
                        <div class="mj-fin" style="display:none"></div></div>
                </div>`;
            document.body.appendChild(fond);
            document.body.classList.add('mj-ouvert');
            const canvas = fond.querySelector('canvas'), ctx = canvas.getContext('2d');
            const chrono = fond.querySelector('.mj-chrono span'), intro = fond.querySelector('.mj-intro'), decompte = fond.querySelector('.mj-decompte');
            const finEl = fond.querySelector('.mj-fin');
            const fx = effets();
            const jeu = fabrique(fx, couleur);
            let etat = 'intro', t = 0, avant = performance.now(), echelle = 1, fini = false, raf = 0;

            function taille() {
                const scene = fond.querySelector('.mj-scene');
                const dispoW = scene.clientWidth, dispoH = scene.clientHeight;
                echelle = Math.min(dispoW / W, dispoH / H);
                const dpr = Math.min(2.5, window.devicePixelRatio || 1);
                canvas.style.width = `${W * echelle}px`; canvas.style.height = `${H * echelle}px`;
                canvas.width = Math.round(W * echelle * dpr); canvas.height = Math.round(H * echelle * dpr);
                ctx.setTransform(echelle * dpr, 0, 0, echelle * dpr, 0, 0);
            }
            taille();
            window.addEventListener('resize', taille);

            function point(e) {
                const r = canvas.getBoundingClientRect();
                return [(e.clientX - r.left) / echelle, (e.clientY - r.top) / echelle];
            }
            canvas.addEventListener('pointerdown', e => { e.preventDefault(); if (etat !== 'jeu') return; const [x, y] = point(e); jeu.toucher(x, y, 'bas'); try { navigator.vibrate && navigator.vibrate(8); } catch (_) { } });
            canvas.addEventListener('pointermove', e => { if (etat === 'jeu' && e.buttons) { const [x, y] = point(e); jeu.toucher(x, y, 'glisse'); } });
            const lacher = () => { if (etat === 'jeu') jeu.toucher(0, 0, 'haut'); };
            canvas.addEventListener('pointerup', lacher); canvas.addEventListener('pointercancel', lacher); canvas.addEventListener('pointerleave', lacher);

            function terminer(score) {
                if (fini) return;
                fini = true; cancelAnimationFrame(raf);
                window.removeEventListener('resize', taille);
                fond.remove(); document.body.classList.remove('mj-ouvert');
                resoudre(score);
            }
            fond.querySelector('.mj-fermer').onclick = () => terminer(etat === 'fin' ? jeu.score() : -1);

            // compte à rebours
            let n = 3;
            const tic = setInterval(() => {
                n--;
                if (n > 0) { decompte.textContent = n; decompte.classList.remove('pop'); void decompte.offsetWidth; decompte.classList.add('pop'); }
                else if (n === 0) { decompte.textContent = 'GO !'; decompte.classList.remove('pop'); void decompte.offsetWidth; decompte.classList.add('pop'); }
                else { clearInterval(tic); intro.style.display = "none"; etat = 'jeu'; t = 0; avant = performance.now(); }
            }, 700);
            decompte.classList.add('pop');

            function boucle(maintenant) {
                const dt = Math.min(.05, (maintenant - avant) / 1000); avant = maintenant;
                if (etat === 'jeu') {
                    t += dt; jeu.maj(dt, t);
                    chrono.style.width = `${clamp(100 - t / duree * 100, 0, 100)}%`;
                    chrono.classList.toggle('urgent', duree - t < 3);
                    if (t >= duree) montrerFin();
                }
                const [dx, dy] = fx.decalage();
                ctx.save(); ctx.clearRect(-20, -20, W + 40, H + 40); ctx.translate(dx, dy);
                jeu.dessiner(ctx, t);
                fx.dessiner(ctx, dt);
                ctx.restore();
                // vignette
                const v = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .75);
                v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.35)');
                ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
                raf = requestAnimationFrame(boucle);
            }
            raf = requestAnimationFrame(boucle);

            function montrerFin() {
                etat = 'fin';
                const s = jeu.score();
                const [verdict, mult, coul] = s >= 90 ? ['PARFAIT !', '×2', '#FFD45C'] : s >= 70 ? ['TRÈS BIEN', '×1,5', '#3DDC84'] : s >= 40 ? ['CORRECT', '×1', '#2EC4F1'] : ['RATÉ…', '×0,5', '#FF8FA3'];
                const etoiles = s >= 90 ? 3 : s >= 70 ? 2 : s >= 40 ? 1 : 0;
                finEl.innerHTML = `
                    <div class="mj-carte-fin" style="--c:${coul}">
                        <div class="mj-etoiles">${[0, 1, 2].map(i => `<span class="${i < etoiles ? 'on' : ''}" style="animation-delay:${.15 + i * .18}s">★</span>`).join('')}</div>
                        <div class="mj-verdict">${verdict}</div>
                        <div class="mj-score"><b>${s}</b><small>/100</small></div>
                        <div class="mj-mult">Gain de la séance <b>${mult}</b></div>
                        <button class="mj-continuer">CONTINUER ▶</button>
                    </div>`;
                finEl.style.display = "flex";
                if (s >= 70) fx.eclat(W / 2, H / 3, undefined, 50);
                try { navigator.vibrate && navigator.vibrate(s >= 70 ? [40, 50, 40] : [80]); } catch (_) { }
                finEl.querySelector('.mj-continuer').onclick = () => terminer(s);
            }
        });
    }

    return { jouer };
})();
