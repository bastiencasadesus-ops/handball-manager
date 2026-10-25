// Les packs de la boutique en vraie 3D (WebGL), comme le sachet de l'ouverture sur PC :
// un sachet bombé (recto et verso), éclairé, avec un reflet holographique qui suit l'inclinaison.
// Chaque <canvas data-pack3d> de la page est monté tout seul ; s'il disparaît, il est libéré.
// Sans WebGL, rien ne change : le sachet en CSS reste affiché.
window.hbmPack3D = (() => {
    const L = 300, H = 440, SERTI = 18, GONFLE = 24, COL = 30, LANGUETTE = 84;
    const COULEURS = {
        bronze: ['#E0A672', '#7A4A26', 0.35],
        argent: ['#EEF1F6', '#6B7588', 0.7],
        or: ['#F7D66A', '#A87A08', 1.0]
    };
    const instances = [];

    // WebGL disponible ? On le sait tout de suite : le sachet 2D ne s'affiche alors jamais (pas de flash avant la 3D)
    const webgl = (() => {
        try {
            const gl = document.createElement('canvas').getContext('webgl');
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
            return !!gl;
        } catch { return false; }
    })();
    if (webgl) document.documentElement.classList.add('pack3d-ok');

    const VS = `
attribute vec3 p; attribute vec3 n; attribute vec2 uv;
uniform mat4 proj; uniform mat4 model;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos;
void main() {
    vUv = uv;
    vec4 w = model * vec4(p, 1.0);
    vPos = w.xyz;
    vN = (model * vec4(n, 0.0)).xyz;
    gl_Position = proj * w;
}`;
    const FS = `
precision mediump float;
varying vec2 vUv; varying vec3 vN; varying vec3 vPos;
uniform sampler2D tex; uniform float holo; uniform vec2 tilt; uniform vec3 cam;
vec3 arc(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }
void main() {
    vec4 c = texture2D(tex, vUv);
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 Lp = normalize(vec3(0.35, 0.45, 1.0));
    float dif = max(dot(N, Lp), 0.0);
    vec3 V = normalize(cam - vPos);
    float spec = pow(max(dot(N, normalize(Lp + V)), 0.0), 28.0) * 0.45;
    float b = vUv.x * 0.6 + vUv.y * 0.4 + tilt.x * 0.6 + tilt.y * 0.3;
    float bande = smoothstep(0.0, 0.3, fract(b)) * smoothstep(1.0, 0.7, fract(b));
    vec3 h = (arc(b * 1.4) - 0.35) * holo * 0.22 * bande;
    gl_FragColor = vec4(c.rgb * (0.5 + 0.6 * dif) + spec + h, 1.0);
}`;

    // ----- Matrices (colonnes, comme WebGL) -----
    function mul(a, b) {
        const r = new Float32Array(16);
        for (let i = 0; i < 4; i++)
            for (let j = 0; j < 4; j++) {
                let s = 0;
                for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
                r[i * 4 + j] = s;
            }
        return r;
    }
    function perspective(fovY, aspect, pres, loin) {
        const f = 1 / Math.tan(fovY / 2), nf = 1 / (pres - loin);
        return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (loin + pres) * nf, -1, 0, 0, 2 * loin * pres * nf, 0]);
    }
    const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
    const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
    const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);

    // ----- Le sachet : une grille bombée au centre, plate sur les bords sertis -----
    function epaisseur(u, v) {
        const s = SERTI / H;
        if (v <= s || v >= 1 - s) return 0;
        return GONFLE * Math.pow(Math.sin(Math.PI * u), 0.35) * Math.pow(Math.sin(Math.PI * (v - s) / (1 - 2 * s)), 0.3);
    }
    function coussin(verso, v0 = 0, v1 = 1) {
        const pos = [], uvs = [], idx = [];
        const LIG = Math.max(4, Math.round(44 * (v1 - v0)));
        for (let j = 0; j <= LIG; j++)
            for (let i = 0; i <= COL; i++) {
                const u = i / COL, v = v0 + (v1 - v0) * j / LIG, z = epaisseur(u, v) + 0.5;
                pos.push((u - 0.5) * L, (v - 0.5) * H, verso ? -z : z);
                uvs.push(verso ? 1 - u : u, 1 - v);
            }
        const w = COL + 1;
        for (let j = 0; j < LIG; j++)
            for (let i = 0; i < COL; i++) {
                const a = j * w + i, b = a + 1, c = a + w + 1, d = a + w;
                if (verso) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
            }
        // Normales : somme des normales des triangles autour de chaque sommet
        const nor = new Float32Array(pos.length);
        for (let t = 0; t < idx.length; t += 3) {
            const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
            const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
            const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const k of [a, b, c]) { nor[k] += nx; nor[k + 1] += ny; nor[k + 2] += nz; }
        }
        return { pos: new Float32Array(pos), nor, uvs: new Float32Array(uvs), idx: new Uint16Array(idx) };
    }

    // ----- Les images du pack, dessinées comme celles du PC -----
    function serti(ctx, y) {
        for (let x = 0; x < L; x += 5) {
            ctx.fillStyle = 'rgba(255,255,255,.44)'; ctx.fillRect(x, y, 2, SERTI);
            ctx.fillStyle = 'rgba(0,0,0,.27)'; ctx.fillRect(x + 2, y, 3, SERTI);
        }
    }
    function texteEnRelief(ctx, texte, x, y, taille) {
        ctx.font = `700 ${taille}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fillText(texte, x, y + 2);
        ctx.fillStyle = '#fff'; ctx.fillText(texte, x, y);
    }
    function pastille(ctx, texte, cx, cy, fond, bord, taille) {
        ctx.font = `700 ${taille}px "Barlow Condensed", "Arial Narrow", sans-serif`;
        const w = ctx.measureText(texte).width + 28, h = taille + 10;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2); else ctx.rect(cx - w / 2, cy - h / 2, w, h);
        ctx.fillStyle = fond; ctx.fill();
        if (bord) { ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(texte, cx, cy + 1);
        return w;
    }
    function fond(ctx, type) {
        const [haut, bas] = COULEURS[type];
        const g = ctx.createLinearGradient(0, 0, L * 0.35, H);
        g.addColorStop(0, haut); g.addColorStop(1, bas);
        ctx.fillStyle = g; ctx.fillRect(0, 0, L, H);
        serti(ctx, 0); serti(ctx, H - SERTI);
    }
    function recto(d) {
        const c = document.createElement('canvas'); c.width = L * 2; c.height = H * 2;
        const ctx = c.getContext('2d'); ctx.scale(2, 2);
        fond(ctx, d.type);
        texteEnRelief(ctx, d.libelle, L / 2, 58, 24);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(10, 84); ctx.lineTo(L - 10, 84); ctx.stroke(); ctx.setLineDash([]);
        // Le ballon
        const bx = L / 2, by = 164;
        ctx.fillStyle = 'rgba(0,0,0,.27)'; ctx.beginPath(); ctx.arc(bx + 3, by + 7, 52, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bx, by, 52, 0, 7); ctx.fill();
        ctx.save(); ctx.translate(bx - 42, by - 42); ctx.scale(84 / 62, 84 / 62); ctx.lineWidth = 3;
        ctx.strokeStyle = '#0A2358'; ctx.beginPath(); ctx.arc(31, 31, 27, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#E0263A';
        ctx.stroke(new Path2D('M8,22 Q31,34 54,22 M8,40 Q31,28 54,40 M31,4 Q22,31 31,58'));
        ctx.restore();
        texteEnRelief(ctx, 'HANDBALL', L / 2, 270, 32);
        texteEnRelief(ctx, 'MANAGER', L / 2, 298, 32);
        // Le niveau et le nombre de joueurs
        ctx.font = '700 18px "Barlow Condensed", sans-serif';
        const w1 = d.niveau ? ctx.measureText(d.niveau).width + 28 + 8 : 0;
        ctx.font = '700 14px "Barlow Condensed", sans-serif';
        const w2 = ctx.measureText(d.joueurs).width + 28;
        const x0 = L / 2 - (w1 + w2) / 2;
        if (d.niveau) pastille(ctx, d.niveau, x0 + (w1 - 8) / 2, 334, '#E4002B', true, 18);
        pastille(ctx, d.joueurs, x0 + w1 + w2 / 2, 334, 'rgba(0,0,0,.27)', false, 14);
        if (d.verrou) {
            ctx.fillStyle = 'rgba(5,15,42,.5)'; ctx.fillRect(0, 0, L, H);
            ctx.fillStyle = 'rgba(5,15,42,.75)'; ctx.beginPath(); ctx.arc(L - 49, 137, 33, 0, 7); ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.stroke();
            ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
            ctx.fillText('\u{1F512}', L - 49, 139);
        }
        return c;
    }
    function verso(d) {
        const c = document.createElement('canvas'); c.width = L; c.height = H;
        const ctx = c.getContext('2d');
        fond(ctx, d.type);
        texteEnRelief(ctx, 'HANDBALL MANAGER', L / 2, H / 2 + 8, 22);
        if (d.verrou) { ctx.fillStyle = 'rgba(5,15,42,.5)'; ctx.fillRect(0, 0, L, H); }
        return c;
    }

    // ----- Montage d'un canvas -----
    function compiler(gl, type, src) {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
    }
    function peindre(gl, tex, image) {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }
    function texture(gl, image) {
        const tex = gl.createTexture();
        peindre(gl, tex, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }
    function tampons(gl, geo) {
        const tampon = (cible, donnees) => { const b = gl.createBuffer(); gl.bindBuffer(cible, b); gl.bufferData(cible, donnees, gl.STATIC_DRAW); return b; };
        return { pos: tampon(gl.ARRAY_BUFFER, geo.pos), nor: tampon(gl.ARRAY_BUFFER, geo.nor), uv: tampon(gl.ARRAY_BUFFER, geo.uvs),
                 idx: tampon(gl.ELEMENT_ARRAY_BUFFER, geo.idx), n: geo.idx.length };
    }

    // Deux modes : « vitrine » (la boutique : le pack entier, qui suit le doigt)
    // et « ouverture » (le pack qu'on déchire : la languette et le corps sont deux morceaux, qui s'envolent à l'ouverture)
    function monter(canvas) {
        canvas.dataset.pack3dMonte = '1';
        const d = { type: canvas.dataset.type, libelle: canvas.dataset.libelle, niveau: canvas.dataset.niveau || '',
                    joueurs: canvas.dataset.joueurs, verrou: canvas.dataset.verrou === '1', rang: +canvas.dataset.rang || 0,
                    ouverture: canvas.dataset.mode === 'ouverture' };
        const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true });
        const conteneur = canvas.closest('.scene-boutique, .pack-scelle');
        const repli = () => conteneur?.classList.add('sans3d');   // le sachet 2D revient
        if (!gl || !COULEURS[d.type]) { repli(); return; }
        try {
            const prog = gl.createProgram();
            gl.attachShader(prog, compiler(gl, gl.VERTEX_SHADER, VS));
            gl.attachShader(prog, compiler(gl, gl.FRAGMENT_SHADER, FS));
            gl.linkProgram(prog);
            if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
            const vP = 1 - LANGUETTE / H;
            const morceaux = d.ouverture ? [['corps', 0, vP], ['languette', vP, 1]] : [['entier', 0, 1]];
            const inst = {
                canvas, gl, prog, d, x: 0, y: 0, cx: 0, cy: 0, doigt: false, debut: performance.now() / 1000 + d.rang * 1.7,
                tex: [texture(gl, recto(d)), texture(gl, verso(d))],
                pieces: morceaux.map(([role, v0, v1]) => ({ role, faces: [tampons(gl, coussin(false, v0, v1)), tampons(gl, coussin(true, v0, v1))] })),
                ouvertureDebut: null, aplat: 0,
                attr: { p: gl.getAttribLocation(prog, 'p'), n: gl.getAttribLocation(prog, 'n'), uv: gl.getAttribLocation(prog, 'uv') },
                uni: Object.fromEntries(['proj', 'model', 'tex', 'holo', 'tilt', 'cam'].map(u => [u, gl.getUniformLocation(prog, u)]))
            };
            if (!d.ouverture) {
                const suivre = e => {
                    const r = canvas.getBoundingClientRect();
                    inst.cx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
                    inst.cy = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2)));
                    inst.doigt = true;
                };
                canvas.addEventListener('pointermove', suivre);
                canvas.addEventListener('pointerdown', suivre);
                canvas.addEventListener('pointerleave', () => inst.doigt = false);
                canvas.addEventListener('pointerup', () => setTimeout(() => inst.doigt = false, 600));
                canvas.addEventListener('pointercancel', () => inst.doigt = false);
            }
            instances.push(inst);
            // Dessiné seulement quand il est à l'écran (hors de la vue : rien à calculer)
            inst.visible = true;
            if (window.IntersectionObserver) {
                inst.obs = new IntersectionObserver(e => { inst.visible = e[e.length - 1].isIntersecting; }, { rootMargin: '40px' });
                inst.obs.observe(canvas);
            }
            conteneur?.classList.add('avec3d');
        } catch (err) {
            console.warn('Pack 3D indisponible', err);
            repli();
        }
    }

    const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
    const lisse = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);

    function dessiner(inst, t) {
        const { gl, canvas, prog, attr, uni, d } = inst;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
        if (w === 0 || h === 0) return;
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }

        const tt = t - inst.debut;
        let cibleX, cibleY;
        if (d.ouverture) {
            // Pendant la déchirure, le pack se met à plat pour que les pointillés restent sous le doigt
            const dechire = +(canvas.dataset.avancee || 0) > 0;
            inst.aplat += ((dechire ? 1 : 0) - inst.aplat) * 0.15;
            cibleX = Math.sin(tt * 0.7) * 0.4 * (1 - inst.aplat);
            cibleY = Math.sin(tt * 0.5) * 0.2 * (1 - inst.aplat);
            if (canvas.dataset.ouvert === '1' && inst.ouvertureDebut === null) inst.ouvertureDebut = t;
        } else {
            cibleX = inst.doigt ? inst.cx : Math.sin(tt * 0.7) * 0.5;
            cibleY = inst.doigt ? inst.cy : Math.sin(tt * 0.5) * 0.25;
        }
        inst.x += (cibleX - inst.x) * 0.1;
        inst.y += (cibleY - inst.y) * 0.1;

        gl.viewport(0, 0, w, h);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(prog);
        // Hauteur visible : en vitrine, le pack et une marge ; à l'ouverture, le pack fait data-hauteur-pack pixels
        const fov = 30 * Math.PI / 180, aspect = w / h;
        const hauteurPx = +(canvas.dataset.hauteurPack || 0);
        const visible = hauteurPx > 0 ? H * canvas.clientHeight / hauteurPx : H * 1.12;
        const distance = (visible / 2) / Math.tan(fov / 2);
        gl.uniformMatrix4fv(uni.proj, false, mul(perspective(fov, aspect, 10, distance * 4), translation(0, 0, -distance)));
        gl.uniform3f(uni.cam, 0, 0, distance);
        gl.uniform2f(uni.tilt, inst.x, inst.y);
        gl.uniform1i(uni.tex, 0);
        const flotte = d.ouverture ? translation(0, Math.sin(tt * 1.9) * 6 * (1 - inst.aplat), 0) : translation(0, 0, 0);
        const incline = mul(flotte, mul(rotY(inst.x * 30 * Math.PI / 180), rotX(inst.y * 18 * Math.PI / 180)));
        const o = inst.ouvertureDebut === null ? 0 : t - inst.ouvertureDebut;

        for (const piece of inst.pieces) {
            let model = incline;
            if (piece.role === 'languette' && o > 0) {
                // La languette pivote au bout des pointillés puis s'envole en haut à droite
                const k = lisse(o / 0.65), py = H / 2 - LANGUETTE;
                const pivot = mul(translation(L / 2, py, 0), mul(rotZ(-k * 55 * Math.PI / 180), translation(-L / 2, -py, 0)));
                model = mul(incline, mul(translation(k * 330, k * 420, k * 40), pivot));
            } else if (piece.role === 'corps' && o > 0) {
                const k = lisse((o - 0.12) / 0.7);   // le corps tombe, juste après
                model = mul(translation(0, -k * 900, 0), incline);
            }
            gl.uniformMatrix4fv(uni.model, false, model);
            piece.faces.forEach((f, i) => {
                gl.uniform1f(uni.holo, i === 0 ? COULEURS[d.type][2] : 0);
                gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, inst.tex[i]);
                for (const [a, b, n] of [[attr.p, f.pos, 3], [attr.n, f.nor, 3], [attr.uv, f.uv, 2]]) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, n, gl.FLOAT, false, 0, 0);
                }
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, f.idx);
                gl.drawElements(gl.TRIANGLES, f.n, gl.UNSIGNED_SHORT, 0);
            });
        }
    }

    // Les nouveaux canvas sont montés dès qu'ils apparaissent dans la page
    const chercher = () => { if (webgl) document.querySelectorAll('canvas[data-pack3d]:not([data-pack3d-monte])').forEach(monter); };
    new MutationObserver(chercher).observe(document.documentElement, { childList: true, subtree: true });
    // Police chargée après coup : on redessine les images avec la bonne police
    document.fonts?.load('700 40px "Barlow Condensed"').then(() => {
        for (const inst of instances) {
            peindre(inst.gl, inst.tex[0], recto(inst.d));
            peindre(inst.gl, inst.tex[1], verso(inst.d));
        }
    });
    let derniereRecherche = 0;
    function boucle(ms) {
        const t = ms / 1000;
        if (ms - derniereRecherche > 500) { derniereRecherche = ms; chercher(); }
        for (let i = instances.length - 1; i >= 0; i--) {
            const inst = instances[i];
            if (!inst.canvas.isConnected) {   // le pack a quitté la page : on libère WebGL
                inst.gl.getExtension('WEBGL_lose_context')?.loseContext();
                inst.obs?.disconnect();
                instances.splice(i, 1);
                continue;
            }
            if (inst.visible && !document.hidden && inst.canvas.offsetParent !== null) dessiner(inst, t);
        }
        requestAnimationFrame(boucle);
    }
    requestAnimationFrame(boucle);
    return { instances };
})();

// Inclinaison au doigt (ou à la souris) pour les éléments [data-incline] : les cartes du pack qui se retournent.
// Variables CSS : --rx, --ry (angles) et --px (position du reflet).
(() => {
    const incliner = e => {
        const el = e.target.closest && e.target.closest('[data-incline]');
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = Math.max(-0.5, Math.min(0.5, (e.clientX - r.left) / r.width - 0.5));
        const y = Math.max(-0.5, Math.min(0.5, (e.clientY - r.top) / r.height - 0.5));
        el.style.setProperty('--ry', (x * 34).toFixed(1) + 'deg');
        el.style.setProperty('--rx', (-y * 22).toFixed(1) + 'deg');
        el.style.setProperty('--px', ((x + 0.5) * 100).toFixed(0) + '%');
        el.setAttribute('data-incline-actif', '');
    };
    const relacher = e => {
        const el = e.target.closest && e.target.closest('[data-incline]');
        if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
        el.style.removeProperty('--ry'); el.style.removeProperty('--rx'); el.style.removeProperty('--px');
        el.removeAttribute('data-incline-actif');
    };
    document.addEventListener('pointermove', incliner, { passive: true });
    document.addEventListener('pointerdown', incliner, { passive: true });
    document.addEventListener('pointerout', relacher, { passive: true });
    document.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') relacher(e); }, { passive: true });
})();
