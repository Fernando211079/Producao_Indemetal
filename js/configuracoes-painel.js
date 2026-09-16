// =======================================================
// INDEMETAL — Painel de Configurações
// Documento Firestore: configuracoes/geral
// =======================================================

const DOC_REF = db.collection("configuracoes").doc("geral");

const CORES_FAMILIA = {
    rotativa:          "#00e6ff",
    semiautomatica:    "#ff9800",
    paralela:          "#00ff88",
    manual:            "#ff4444",
    "sala-limpa":      "#c084fc",
    "adesivo-liquido": "#ffd600"
};

// Valores padrão — usados na primeira execução
const DEFAULTS = {
    eficiencia:     80,   // %
    horasSegQui_t1: 9,    // turno 1 seg-qui
    horasSex_t1:    8,    // turno 1 sexta
    horasSegQui_t2: 8,    // turno 2 seg-qui
    horasSex_t2:    7,    // turno 2 sexta
    familias: {
        rotativa:          { nome: "Rotativa",        maquinas: 8, op_t1: 4, op_t2: 2, metaHora: 530 },
        semiautomatica:    { nome: "Semiautomática",  maquinas: 8, op_t1: 4, op_t2: 2, metaHora: 145 },
        paralela:          { nome: "Paralela",        maquinas: 4, op_t1: 2, op_t2: 1, metaHora: 80  },
        manual:            { nome: "Manual",          maquinas: 4, op_t1: 2, op_t2: 1, metaHora: 45  },
        "sala-limpa":      { nome: "Sala Limpa",      maquinas: 2, op_t1: 1, op_t2: 1, metaHora: 145 },
        "adesivo-liquido": { nome: "Adesivo Líquido", maquinas: 2, op_t1: 1, op_t2: 1, metaHora: 170 }
    }
};

// =======================================================
// INICIALIZAÇÃO
// =======================================================

document.addEventListener("DOMContentLoaded", async () => {
    const cfg = await carregarConfiguracoes();
    renderizarPainel(cfg);
});

// =======================================================
// CARREGAR DO FIRESTORE
// =======================================================

async function carregarConfiguracoes() {
    try {
        const snap = await DOC_REF.get();
        if (snap.exists) {
            const data = snap.data();
            // Garante que campos novos (op_t1/op_t2) existam mesmo em docs antigos
            Object.keys(DEFAULTS.familias).forEach(key => {
                if (data.familias?.[key]) {
                    data.familias[key].op_t1 = data.familias[key].op_t1 ?? DEFAULTS.familias[key].op_t1;
                    data.familias[key].op_t2 = data.familias[key].op_t2 ?? DEFAULTS.familias[key].op_t2;
                    // compatibilidade: se ainda tem campo "operadores" antigo, usa como op_t1
                    if (data.familias[key].operadores !== undefined && data.familias[key].op_t1 === DEFAULTS.familias[key].op_t1) {
                        data.familias[key].op_t1 = data.familias[key].operadores;
                    }
                }
            });
            return data;
        }
        await DOC_REF.set(DEFAULTS);
        return DEFAULTS;
    } catch (err) {
        console.error("Erro ao carregar configurações:", err);
        return DEFAULTS;
    }
}

// =======================================================
// RENDERIZAR O PAINEL
// =======================================================

