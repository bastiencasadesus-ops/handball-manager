// Petits services du navigateur pour Handball Manager : sauvegarde locale et sons de match.
window.hbm = (function () {
    let audio = null;

    function contexte() {
        if (!audio) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (!C) return null;
            audio = new C();
        }
        if (audio.state === "suspended") audio.resume();
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
        osc.connect(gain); gain.connect(a.destination);
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
        source.connect(filtre); filtre.connect(gain); gain.connect(a.destination);
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
            osc.connect(gain); gain.connect(a.destination);
            osc.start(t); osc.stop(t + 0.8);
        });
        foule(1.8, 0.35, 0.25);
    }

    return {
        lire: cle => { try { return localStorage.getItem(cle); } catch (e) { return null; } },
        ecrire: (cle, valeur) => { try { localStorage.setItem(cle, valeur); } catch (e) { } },
        // iPhone : le son ne démarre qu'après un geste de l'utilisateur
        debloquerSon: () => { contexte(); },
        son: nom => {
            try {
                if (nom === "sifflet") sifflet(0.35);
                else if (nom === "siffletlong") sifflet(0.9);
                else if (nom === "but") corne();
                else if (nom === "arret") foule(0.6, 0.25, 0.1);
            } catch (e) { }
        }
    };
})();
