// L'ANIMATION DU TIR D'UN MOMENT CLÉ (Pages/Match.razor) : les cartes du tireur et du gardien s'affrontent,
// le tir part en comète vers le but, et l'issue (but, arrêt, à côté) claque en grand.
// hbmMoment.jouer(toile, cfg) renvoie une promesse tenue à la fin de l'animation (ou au premier toucher).
// cfg : { entete, tireur: carte, gardien: carte|null, issue: 'but'|'arret'|'rate', geste: 'Lucarne'|'RasDuSol'|'Roucoulette'|'Lob'|null,
//         titre, sous, positif, buzzer, ralenti }   carte : { prenom, nom, poste, note, rarete, etoiles, stat, valeur }
(() => {
    const AFF = '"Barlow Condensed", "Arial Narrow", sans-serif';
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, k) => a + (b - a) * k;
    const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
    const out3 = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);

    const RARETE = {
        bronze: { a: '#F2C79B', b: '#B87742', c: '#6B3E1C', texte: '#2E1606', liseré: 'rgba(255,255,255,.7)' },
        argent: { a: '#F4F7FC', b: '#B9C3D3', c: '#6E7A8E', texte: '#1B2333', liseré: 'rgba(255,255,255,.8)' },
        or: { a: '#FFE8A3', b: '#D9A521', c: '#8A5F07', texte: '#3A2600', liseré: 'rgba(255,255,255,.8)' },
        elite: { a: '#29458F', b: '#0F2259', c: '#060F2E', texte: '#FFE08A', liseré: '#F2C94C' },
        legende: { a: '#E9B8FF', b: '#8E3BC9', c: '#3D0E66', texte: '#FFF2FF', liseré: '#F5D0FF' }
    };

    let encours = null;

    function jouer(toile, cfg) {
        if (encours) encours.fin();
        return new Promise(resolve => {
            const ctx = toile.getContext('2d');
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const r = toile.getBoundingClientRect();
            toile.width = Math.round(r.width * dpr); toile.height = Math.round(r.height * dpr);
            const W = toile.width, H = toile.height, u = Math.min(W / 720, H / 1200);   // u : l'unité (maquette 720 × 1200)
            const st = { t0: performance.now(), particules: [], anneaux: [], traine: [], impact: false, fini: false, raf: 0 };
            const reduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const ralenti = cfg.ralenti !== false && !reduit;

            // le but, au tiers haut
            const gw = W * .74, gh = gw * 2 / 3, gx = (W - gw) / 2, gy = H * .19;
            // où va le ballon, selon le geste et l'issue
            const cote = Math.random() < .5 ? -1 : 1;
            const X = f => W / 2 + cote * (f - .5) * gw;   // f : 0 = poteau de gauche, 1 = droite (miroir au hasard)
            let cible, arc = 0, rebond = false, poteau = false;
            switch (cfg.geste) {
                case 'Lucarne': cible = [X(.1), gy + gh * .13]; break;
                case 'RasDuSol': cible = [X(.12), gy + gh * .86]; break;
                case 'Roucoulette': cible = [X(.32), gy + gh * .8]; rebond = true; break;
                case 'Lob': cible = [X(.48), gy + gh * .22]; arc = 300 * u; break;
                default: cible = Math.random() < .5 ? [X(.12), gy + gh * .16] : [X(.14), gy + gh * .84];
            }
            if (cfg.issue === 'rate') {
                poteau = !!cfg.poteau;
                cible = poteau ? [X(-.005), gy + gh * (.25 + Math.random() * .5)] : [X(-.12), gy + gh * (.2 + Math.random() * .6)];
            }

            const TIR = 1.75, VOL = arc ? .7 : rebond ? .5 : .3, IMPACT = TIR + VOL, FIN = IMPACT + 1.45;

            function fin() {
                if (st.fini) return;
                st.fini = true; cancelAnimationFrame(st.raf);
                toile.removeEventListener('pointerdown', fin);
                encours = null;
                resolve();
            }
            toile.addEventListener('pointerdown', fin);
            encours = { fin };

            // ----- dessin -----
            function fond(t, flash) {
                const g = ctx.createRadialGradient(W / 2, H * .38, 40 * u, W / 2, H * .45, H * .8);
                g.addColorStop(0, '#163E95'); g.addColorStop(.45, '#0A2358'); g.addColorStop(1, '#030918');
                ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (let i = 0; i < 4; i++) {
                    const a = Math.sin(t * .6 + i * 1.7) * .35 + (i - 1.5) * .28;
                    ctx.save(); ctx.translate(W / 2 + (i - 1.5) * 160 * u, -40 * u); ctx.rotate(a);
                    const fg = ctx.createLinearGradient(0, 0, 0, H * .9);
                    fg.addColorStop(0, `rgba(160,190,255,${.15 + flash * .2})`); fg.addColorStop(1, 'rgba(160,190,255,0)');
                    ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(-14 * u, 0); ctx.lineTo(14 * u, 0); ctx.lineTo(120 * u, H * .9); ctx.lineTo(-120 * u, H * .9); ctx.closePath(); ctx.fill();
                    ctx.restore();
                }
                ctx.restore();
                ctx.fillStyle = 'rgba(228,0,43,.15)';
                ctx.beginPath(); ctx.moveTo(W * .62, H); ctx.lineTo(W * .82, H); ctx.lineTo(W * 1.2, H * .45); ctx.lineTo(W, H * .45); ctx.closePath(); ctx.fill();
            }
            function but(appar, bosse, lueur) {
                if (appar <= 0) return;
                ctx.save(); ctx.globalAlpha = appar;
                const p = 26 * u, fx = gx + p, fy = gy + p * .6, fw = gw - 2 * p, fh = gh - p;
                const def = (x, y) => {
                    if (!bosse || bosse.force <= 0) return [x, y];
                    const d = Math.hypot(x - bosse.x, y - bosse.y), f = Math.max(0, 1 - d / (170 * u)) * bosse.force;
                    return [x + (x - bosse.x) * f * .3, y + (y - bosse.y) * f * .3];
                };
                ctx.strokeStyle = `rgba(190,215,255,${.22 + lueur * .5})`; ctx.lineWidth = 1.5 * u;
                for (let i = 0; i <= 16; i++) { const x = fx + fw * i / 16; ctx.beginPath(); for (let j = 0; j <= 20; j++) { const [a, b] = def(x, fy + fh * j / 20); j ? ctx.lineTo(a, b) : ctx.moveTo(a, b); } ctx.stroke(); }
                for (let j = 0; j <= 11; j++) { const y = fy + fh * j / 11; ctx.beginPath(); for (let i = 0; i <= 24; i++) { const [a, b] = def(fx + fw * i / 24, y); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); } ctx.stroke(); }
                ctx.strokeStyle = 'rgba(190,215,255,.18)';
                for (const [ax, ay, bx, by] of [[gx, gy, fx, fy], [gx + gw, gy, fx + fw, fy], [gx, gy + gh, fx, fy + fh], [gx + gw, gy + gh, fx + fw, fy + fh]]) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
                ctx.shadowColor = '#FF2B4E'; ctx.shadowBlur = (24 + lueur * 30) * u;
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 9 * u; ctx.lineJoin = 'round';
                ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
                ctx.shadowBlur = 0;
                ctx.strokeStyle = '#E4002B'; ctx.setLineDash([22 * u, 22 * u]);
                ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx, gy); ctx.lineTo(gx + gw, gy); ctx.lineTo(gx + gw, gy + gh); ctx.stroke(); ctx.setLineDash([]);
                ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 3 * u;
                ctx.beginPath(); ctx.moveTo(0, gy + gh); ctx.lineTo(W, gy + gh); ctx.stroke();
                ctx.strokeStyle = 'rgba(232,145,58,.7)'; ctx.lineWidth = 4 * u;
                ctx.beginPath(); ctx.ellipse(W / 2, gy + gh, W * .62, H * .16, 0, 0, Math.PI); ctx.stroke();
                ctx.restore();
            }
            function forme(w, h) {
                const c = w * .16;
                ctx.beginPath();
                ctx.moveTo(-w / 2 + c, -h / 2); ctx.lineTo(w / 2 - c, -h / 2); ctx.lineTo(w / 2, -h / 2 + c * .8);
                ctx.lineTo(w / 2, h / 2 - h * .16); ctx.lineTo(0, h / 2); ctx.lineTo(-w / 2, h / 2 - h * .16);
                ctx.lineTo(-w / 2, -h / 2 + c * .8); ctx.closePath();
            }
            function carte(j, x, y, w, rot, o = {}) {
                if (!j) return;
                w *= u;
                const h = w * 1.42, rr = RARETE[j.rarete] || RARETE.argent;
                ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.globalAlpha = o.alpha ?? 1;
                if (o.halo) { ctx.shadowColor = o.halo; ctx.shadowBlur = 50 * u; }
                forme(w, h);
                const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
                g.addColorStop(0, rr.a); g.addColorStop(.45, rr.b); g.addColorStop(1, rr.c);
                ctx.fillStyle = g; ctx.fill(); ctx.shadowBlur = 0;
                if (o.reflet != null) {
                    ctx.save(); forme(w, h); ctx.clip();
                    const rx = lerp(-w * 1.2, w * 1.2, o.reflet), rg = ctx.createLinearGradient(rx - 60 * u, 0, rx + 60 * u, 0);
                    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(.5, 'rgba(255,255,255,.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = rg; ctx.rotate(-.35); ctx.fillRect(-w * 1.5, -h, w * 3, h * 2); ctx.restore();
                }
                const pw = w * .8, ph = h * .5, py = -h / 2 + h * .08;
                ctx.save(); ctx.beginPath(); ctx.roundRect(-pw / 2, py, pw, ph, w * .04); ctx.clip();
                const pg = ctx.createRadialGradient(0, py + ph * .4, 5, 0, py + ph * .5, pw * .8);
                pg.addColorStop(0, '#8E1F35'); pg.addColorStop(1, '#3A0A16'); ctx.fillStyle = pg; ctx.fillRect(-pw / 2, py, pw, ph);
                ctx.fillStyle = 'rgba(255,255,255,.82)';
                ctx.beginPath(); ctx.arc(0, py + ph * .4, pw * .17, 0, 7); ctx.fill();
                ctx.beginPath(); ctx.ellipse(0, py + ph * 1.02, pw * .36, ph * .42, 0, Math.PI, 0); ctx.fill();
                ctx.restore();
                ctx.fillStyle = '#E4002B'; ctx.save(); ctx.translate(-pw / 2 + w * .02, py + w * .03); ctx.transform(1, 0, -.18, 1, 0, 0); ctx.fillRect(0, 0, w * .26, w * .14); ctx.restore();
                ctx.fillStyle = '#fff'; ctx.font = `800 ${w * .11}px ${AFF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(j.poste, -pw / 2 + w * .14, py + w * .1);
                if (j.etoiles) { ctx.fillStyle = '#FFD45C'; ctx.font = `${w * .1}px sans-serif`; ctx.textAlign = 'right'; ctx.fillText('★'.repeat(j.etoiles), pw / 2 - w * .03, py + w * .1); }
                ctx.textAlign = 'center'; ctx.fillStyle = rr.texte;
                ctx.font = `700 ${w * .075}px ${AFF}`; ctx.fillText(j.prenom, 0, py + ph + h * .06);
                ctx.font = `900 ${w * .14}px ${AFF}`;
                const ln = ctx.measureText(j.nom).width, m = Math.min(1, w * .9 / ln);
                ctx.save(); ctx.translate(0, py + ph + h * .14); ctx.scale(m, 1); ctx.fillText(j.nom, 0, 0); ctx.restore();
                ctx.fillStyle = '#0A1A40'; ctx.beginPath(); ctx.moveTo(-w * .2, h / 2 - h * .2); ctx.lineTo(w * .2, h / 2 - h * .2); ctx.lineTo(w * .2, h / 2 - h * .1); ctx.lineTo(0, h / 2 - h * .045); ctx.lineTo(-w * .2, h / 2 - h * .1); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#FFD45C'; ctx.font = `900 ${w * .17}px ${AFF}`; ctx.fillText(j.note, 0, h / 2 - h * .13);
                forme(w, h); ctx.strokeStyle = rr.liseré; ctx.lineWidth = w * .018; ctx.stroke();
                if (o.flash) { forme(w, h); ctx.fillStyle = `rgba(255,255,255,${o.flash})`; ctx.fill(); }
                ctx.restore();
            }
            function stat(j, x, y, k, couleur) {
                if (!j || k <= 0) return;
                ctx.save(); ctx.globalAlpha = k; ctx.translate(x, y + (1 - k) * 20 * u); ctx.scale(u, u);
                ctx.fillStyle = 'rgba(4,11,34,.85)'; ctx.beginPath(); ctx.roundRect(-84, -26, 168, 52, 8); ctx.fill();
                ctx.strokeStyle = couleur; ctx.lineWidth = 2; ctx.stroke();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#A9B8DD'; ctx.font = `800 20px ${AFF}`; ctx.fillText(j.stat, -30, 1);
                ctx.fillStyle = couleur; ctx.font = `900 34px ${AFF}`; ctx.fillText(j.valeur, 42, 1);
                ctx.restore();
            }
            function eclats(x, y, n, couleurs, v) {
                for (let i = 0; i < n; i++) {
                    const a = Math.random() * Math.PI * 2, s = v * u * (.3 + Math.random());
                    st.particules.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vie: 1, c: couleurs[i % couleurs.length], r: (3 + Math.random() * 6) * u, rot: Math.random() * 6 });
                }
            }
            function effets(dt) {
                for (const p of st.particules) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 1.6; p.vy = p.vy * (1 - dt * 1.6) + 500 * u * dt; p.vie -= dt * .75; p.rot += dt * 8; }
                st.particules = st.particules.filter(p => p.vie > 0);
                ctx.save(); ctx.globalCompositeOperation = 'lighter';
                for (const p of st.particules) { ctx.globalAlpha = clamp(p.vie, 0, 1); ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.r / 2, -p.r, p.r, p.r * 2); ctx.restore(); }
                for (const a of st.anneaux) {
                    a.t += dt; const k = a.t / a.duree;
                    ctx.globalAlpha = clamp(1 - k, 0, 1); ctx.strokeStyle = a.c; ctx.lineWidth = (8 * (1 - k) + 1) * u;
                    ctx.beginPath(); ctx.arc(a.x, a.y, a.r * u * out3(k), 0, 7); ctx.stroke();
                }
                st.anneaux = st.anneaux.filter(a => a.t < a.duree);
                ctx.restore();
            }
            function comete(couleur) {
                const pts = st.traine;
                if (pts.length < 2) return;
                ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
                for (let i = 1; i < pts.length; i++) {
                    const k = i / pts.length;
                    ctx.strokeStyle = couleur; ctx.globalAlpha = k * .9; ctx.lineWidth = 26 * u * k;
                    ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
                }
                const [x, y] = pts[pts.length - 1], R = 62 * u;
                const g = ctx.createRadialGradient(x, y, 0, x, y, R);
                g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, couleur); g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
                ctx.restore();
            }
            function viseur(x, y, k, t) {
                if (k <= 0) return;
                ctx.save(); ctx.translate(x, y); ctx.rotate(t * 2); ctx.globalAlpha = k * (.6 + .4 * Math.sin(t * 22));
                ctx.strokeStyle = '#FFD45C'; ctx.lineWidth = 4 * u;
                const rr = (34 + (1 - k) * 40) * u;
                for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, rr, i * Math.PI / 2 + .2, i * Math.PI / 2 + 1.2); ctx.stroke(); }
                ctx.beginPath(); ctx.arc(0, 0, 6 * u, 0, 7); ctx.fillStyle = '#FFD45C'; ctx.fill();
                ctx.restore();
            }
            function bandeau(k) {
                ctx.save(); ctx.translate(0, lerp(-90 * u, 0, out3(k))); ctx.scale(u, u);
                ctx.fillStyle = '#E4002B'; ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(300, 26); ctx.lineTo(276, 80); ctx.lineTo(0, 80); ctx.closePath(); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = `900 italic 34px ${AFF}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('MOMENT CLÉ', 26, 54);
                ctx.fillStyle = '#FFD45C'; ctx.font = `800 26px ${AFF}`; ctx.textAlign = 'right'; ctx.fillText(cfg.entete || '', W / u - 26, 54);
                ctx.restore();
            }
            function titre(k) {
                if (k <= 0) return;
                const coul = cfg.positif ? (cfg.issue === 'but' ? '#FFD45C' : '#3DDC84') : '#FF5A78';
                const e = k < .22 ? lerp(3, .94, out3(k / .22)) : k < .32 ? lerp(.94, 1, (k - .22) / .1) : 1;
                ctx.save(); ctx.translate(W / 2, H * .66); ctx.rotate(-.07);
                ctx.font = `900 italic ${150 * u}px ${AFF}`;
                const l = ctx.measureText(cfg.titre).width, m = Math.min(1, (W - 60 * u) / (l + 40 * u));
                ctx.scale(e * m, e * m);
                ctx.save(); ctx.transform(1, 0, -.28, 1, 0, 0);
                ctx.fillStyle = cfg.positif ? '#E4002B' : '#2B0A14'; ctx.fillRect(-l / 2 - 40 * u, -78 * u, (l + 80 * u) * Math.min(1, k * 4), 156 * u);
                ctx.restore();
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.lineWidth = 14 * u; ctx.strokeStyle = '#040B22'; ctx.strokeText(cfg.titre, 6 * u, 8 * u);
                ctx.fillStyle = coul; ctx.fillText(cfg.titre, 0, 0);
                ctx.restore();
                const k2 = seg(k, .3, .6);
                if (k2 > 0 && cfg.sous) {
                    ctx.save(); ctx.globalAlpha = k2; ctx.fillStyle = '#fff'; ctx.font = `800 ${34 * u}px ${AFF}`; ctx.textAlign = 'center';
                    ctx.fillText(cfg.sous, W / 2, H * .66 + 128 * u - (1 - k2) * 20 * u); ctx.restore();
                }
            }

            // ----- la chorégraphie -----
            let dernier = performance.now(), t = 0;
            function image(n) {
                if (st.fini) return;
                const dtReel = Math.min(.05, (n - dernier) / 1000); dernier = n;
                const lent = ralenti && t > TIR - .25 && t < IMPACT + .1;
                const dt = lent ? dtReel * .4 : dtReel;
                t += dt;
                if (t >= FIN) { fin(); return; }
                const c = cible;
                let secousse = 0, flash = 0;
                if (t > IMPACT && t < IMPACT + .4) { secousse = (1 - (t - IMPACT) / .4) * 22 * u; flash = 1 - (t - IMPACT) / .4; }
                ctx.save();
                if (secousse) ctx.translate((Math.random() - .5) * secousse, (Math.random() - .5) * secousse);
                fond(t, flash);

                const entree = out3(seg(t, .05, .5)), place = out3(seg(t, 1.0, 1.4));
                const duelK = seg(t, .35, .7) * (1 - seg(t, .95, 1.1));
                const marque = cfg.issue === 'but';
                but(seg(t, .9, 1.35), marque && t > IMPACT ? { x: c[0], y: c[1], force: Math.sin(Math.min((t - IMPACT) * 8, Math.PI)) * (1 - seg(t, IMPACT, IMPACT + 1.4)) } : null,
                    marque ? seg(t, IMPACT, IMPACT + .1) * (1 - seg(t, IMPACT + .2, IMPACT + 1.5)) : 0);

                // le gardien
                let gX = lerp(W + 200 * u, W * .7, entree), gY = H * .42, gW = 250, gR = .08, flashG = 0;
                gX = lerp(gX, W / 2, place); gY = lerp(gY, gy + gh * .55, place); gW = lerp(gW, 190, place); gR = lerp(gR, 0, place);
                const plonge = out3(seg(t, TIR - .05, IMPACT + .05));
                if (cfg.issue === 'arret') {
                    gX = lerp(gX, c[0] + (c[0] < W / 2 ? 40 : -40) * u, plonge); gY = lerp(gY, c[1] + 70 * u, plonge); gR = lerp(0, c[0] < W / 2 ? -1.1 : 1.1, plonge);
                    if (t > IMPACT) flashG = Math.max(0, 1 - (t - IMPACT) * 3);
                } else if (cfg.geste === 'Lob') {
                    const sortie = out3(seg(t, 1.35, 1.7)); gY = lerp(gY, gy + gh * .95, sortie); gW = lerp(gW, 215, sortie); gR = lerp(0, -.15, sortie);
                } else {
                    // il part du mauvais côté
                    const vers = c[0] < W / 2 ? gx + gw * .78 : gx + gw * .22;
                    gX = lerp(gX, vers, plonge); gR = lerp(0, c[0] < W / 2 ? .7 : -.7, plonge);
                }
                carte(cfg.gardien, gX, gY, gW, gR, { reflet: seg(t, .3, .9), flash: flashG, halo: flashG ? '#3DDC84' : null });

                // le tireur
                let tX = lerp(-200 * u, W * .3, entree), tY = H * .42, tW = 250, tR = -.08;
                tX = lerp(tX, W * .3, place); tY = lerp(tY, H * .84, place); tW = lerp(tW, 220, place); tR = lerp(tR, -.12, place);
                const elan = seg(t, TIR - .35, TIR);
                tY -= Math.sin(elan * Math.PI) * 40 * u; tR += elan * .1 - seg(t, TIR, TIR + .2) * .1;
                carte(cfg.tireur, tX, tY + seg(t, IMPACT, IMPACT + .4) * 60 * u, tW, tR, { alpha: 1 - .75 * seg(t, IMPACT, IMPACT + .35), reflet: seg(t, .25, .85), halo: t > TIR - .4 && t < TIR + .2 ? 'rgba(255,212,92,.9)' : null });

                // le duel des caractéristiques
                stat(cfg.tireur, W * .3, H * .42 + 220 * u, duelK, '#FFD45C');
                stat(cfg.gardien, W * .7, H * .42 + 220 * u, duelK, '#3DDC84');
                if (duelK > 0) {
                    ctx.save(); ctx.globalAlpha = duelK; ctx.translate(W / 2, H * .42); ctx.rotate(-.12);
                    const sc = lerp(2, 1, duelK) * u; ctx.scale(sc, sc);
                    ctx.font = `900 italic 110px ${AFF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.lineWidth = 10; ctx.strokeStyle = '#040B22'; ctx.strokeText('VS', 0, 0);
                    ctx.fillStyle = '#fff'; ctx.shadowColor = '#E4002B'; ctx.shadowBlur = 30; ctx.fillText('VS', 0, 0);
                    ctx.restore();
                }
                viseur(c[0], c[1], seg(t, 1.3, 1.5) * (1 - seg(t, TIR, TIR + .1)), t);

                // le chrono géant (dernière seconde)
                if (cfg.buzzer && t > .9) {
                    const reste = Math.max(0, 3 - Math.floor(seg(t, .9, IMPACT) * 3.999));
                    ctx.save(); ctx.globalAlpha = .9 * (1 - seg(t, IMPACT + .5, IMPACT + .9));
                    ctx.font = `900 ${260 * u}px ${AFF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = reste === 0 ? '#E4002B' : 'rgba(255,255,255,.14)'; ctx.fillText(`0:0${reste}`, W / 2, H * .63);
                    ctx.restore();
                }

                // la comète du tir
                if (t >= TIR) {
                    const k = seg(t, TIR, IMPACT), dep = [tX + 70 * u, tY - 150 * u];
                    let x = lerp(dep[0], c[0], k), y = lerp(dep[1], c[1], k);
                    if (arc) y -= Math.sin(k * Math.PI) * arc;
                    if (rebond) { const sol = gy + gh + 40 * u, kk = k < .6 ? k / .6 : (k - .6) / .4; y = k < .6 ? lerp(dep[1], sol, kk) : lerp(sol, c[1], kk) - Math.sin(kk * Math.PI) * 40 * u; x = k < .6 ? lerp(dep[0], lerp(dep[0], c[0], .7), kk) : lerp(lerp(dep[0], c[0], .7), c[0], kk); }
                    if (t > IMPACT) {
                        const d = t - IMPACT, sens = c[0] < W / 2 ? -1 : 1;
                        if (cfg.issue === 'arret') { x = c[0] - sens * d * 700 * u; y = c[1] - d * 900 * u + 1400 * u * d * d; }
                        else if (poteau) { x = c[0] + sens * Math.min(d, .3) * 700 * u; y = c[1] + Math.min(d, .3) * 260 * u; }
                        else if (cfg.issue === 'rate') { x = c[0] + sens * d * 300 * u; y = c[1] - d * 120 * u; }
                    }
                    st.traine.push([x, y]); if (st.traine.length > 18) st.traine.shift();
                    comete(cfg.issue === 'arret' ? '#9EF5C5' : '#FFD45C');
                }
                if (t > IMPACT && !st.impact) {
                    st.impact = true;
                    const couleurs = cfg.issue === 'but' ? ['#FFD45C', '#FFF4DA', '#E4002B'] : cfg.issue === 'arret' ? ['#fff', '#3DDC84', '#9EF5C5'] : ['#fff', '#C9D4EE', '#FFD45C'];
                    eclats(c[0], c[1], cfg.issue === 'rate' && !poteau ? 18 : 70, couleurs, 900);
                    st.anneaux.push({ x: c[0], y: c[1], r: 260, t: 0, duree: .7, c: couleurs[0] }, { x: c[0], y: c[1], r: 160, t: 0, duree: .5, c: '#fff' });
                    try { navigator.vibrate && navigator.vibrate(cfg.issue === 'but' ? [40, 30, 80] : 40); } catch { }
                }
                if (flash > 0 && !(cfg.issue === 'rate' && !poteau)) {
                    const g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], 420 * u);
                    g.addColorStop(0, `rgba(255,255,255,${.85 * flash})`); g.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
                }
                effets(dt);
                ctx.restore();
                if (ralenti) {
                    const cine = seg(t, TIR - .5, TIR - .25) * (1 - seg(t, IMPACT + .3, IMPACT + .6));
                    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, 70 * u * cine); ctx.fillRect(0, H - 70 * u * cine, W, 70 * u * cine);
                }
                bandeau(seg(t, 0, .35));
                titre(seg(t, IMPACT + .05, IMPACT + 1.2));
                // « toucher pour passer »
                ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `700 ${22 * u}px ${AFF}`; ctx.textAlign = 'center';
                ctx.fillText('TOUCHE POUR PASSER', W / 2, H - 24 * u);
                st.raf = requestAnimationFrame(image);
            }
            st.raf = requestAnimationFrame(image);
        });
    }

    window.hbmMoment = { jouer, passer: () => encours && encours.fin() };
})();