function renderizarPainel(cfg) {

    const app      = document.getElementById("app");
    const familias = cfg.familias || DEFAULTS.familias;
    const ef       = (cfg.eficiencia || 80) / 100;
    const hSQT1    = cfg.horasSegQui_t1 || 9;
    const hSXT1    = cfg.horasSex_t1    || 8;
    const hSQT2    = cfg.horasSegQui_t2 || 8;
    const hSXT2    = cfg.horasSex_t2    || 7;

    // Capacidade diária média de toda a fábrica (seg-qui como referência)
    const capTotal = Object.entries(familias).reduce((s, [key, fam]) => {
        return s + calcCapDia(fam, hSQT1, hSQT2, ef);
    }, 0);

    const totalMaq   = Object.values(familias).reduce((s, f) => s + Number(f.maquinas || 0), 0);
    const totalOpT1  = Object.values(familias).reduce((s, f) => s + Number(f.op_t1    || 0), 0);
    const totalOpT2  = Object.values(familias).reduce((s, f) => s + Number(f.op_t2    || 0), 0);

    app.innerHTML = `

        <!-- RESUMO GERAL -->
        <div class="section-title">RESUMO GERAL DA FÁBRICA</div>
        <div class="preview-bar" id="previewBar">
            <div class="preview-item">
                <div class="pv-label">Total de Máquinas</div>
                <div class="pv-val" id="pv-maq" style="color:#00e6ff">${totalMaq}</div>
            </div>
            <div class="preview-item">
                <div class="pv-label">Operadores ☀️ T1</div>
                <div class="pv-val" id="pv-op1" style="color:#00ff88">${totalOpT1}</div>
            </div>
            <div class="preview-item">
                <div class="pv-label">Operadores 🌙 T2</div>
                <div class="pv-val" id="pv-op2" style="color:#c084fc">${totalOpT2}</div>
            </div>
            <div class="preview-item">
                <div class="pv-label">Cap. Total / Dia (seg-qui)</div>
                <div class="pv-val" id="pv-cap" style="color:#ffd600">${Math.round(capTotal).toLocaleString("pt-BR")}</div>
            </div>
            <div class="preview-item">
                <div class="pv-label">Eficiência</div>
                <div class="pv-val" id="pv-ef" style="color:#ff9800">${cfg.eficiencia || 80}%</div>
            </div>
        </div>

        <!-- JORNADA E EFICIÊNCIA -->
        <div class="section-title">JORNADA DE TRABALHO E EFICIÊNCIA</div>
        <div class="card-geral" style="margin-bottom:40px">

            <div class="cfg-item">
                <label>Eficiência Global (%)</label>
                <input type="number" id="cfg-eficiencia"
                    value="${cfg.eficiencia || 80}" min="1" max="100"
                    oninput="atualizarPreview()">
            </div>
            <div class="cfg-item">
                <label>☀️ Turno 1 — Seg a Qui (h)</label>
                <input type="number" id="cfg-t1-sq"
                    value="${hSQT1}" min="1" max="24"
                    oninput="atualizarPreview()">
            </div>
            <div class="cfg-item">
                <label>☀️ Turno 1 — Sexta (h)</label>
                <input type="number" id="cfg-t1-sex"
                    value="${hSXT1}" min="1" max="24"
                    oninput="atualizarPreview()">
            </div>
            <div class="cfg-item">
                <label>🌙 Turno 2 — Seg a Qui (h)</label>
                <input type="number" id="cfg-t2-sq"
                    value="${hSQT2}" min="1" max="24"
                    oninput="atualizarPreview()">
            </div>
            <div class="cfg-item">
                <label>🌙 Turno 2 — Sexta (h)</label>
                <input type="number" id="cfg-t2-sex"
                    value="${hSXT2}" min="1" max="24"
                    oninput="atualizarPreview()">
            </div>

        </div>

        <!-- FAMÍLIAS -->
        <div class="section-title">FAMÍLIAS DE MÁQUINAS</div>
        <div class="familias-grid">
            ${Object.entries(familias).map(([key, fam]) => {

                const cap = calcCapDia(fam, hSQT1, hSQT2, ef);

                return `
                <div class="familia-card">
                    <div class="fam-badge" style="background:${CORES_FAMILIA[key] || '#fff'}"></div>
                    <div class="fam-nome" style="color:${CORES_FAMILIA[key] || '#fff'}">${fam.nome}</div>

                    <div class="fam-cap-preview" id="cap-${key}">
                        Cap./dia: <strong>${Math.round(cap).toLocaleString("pt-BR")} impressões</strong>
                    </div>

                    <div class="fam-section-label">MÁQUINAS</div>
                    <div class="fam-campos" style="grid-template-columns:1fr">
                        <div class="fam-campo">
                            <label>Qtd. Máquinas</label>
                            <input type="number" id="fam-${key}-maquinas"
                                value="${fam.maquinas}" min="0"
                                style="color:${CORES_FAMILIA[key] || '#fff'}"
                                oninput="atualizarPreview()">
                        </div>
                    </div>

                    <div class="fam-section-label">OPERADORES POR TURNO</div>
                    <div class="fam-campos" style="grid-template-columns:1fr 1fr">
                        <div class="fam-campo">
                            <label>☀️ Turno 1</label>
                            <input type="number" id="fam-${key}-op_t1"
                                value="${fam.op_t1 ?? 0}" min="0"
                                style="color:#00ff88"
                                oninput="atualizarPreview()">
                        </div>
                        <div class="fam-campo">
                            <label>🌙 Turno 2</label>
                            <input type="number" id="fam-${key}-op_t2"
                                value="${fam.op_t2 ?? 0}" min="0"
                                style="color:#c084fc"
                                oninput="atualizarPreview()">
                        </div>
                    </div>

                    <div class="fam-section-label">PRODUTIVIDADE</div>
                    <div class="fam-campos" style="grid-template-columns:1fr">
                        <div class="fam-campo">
                            <label>Meta P/H por máquina</label>
                            <input type="number" id="fam-${key}-metaHora"
                                value="${fam.metaHora}" min="1"
                                style="color:#ffd600"
                                oninput="atualizarPreview()">
                        </div>
                    </div>
                </div>`;

            }).join("")}
        </div>

        <!-- BOTÕES -->
        <div class="acoes">
            <button class="btn-salvar" onclick="salvarConfiguracoes()">💾 SALVAR CONFIGURAÇÕES</button>
            <button class="btn-reset"  onclick="restaurarPadroes()">↩️ RESTAURAR PADRÕES</button>
        </div>
        <div id="msg"></div>
    `;
}

// =======================================================
// CAPACIDADE DIÁRIA DE UMA FAMÍLIA (seg-qui como base)
// cap = [ min(maq, op_t1) × hT1  +  min(maq, op_t2) × hT2 ]
//       × meta × eficiência
// =======================================================

