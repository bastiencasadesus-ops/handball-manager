// Petits services du navigateur pour Handball Manager : sauvegarde locale et sons de match.
window.hbm = (function () {
    let audio = null, volume = 0.8, maitre = null;

    function contexte() {
        if (!audio) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (!C) return null;
            audio = new C();
        }
        if (audio.state === "suspended") audio.resume();
        if (!maitre) { maitre = audio.createGain(); maitre.connect(audio.destination); }
        maitre.gain.value = volume;
        return audio;
    }

    // Sifflet d'arbitre : son aigu avec un léger roulement
    function sifflet(duree) {
        const a = contexte(); if (!a) return;
        const t = a.currentTime;
        const osc = a.createOscillator(), vib = a.createOscillator(), vibGain = a.createGain(), gain = a.createGain();
        osc.type = "sine"; osc.frequency.value = 2950;
        vib.frequency.value = 32; vibGain.gain.value = 140;
        vib.connect(vibGain); vibGain.connect(osc.frequency);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
        gain.gain.setValueAtTime(0.18, t + duree - 0.06);
        gain.gain.linearRampToValueAtTime(0, t + duree);
        osc.connect(gain); gain.connect(maitre);
        osc.start(t); vib.start(t); osc.stop(t + duree); vib.stop(t + duree);
    }

    // Bruit de foule : bruit filtré qui monte puis retombe
    function foule(duree, volume, montee) {
        const a = contexte(); if (!a) return;
        const t = a.currentTime, n = Math.floor(a.sampleRate * duree);
        const tampon = a.createBuffer(1, n, a.sampleRate), d = tampon.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const source = a.createBufferSource(); source.buffer = tampon;
        const filtre = a.createBiquadFilter(); filtre.type = "lowpass"; filtre.frequency.value = 900;
        const gain = a.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + montee);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duree);
        source.connect(filtre); filtre.connect(gain); gain.connect(maitre);
        source.start(t);
    }

    // But : corne de stade à deux notes puis clameur
    function corne() {
        const a = contexte(); if (!a) return;
        const t = a.currentTime;
        [233, 294, 466].forEach((f, i) => {
            const osc = a.createOscillator(), gain = a.createGain();
            osc.type = "sawtooth"; osc.frequency.value = f;
            const v = i === 2 ? 0.03 : 0.07;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(v, t + 0.03);
            gain.gain.setValueAtTime(v, t + 0.6);
            gain.gain.linearRampToValueAtTime(0, t + 0.75);
            osc.connect(gain); gain.connect(maitre);
            osc.start(t); osc.stop(t + 0.8);
        });
        foule(1.8, 0.35, 0.25);
    }

    // Interface : un « tic » bref au toucher d'une carte, un « clac » à deux notes au clic
    function note(f1, f2, duree, v) {
        const a = contexte(); if (!a) return;
        const t = a.currentTime, osc = a.createOscillator(), gain = a.createGain();
        osc.type = "sine"; osc.frequency.setValueAtTime(f1, t); osc.frequency.linearRampToValueAtTime(f2, t + duree);
        gain.gain.setValueAtTime(v, t); gain.gain.exponentialRampToValueAtTime(0.001, t + duree);
        osc.connect(gain); gain.connect(maitre); osc.start(t); osc.stop(t + duree);
    }

    return {
        lire: cle => { try { return localStorage.getItem(cle); } catch (e) { return null; } },
        ecrire: (cle, valeur) => { try { localStorage.setItem(cle, valeur); } catch (e) { } },
        // iPhone : le son ne démarre qu'après un geste de l'utilisateur
        debloquerSon: () => { contexte(); },
        son: (nom, v) => {
            try {
                if (typeof v === "number") volume = v;
                if (nom === "sifflet") sifflet(0.35);
                else if (nom === "siffletlong") sifflet(0.9);
                else if (nom === "but") corne();
                else if (nom === "arret") foule(0.6, 0.25, 0.1);
                else if (nom === "clic") { note(880, 880, 0.05, 0.2); setTimeout(() => note(1320, 1320, 0.08, 0.2), 45); }
                else if (nom === "survol") note(1500, 2400, 0.045, 0.12);
                else if (nom === "pieces") pieces();
                else if (nom === "palier") carillon([784, 988, 1175, 1568], 0.11);
                else if (nom === "legende") legende();
                else if (nom === "revele") note(300, 1200, 0.22, 0.12);
                else if (nom === "victoire") carillon([523, 659, 784, 1047, 784, 1047], 0.13);
            } catch (e) { }
        },
        // Vibration : seulement pour les moments clés et les grosses récompenses (jamais à chaque but)
        vibrer: motif => { try { if (navigator.vibrate) navigator.vibrate(motif); } catch (e) { } },
        // Pluie de confettis par-dessus l'écran (hors de Blazor : elle se retire toute seule)
        confettis: force => {
            try {
                const n = Math.round(60 * (force || 1));
                const couches = document.createElement('div');
                couches.className = 'confettis';
                const couleurs = ['#FFD23F', '#E4002B', '#2EC4F1', '#3DDC84', '#E056FD', '#FFFFFF', '#FF9F1C'];
                for (let i = 0; i < n; i++) {
                    const c = document.createElement('i');
                    c.style.left = (Math.random() * 100) + 'vw';
                    c.style.background = couleurs[i % couleurs.length];
                    c.style.animationDelay = (Math.random() * 0.6) + 's';
                    c.style.animationDuration = (1.8 + Math.random() * 1.6) + 's';
                    c.style.setProperty('--derive', ((Math.random() - 0.5) * 160) + 'px');
                    c.style.setProperty('--tour', (Math.random() * 1080 - 540) + 'deg');
                    if (Math.random() < 0.4) { c.style.width = '6px'; c.style.height = '14px'; }
                    couches.appendChild(c);
                }
                document.body.appendChild(couches);
                setTimeout(() => couches.remove(), 4200);
            } catch (e) { }
        }
    };

    // Pièces : une cascade de petits « ting » clairs
    function pieces() {
        for (let i = 0; i < 6; i++)
            setTimeout(() => note(2200 + Math.random() * 900, 2600 + Math.random() * 900, 0.07, 0.07), i * 55);
    }
    // Carillon : des notes qui montent
    function carillon(frequences, pas) {
        frequences.forEach((f, i) => setTimeout(() => {
            const a = contexte(); if (!a) return;
            const t = a.currentTime;
            [1, 2].forEach(h => {
                const osc = a.createOscillator(), gain = a.createGain();
                osc.type = h === 1 ? "triangle" : "sine"; osc.frequency.value = f * h;
                gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(h === 1 ? 0.16 : 0.05, t + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
                osc.connect(gain); gain.connect(maitre); osc.start(t); osc.stop(t + 0.52);
            });
        }, i * pas * 1000));
    }
    // Légende : un grondement, puis un arpège scintillant et la foule
    function legende() {
        const a = contexte(); if (!a) return;
        const t = a.currentTime, osc = a.createOscillator(), gain = a.createGain();
        osc.type = "sawtooth"; osc.frequency.setValueAtTime(55, t); osc.frequency.exponentialRampToValueAtTime(110, t + 0.9);
        gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.12, t + 0.3); gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
        osc.connect(gain); gain.connect(maitre); osc.start(t); osc.stop(t + 1.15);
        setTimeout(() => carillon([523, 659, 784, 1047, 1319, 1568, 2093], 0.07), 700);
        setTimeout(() => foule(2.4, 0.4, 0.3), 900);
    }
})();