function calcCapDia(fam, hT1, hT2, ef) {
    const maq  = Number(fam.maquinas || 0);
    const opT1 = Number(fam.op_t1   || 0);
    const opT2 = Number(fam.op_t2   || 0);
    const meta = Number(fam.metaHora || 0);
    const ativasT1 = Math.min(maq, opT1);
    const ativasT2 = Math.min(maq, opT2);
    return (ativasT1 * hT1 + ativasT2 * hT2) * meta * ef;
}

// =======================================================
// PREVIEW EM TEMPO REAL
// =======================================================

function atualizarPreview() {

    const ef   = (Number(document.getElementById("cfg-eficiencia")?.value) || 80) / 100;
    const hSQT1 = Number(document.getElementById("cfg-t1-sq")?.value)  || 9;
    const hSXT1 = Number(document.getElementById("cfg-t1-sex")?.value) || 8;
    const hSQT2 = Number(document.getElementById("cfg-t2-sq")?.value)  || 8;
    const hSXT2 = Number(document.getElementById("cfg-t2-sex")?.value) || 7;

    const keys = Object.keys(DEFAULTS.familias);

    let totalMaq = 0, totalOpT1 = 0, totalOpT2 = 0, capTotal = 0;

    keys.forEach(key => {
        const maq  = Number(document.getElementById(`fam-${key}-maquinas`)?.value) || 0;
        const opT1 = Number(document.getElementById(`fam-${key}-op_t1`)?.value)    || 0;
        const opT2 = Number(document.getElementById(`fam-${key}-op_t2`)?.value)    || 0;
        const meta = Number(document.getElementById(`fam-${key}-metaHora`)?.value) || 0;

        totalMaq  += maq;
        totalOpT1 += opT1;
        totalOpT2 += opT2;

        const fam = { maquinas: maq, op_t1: opT1, op_t2: opT2, metaHora: meta };
        const cap = calcCapDia(fam, hSQT1, hSQT2, ef);
        capTotal += cap;

        // Atualiza preview individual do card
        const elCap = document.getElementById(`cap-${key}`);
        if (elCap) elCap.innerHTML = `Cap./dia: <strong>${Math.round(cap).toLocaleString("pt-BR")} impressões</strong>`;
    });

    document.getElementById("pv-maq").innerText  = totalMaq;
    document.getElementById("pv-op1").innerText  = totalOpT1;
    document.getElementById("pv-op2").innerText  = totalOpT2;
    document.getElementById("pv-cap").innerText  = Math.round(capTotal).toLocaleString("pt-BR");
    document.getElementById("pv-ef").innerText   = Math.round(ef * 100) + "%";
}

// =======================================================
// SALVAR NO FIRESTORE
// =======================================================

async function salvarConfiguracoes() {

    const btn = document.querySelector(".btn-salvar");
    btn.disabled = true;
    btn.innerText = "SALVANDO...";

    try {
        const keys = Object.keys(DEFAULTS.familias);
        const familias = {};

        keys.forEach(key => {
            familias[key] = {
                nome:     DEFAULTS.familias[key].nome,
                maquinas: Number(document.getElementById(`fam-${key}-maquinas`).value) || 0,
                op_t1:    Number(document.getElementById(`fam-${key}-op_t1`).value)    || 0,
                op_t2:    Number(document.getElementById(`fam-${key}-op_t2`).value)    || 0,
                metaHora: Number(document.getElementById(`fam-${key}-metaHora`).value) || 0
            };
        });

        const novaConfig = {
            eficiencia:     Number(document.getElementById("cfg-eficiencia").value) || 80,
            horasSegQui_t1: Number(document.getElementById("cfg-t1-sq").value)      || 9,
            horasSex_t1:    Number(document.getElementById("cfg-t1-sex").value)     || 8,
            horasSegQui_t2: Number(document.getElementById("cfg-t2-sq").value)      || 8,
            horasSex_t2:    Number(document.getElementById("cfg-t2-sex").value)     || 7,
            familias,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };

        await DOC_REF.set(novaConfig);
        mostrarMensagem("✅ CONFIGURAÇÕES SALVAS — todo o sistema usará os novos valores.", "#00ff88");

    } catch (err) {
        console.error(err);
        mostrarMensagem("❌ ERRO AO SALVAR. Verifique a conexão.", "#ff2222");
    } finally {
        btn.disabled = false;
        btn.innerText = "💾 SALVAR CONFIGURAÇÕES";
    }
}

// =======================================================
// RESTAURAR PADRÕES
// =======================================================

async function restaurarPadroes() {
    if (!confirm("Restaurar todos os valores para o padrão de fábrica?")) return;
    await DOC_REF.set(DEFAULTS);
    mostrarMensagem("↩️ PADRÕES RESTAURADOS.", "#ffd600");
    const cfg = await carregarConfiguracoes();
    renderizarPainel(cfg);
}

// =======================================================
// MENSAGEM
// =======================================================

function mostrarMensagem(texto, cor = "#00e6ff") {
    const el = document.getElementById("msg");
    if (!el) return;
    el.style.color = cor;
    el.innerText   = texto;
    setTimeout(() => { el.innerText = ""; }, 4000);
}