// =====================================================================================
//  Les gestes au doigt (téléphone)
//   - BALAYER l'écran à gauche / à droite : onglet suivant / précédent ;
//   - GLISSER une ligne [data-glisse="cle"] : à droite (accepter, lu…) ou à gauche (refuser, supprimer…) ;
//   - APPUI LONG sur une carte [data-prendre="source"] puis la faire glisser sur une cible [data-deposer="cible"]
//     (échanger deux joueurs, faire entrer un remplaçant, envoyer un titulaire sur le banc).
//  Le C# reçoit Balayer(sens), Glisser(cle, sens) et Deposer(source, cible).
// =====================================================================================
window.hbmGestes = (function () {
    let ref = null;
    const SEUIL = 70;
    let depart = null, ligne = null, prise = null, sansClic = false, cibleSurvolee = null;

    function invoquer(methode, ...args) {
        if (ref) ref.invokeMethodAsync(methode, ...args).catch(() => { });
    }
    function vibrer(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { } }
    function voileOuvert() { return !!document.querySelector('.voile, .voile-menu, .ouverture-pack, .ecran-plein, .plein'); }

    // ----- Glisser-déposer après un appui long -----
    function commencerPrise(x, y) {
        if (!prise) return;
        prise.actif = true;
        vibrer(18);
        const r = prise.el.getBoundingClientRect();
        const f = prise.el.cloneNode(true);
        f.classList.add('fantome');
        f.style.width = r.width + 'px';
        f.style.height = r.height + 'px';
        document.body.appendChild(f);
        prise.fantome = f;
        prise.dx = x - r.left;
        prise.dy = y - r.top;
        prise.el.classList.add('pris');
        document.body.classList.add('glisse-en-cours');
        deplacer(x, y);
    }
    function deplacer(x, y) {
        if (!prise || !prise.fantome) return;
        prise.fantome.style.transform = `translate(${x - prise.dx}px, ${y - prise.dy}px) scale(1.08) rotate(-3deg)`;
        const c = cibleSous(x, y);
        if (c !== cibleSurvolee) {
            if (cibleSurvolee) cibleSurvolee.classList.remove('cible-depot');
            cibleSurvolee = c;
            if (c && c !== prise.el) { c.classList.add('cible-depot'); vibrer(6); }
        }
        // Défilement de la page quand le doigt approche du bord
        if (y < 90) window.scrollBy(0, -10);
        else if (y > window.innerHeight - 110) window.scrollBy(0, 10);
    }
    function cibleSous(x, y) {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('[data-deposer]') : null;
    }
    function finirPrise(x, y) {
        const p = prise;
        prise = null;
        if (!p) return;
        clearTimeout(p.minuteur);
        if (!p.actif) return;
        const c = cibleSous(x, y);
        if (cibleSurvolee) cibleSurvolee.classList.remove('cible-depot');
        cibleSurvolee = null;
        if (p.fantome) p.fantome.remove();
        p.el.classList.remove('pris');
        document.body.classList.remove('glisse-en-cours');
        sansClic = true;
        setTimeout(() => sansClic = false, 450);
        if (c && c !== p.el) invoquer('Deposer', p.source, c.dataset.deposer);
    }

    // ----- Une ligne qu'on fait glisser -----
    function relacherLigne(dx, dy) {
        const el = ligne;
        ligne = null;
        if (!el) return false;
        el.style.transition = 'transform .22s ease, opacity .22s ease';
        el.classList.remove('vers-droite', 'vers-gauche');
        if (Math.abs(dx) > SEUIL * 1.4 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            el.style.transform = `translateX(${dx > 0 ? 110 : -110}%)`;
            el.style.opacity = '0';
            vibrer(12);
            invoquer('Glisser', el.dataset.glisse, dx > 0 ? 1 : -1);
            setTimeout(() => { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; }, 260);
            return true;
        }
        el.style.transform = '';
        return dx !== 0;
    }

    // Un geste resté coincé (doigt levé hors de l'écran, 2e doigt, page redessinée) : on remet tout à zéro,
    // sinon la page ne défile plus (body.glisse-en-cours) et les balayages ne passent plus
    function nettoyer() {
        if (prise) { clearTimeout(prise.minuteur); if (prise.fantome) prise.fantome.remove(); if (prise.el) prise.el.classList.remove('pris'); }
        prise = null;
        document.querySelectorAll('.fantome').forEach(f => f.remove());
        document.querySelectorAll('.cible-depot').forEach(c => c.classList.remove('cible-depot'));
        cibleSurvolee = null;
        document.body.classList.remove('glisse-en-cours');
        if (ligne) { ligne.style.transform = ''; ligne = null; }
    }

    // La page défile : ce n'est pas un appui long
    window.addEventListener('scroll', () => {
        if (prise && !prise.actif) { clearTimeout(prise.minuteur); prise = null; }
        if (depart) depart.bouge = true;
    }, { passive: true, capture: true });

    // Seul geste qui bloque le défilement : une carte attrapée ou une ligne glissée de côté.
    // Ce « touchmove » bloquant n'est branché QUE sur les cartes et les lignes à glisser : partout ailleurs le
    // téléphone fait défiler la page tout seul, sans attendre le jeu (sinon, pendant les animations, la page
    // ne défilait plus qu'à deux doigts sur certains Android)
    const bloquant = e => {
        if (depart && ((prise && prise.actif) || (ligne && depart.horizontal)) && e.cancelable) e.preventDefault();
    };
    const branches = new WeakSet();
    let rechercheDemandee = false;
    function brancherBloquants() {
        rechercheDemandee = false;
        document.querySelectorAll('[data-prendre], [data-glisse]').forEach(el => {
            if (branches.has(el)) return;
            branches.add(el);
            el.addEventListener('touchmove', bloquant, { passive: false });
        });
    }
    new MutationObserver(() => {
        if (!rechercheDemandee) { rechercheDemandee = true; requestAnimationFrame(brancherBloquants); }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-prendre', 'data-glisse'] });

    document.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { if (!(prise && prise.actif)) nettoyer(); depart = null; return; }
        if (!(prise && prise.actif)) nettoyer();
        const t = e.touches[0];
        depart = { x: t.clientX, y: t.clientY, t: Date.now(), el: e.target, horizontal: null, dernier: { x: t.clientX, y: t.clientY } };
        const source = e.target.closest('[data-prendre]');
        if (source && !voileOuvert()) {
            prise = { source: source.dataset.prendre, el: source, actif: false };
            // Appui long franc (doigt immobile) pour attraper une carte : un défilement qui démarre lentement
            // ne doit pas l'attraper (sinon la page ne défile plus qu'à deux doigts)
            prise.minuteur = setTimeout(() => {
                if (depart && prise && !depart.bouge) commencerPrise(depart.x, depart.y);
                else if (prise && !prise.actif) prise = null;
            }, 450);
        }
        ligne = e.target.closest('[data-glisse]');
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!depart) return;
        const t = e.touches[0];
        depart.dernier = { x: t.clientX, y: t.clientY };
        const dx = t.clientX - depart.x, dy = t.clientY - depart.y;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) depart.bouge = true;
        if (prise) {
            if (prise.actif) { deplacer(t.clientX, t.clientY); return; }
            if (depart.bouge) { clearTimeout(prise.minuteur); prise = null; }
        }
        if (depart.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8))
            depart.horizontal = Math.abs(dx) > Math.abs(dy);
        if (ligne && depart.horizontal) {
            ligne.style.transition = 'none';
            ligne.style.transform = `translateX(${dx}px)`;
            ligne.classList.toggle('vers-droite', dx > SEUIL);
            ligne.classList.toggle('vers-gauche', dx < -SEUIL);
        }
    }, { passive: true });

    // Balayage entre les onglets (aussi quand le téléphone annule le geste en cours de route)
    function balayage(dx, dy, duree, el) {
        if (duree < 900 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !voileOuvert()
            && el && el.closest && el.closest('.ecran')
            && !el.closest('[data-pas-de-balayage], input, select, textarea, .selecteur, .defile-x, .vitrine, .packs-offerts, .moments-boutique'))
            invoquer('Balayer', dx < 0 ? 1 : -1);
    }

    document.addEventListener('touchend', e => {
        if (!depart) { if (prise) finirPrise(-1, -1); return; }
        const t = e.changedTouches[0];
        const dx = t.clientX - depart.x, dy = t.clientY - depart.y, duree = Date.now() - depart.t;
        const el = depart.el;
        depart = null;
        if (prise) {
            const actif = prise.actif;
            finirPrise(t.clientX, t.clientY);
            if (actif) return;
        }
        if (ligne) { if (relacherLigne(dx, dy)) return; }
        balayage(dx, dy, duree, el);
    });

    document.addEventListener('touchcancel', () => {
        const d = depart;
        const avaitPrise = prise && prise.actif;
        if (prise) finirPrise(-1, -1);
        if (ligne) { ligne.style.transform = ''; ligne = null; }
        depart = null;
        document.body.classList.remove('glisse-en-cours');
        if (d && d.dernier && !avaitPrise)
            balayage(d.dernier.x - d.x, d.dernier.y - d.y, Date.now() - d.t, d.el);
    });

    // ----- À la souris (version PC) : glisser-déposer les cartes, glisser les lignes -----
    // Pas d'appui long : on attrape une carte en la déplaçant de quelques pixels, bouton enfoncé.
    let souris = null;
    document.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const source = e.target.closest && e.target.closest('[data-prendre]');
        const lg = e.target.closest && e.target.closest('[data-glisse]');
        if (!source && !lg) return;
        if (source && voileOuvert()) return;
        souris = { x: e.clientX, y: e.clientY, source, ligne: lg, horizontal: null };
        if (source) e.preventDefault();   // pas de glisser natif de l'image ni de sélection de texte
    });
    document.addEventListener('mousemove', e => {
        if (!souris) return;
        const dx = e.clientX - souris.x, dy = e.clientY - souris.y;
        if (souris.source) {
            if (!prise && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
                prise = { source: souris.source.dataset.prendre, el: souris.source, actif: false };
                commencerPrise(e.clientX, e.clientY);
                prise.dx = souris.x - souris.source.getBoundingClientRect().left;
                prise.dy = souris.y - souris.source.getBoundingClientRect().top;
            }
            if (prise && prise.actif) { deplacer(e.clientX, e.clientY); e.preventDefault(); }
            return;
        }
        if (souris.ligne) {
            if (souris.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) souris.horizontal = Math.abs(dx) > Math.abs(dy);
            if (souris.horizontal) {
                ligne = souris.ligne;
                ligne.style.transition = 'none';
                ligne.style.transform = `translateX(${dx}px)`;
                ligne.classList.toggle('vers-droite', dx > SEUIL);
                ligne.classList.toggle('vers-gauche', dx < -SEUIL);
                e.preventDefault();
            }
        }
    });
    document.addEventListener('mouseup', e => {
        if (!souris) return;
        const s = souris;
        souris = null;
        if (prise) { finirPrise(e.clientX, e.clientY); return; }
        if (s.ligne && s.horizontal) {
            ligne = s.ligne;
            if (relacherLigne(e.clientX - s.x, e.clientY - s.y)) { sansClic = true; setTimeout(() => sansClic = false, 450); }
        }
    });

    // ----- La molette (version PC) : elle fait toujours défiler la zone sous la souris -----
    // (le navigateur intégré de Windows ne le faisait pas toujours) ; la page entière si rien d'autre ne défile.
    function defilable(el, dy) {
        for (; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
            const s = getComputedStyle(el);
            if (!/(auto|scroll)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 1) continue;
            if (dy < 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1) return el;
        }
        return null;
    }
    document.addEventListener('wheel', e => {
        if (!document.body.classList.contains('pc') || e.ctrlKey) return;
        if (e.target.closest && e.target.closest('select, input, textarea')) return;
        const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
        const dx = e.deltaMode === 1 ? e.deltaX * 40 : e.deltaX;
        const zone = defilable(e.target, dy);
        e.preventDefault();
        if (zone) zone.scrollBy({ top: dy, left: dx });
        else {
            // Une fenêtre plein écran (match, pack, bilan) : c'est elle qui défile
            const plein = e.target.closest && e.target.closest('.plein, .voile');
            if (plein && plein.scrollHeight > plein.clientHeight) plein.scrollBy({ top: dy });
            else (document.scrollingElement || document.documentElement).scrollBy({ top: dy, left: dx });
        }
    }, { passive: false });

    // Après un glisser-déposer, le « clic » qui suit est ignoré
    document.addEventListener('click', e => {
        if (sansClic) { e.stopPropagation(); e.preventDefault(); sansClic = false; }
    }, true);

    // Pas de menu « copier / enregistrer l'image » sur un appui long
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-prendre]')) e.preventDefault(); });

    return {
        init: r => { ref = r; },
        liberer: () => { ref = null; }
    };
})();

// Le geste « retour » du téléphone (balayage depuis le bord) ne quitte pas le jeu ni le match :
// une entrée d'historique en double est posée sur ces pages, et reposée à chaque retour.
window.hbmRetour = (() => {
    const pages = /\/(jeu|match)\/?$/;
    const poser = () => { if (pages.test(location.pathname)) history.pushState({ hbmGarde: true }, '', location.href); };
    window.addEventListener('popstate', () => { if (pages.test(location.pathname)) setTimeout(poser, 0); });
    return { garder: () => { if (!(history.state && history.state.hbmGarde)) poser(); } };
})();
