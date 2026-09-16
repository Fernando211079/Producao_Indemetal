// =============================================================
// INDEMETAL — Carga das Máquinas
// Visão geral: mini-cards por família (clicável)
// Visão detalhada: tela cheia da família selecionada
// Capacidade usa: min(maq, op_t1)×hT1 + min(maq, op_t2)×hT2
// Integra: manutenção (desconta horas) e horas extras (adiciona)
// =============================================================

const CORES = {
    rotativa:          "#00e6ff",
    semiautomatica:    "#ff9800",
    paralela:          "#00ff88",
    manual:            "#ff4444",
    "sala-limpa":      "#c084fc",
    "adesivo-liquido": "#ffd600"
};

// família atualmente selecionada
let familiaSelecionada = null;
let _calendarioInstancia = null; // instância do CalendarioCarga ativo
// dados globais carregados
let dadosGlobais = { grupos: {}, ops: [] };
// ajustes de capacidade por família (horas líquidas de manut. e extras)
// positivo = ganho, negativo = perda
let ajustesHoras = {};

// =============================================================
// INICIALIZAÇÃO
// =============================================================

document.addEventListener("DOMContentLoaded", carregarTudo);

async function carregarTudo() {

    document.getElementById("selecaoWrap").innerHTML =
        '<div class="loading-mini">CARREGANDO...</div>';
    document.getElementById("detalheWrap").innerHTML =
        '<div class="detalhe-placeholder">← Selecione uma família acima para ver o detalhe completo</div>';

    await CONFIG_PRONTO;

    // Carrega tudo em paralelo
    const [snapOps, snapManut, snapExtras] = await Promise.all([
        db.collection("ops").where("status", "==", "ABERTA").get(),
        db.collection("manutencao").get(),
        db.collection("horas_extra").get()
    ]);

    const ops = [];
    snapOps.forEach(doc => ops.push({ id: doc.id, ...doc.data() }));

    // Calcula ajustes de horas (manutenção e extras) por família
    ajustesHoras = calcularAjustesHoras(snapManut, snapExtras);

    // Calcula e guarda tudo globalmente
    dadosGlobais = calcularGrupos(ops);

    renderizarKPIs(ops, dadosGlobais.grupos);
    renderizarMiniCards(dadosGlobais.grupos);

    // Se já tinha uma família selecionada (ex: após atualizar), mantém
    if (familiaSelecionada) {
        selecionarFamilia(familiaSelecionada);
    }

}

// =============================================================
// AJUSTES DE HORAS (Manutenção − e Horas Extras +)
// Retorna um objeto { familia: { extras, manut } } com horas
// acumuladas no mês corrente para cada família.
// =============================================================

function calcularAjustesHoras(snapManut, snapExtras) {

    // Cada família guarda { extras: horas, manut: horas } separadamente
    const ajustes = {};
    Object.keys(CONFIG.familias).forEach(k => { ajustes[k] = { extras: 0, manut: 0 }; });

    // Janela = mês corrente inteiro (do dia 1 ao último dia do mês)
    const agora     = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fimMes    = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);

    snapManut.forEach(doc => {
        const r = doc.data();
        if (!r.familia || !(r.familia in ajustes)) return;
        if (r.dtFim) {
            const dtFim = new Date(r.dtFim);
            if (dtFim >= inicioMes && dtFim <= fimMes) {
                ajustes[r.familia].manut += Number(r.horasDescontadas || 0);
            }
        }
    });

    snapExtras.forEach(doc => {
        const r = doc.data();
        if (!r.familia || !(r.familia in ajustes)) return;
        if (r.data) {
            const dtExtra = new Date(r.data + "T00:00:00");
            if (dtExtra >= inicioMes && dtExtra <= fimMes) {
                ajustes[r.familia].extras += Number(r.horas || 0);
            }
        }
    });

    return ajustes;

}

// =============================================================
// CÁLCULO DOS GRUPOS
// totalDias = ceil(totalHoras / horas produtivas por dia da família)
// Assim não acumula erros de arredondamento por OP
// =============================================================

function calcularGrupos(ops) {

    const grupos = {};

    Object.keys(CONFIG.familias).forEach(key => {
        grupos[key] = { ops: [], totalImpressoes: 0, totalHoras: 0, totalDias: 0 };
    });

    ops.forEach(op => {
        const key  = op.familia;
        if (!grupos[key]) return;
        const imp   = Number(op.impressoes || 0);
        const horas = calcularHoras(imp, key);
        // dias individuais para sequenciamento na tabela
        const dias  = calcularDias(imp, key);
        grupos[key].ops.push({ ...op, _horas: horas, _dias: dias });
        grupos[key].totalImpressoes += imp;
        grupos[key].totalHoras      += horas;
    });

    // Recalcula dias a partir do total de horas (evita soma de ceil())
    Object.keys(grupos).forEach(key => {
        const horasPorDia = horasProdutivas(key); // horas reais que a família produz por dia
        grupos[key].totalDias = horasPorDia > 0
            ? Math.ceil(grupos[key].totalHoras / horasPorDia)
            : 0;
    });

    return { grupos, ops };

}

// Horas produtivas por dia de uma família (T1 + T2, média seg-sex)
// Diferente de configCapDia: aqui não multiplicamos pela meta,
// queremos quantas horas-máquina a família tem por dia.
function horasProdutivas(familiaKey) {
    const fam = CONFIG.familias[familiaKey];
    if (!fam) return 0;
    // média: 4 dias seg-qui + 1 sexta
    const hT1sq  = CONFIG.turnos[1].horasSegQui;
    const hT1sex = CONFIG.turnos[1].horasSex;
    const hT2sq  = CONFIG.turnos[2].horasSegQui;
    const hT2sex = CONFIG.turnos[2].horasSex;
    const maq  = Number(fam.maquinas  || 0);
    const opT1 = Number(fam.op_t1     || 0);
    const opT2 = Number(fam.op_t2     || 0);
    const atT1 = Math.min(maq, opT1);
    const atT2 = Math.min(maq, opT2);
    const diaSQ  = atT1 * hT1sq  + atT2 * hT2sq;
    const diaSex = atT1 * hT1sex + atT2 * hT2sex;
    return (diaSQ * 4 + diaSex) / 5; // média diária
}

// =============================================================
// KPIs GLOBAIS
// =============================================================

function renderizarKPIs(ops, grupos) {

    const totalOPs   = ops.length;
    const totalImp   = ops.reduce((s, o) => s + Number(o.impressoes || 0), 0);
    const sobre      = Object.keys(grupos).filter(k => grupos[k].totalDias > 30).length;
    const urgentes   = ops.filter(o =>
        o.prioridade === "Urgente" || o.prioridade === "Amostra"
    ).length;

    // Horas totais de toda a fábrica
    const totalHoras = Object.values(grupos).reduce((s, g) => s + g.totalHoras, 0);
    const hTot = Math.floor(totalHoras);
    const hMin = Math.round((totalHoras - hTot) * 60);
    const horasFmt = hTot > 0
        ? `${hTot}h${hMin > 0 ? ` ${String(hMin).padStart(2,"0")}min` : ""}`
        : "0h";

    document.getElementById("kpi-ops").innerText   = totalOPs;
    document.getElementById("kpi-imp").innerText   = totalImp.toLocaleString("pt-BR");
    document.getElementById("kpi-dias").innerText  = horasFmt;
    document.getElementById("kpi-sobre").innerText = sobre;
    document.getElementById("kpi-urg").innerText   = urgentes;

    const el = document.getElementById("kpi-dias");
    el.style.color = totalHoras > 600 ? "#ff4444" : totalHoras > 300 ? "#ffd600" : "#00ff88";

}

// =============================================================
// MINI-CARDS DE SELEÇÃO
// =============================================================

function renderizarMiniCards(grupos) {

    const familias = CONFIG.familias;
    const wrap     = document.getElementById("selecaoWrap");
    wrap.innerHTML   = "";

    Object.entries(familias).forEach(([key, fam]) => {

        const grupo     = grupos[key];
        const cor       = CORES[key] || "#fff";
        const horasCarga = grupo.totalHoras;
        const diasCarga  = grupo.totalDias;

        // Barra baseada em horas: referência = 20 dias × horas produtivas da família
        const hPorDia   = horasProdutivas(key);
        const horasBase = hPorDia * 20;
        const pct       = horasBase > 0
            ? Math.min(Math.round((horasCarga / horasBase) * 100), 100)
            : 0;

        const nivel    = pct >= 100 ? "danger" : pct >= 70 ? "warning" : "ok";
        const corBarra = nivel === "danger" ? "#ff4444" : nivel === "warning" ? "#ffd600" : "#00ff88";

        // Formata horas totais: ex 42.75 → "42h 45min"
        const hTot  = Math.floor(horasCarga);
        const hMin  = Math.round((horasCarga - hTot) * 60);
        const horasFmt = horasCarga > 0
            ? `${hTot}h${hMin > 0 ? ` ${String(hMin).padStart(2,"0")}min` : ""}`
            : "0h";

        const aj      = ajustesHoras[key] || { extras: 0, manut: 0 };
        const extrasH = aj.extras || 0;
        const manutH  = aj.manut  || 0;

        // Formata badge de extras
        const exH   = Math.floor(extrasH);
        const exMin = Math.round((extrasH - exH) * 60);
        const extrasFmt = extrasH > 0
            ? `+${exH}h${exMin > 0 ? String(exMin).padStart(2,"0") + "min" : ""}`
            : "";

        // Formata badge de manutenção
        const mnH   = Math.floor(manutH);
        const mnMin = Math.round((manutH - mnH) * 60);
        const manutFmt = manutH > 0
            ? `${mnH}h${mnMin > 0 ? String(mnMin).padStart(2,"0") + "min" : ""}`
            : "";

        const badgeExtra = extrasH > 0
            ? `<div class="mini-extras">⏱ ${extrasFmt} extras este mês</div>`
            : "";

        const badgeManut = manutH > 0
            ? `<div class="mini-manut">🔧 ${manutFmt} parada este mês</div>`
            : "";

        const ativo = familiaSelecionada === key ? " mini-ativo" : "";

        const card = document.createElement("div");
        card.className = `mini-card${ativo}`;
        card.dataset.key = key;
        card.style.setProperty("--cor", cor);

        card.innerHTML = `
            <div class="mini-top">
                <div class="mini-dot" style="background:${cor}"></div>
                <div class="mini-nome" style="color:${cor}">${fam.nome.toUpperCase()}</div>
            </div>
            <div class="mini-horas" style="color:${corBarra}">${horasFmt}</div>
            <div class="mini-dias-label">${diasCarga} dia${diasCarga !== 1 ? "s" : ""} comprometido${diasCarga !== 1 ? "s" : ""}</div>
            <div class="mini-barra-bg">
                <div class="mini-barra-fill" style="width:${pct}%;background:${corBarra}"></div>
            </div>
            <div class="mini-rodape">
                <span style="color:var(--text-3)">${fam.maquinas} máq. · ${grupo.ops.length} OPs</span>
                <span style="color:${corBarra};font-weight:700">${pct}%</span>
            </div>
            ${badgeExtra}
            ${badgeManut}
        `;

        card.addEventListener("click", () => selecionarFamilia(key));
        wrap.appendChild(card);

    });

}

// =============================================================
// SELECIONAR FAMÍLIA → renderiza detalhe em tela cheia
// =============================================================

function selecionarFamilia(key) {

    familiaSelecionada = key;

    // Atualiza estado ativo dos mini-cards
    document.querySelectorAll(".mini-card").forEach(el => {
        el.classList.toggle("mini-ativo", el.dataset.key === key);
    });

    const fam   = CONFIG.familias[key];
    const grupo = dadosGlobais.grupos[key];
    const cor        = CORES[key] || "#fff";
    const hoje       = new Date();
    hoje.setHours(0, 0, 0, 0);

    const horasCarga = grupo.totalHoras;
    const diasCarga  = grupo.totalDias;
    const capDia     = Math.round(capacidadeDiaria(key));

    // Ajuste de horas (manutenção / extras) — agora separados
    const aj_det   = ajustesHoras[key] || { extras: 0, manut: 0 };
    const extH_det = aj_det.extras || 0;
    const mnH_det  = aj_det.manut  || 0;
    const fam_     = CONFIG.familias[key];
    const metaReal = fam_ ? fam_.metaHora * CONFIG.eficiencia : 0;

    const DIAS_BASE  = 20;
    const pct        = Math.min(Math.round((diasCarga / DIAS_BASE) * 100), 999);
    const nivel      = pct >= 100 ? "danger" : pct >= 70 ? "warning" : "ok";
    const corBarra   = nivel === "danger" ? "#ff4444" : nivel === "warning" ? "#ffd600" : "#00ff88";
    const dataConc   = diasCarga > 0
        ? adicionarDiasUteis(hoje, diasCarga).toLocaleDateString("pt-BR")
        : "--";

    const labelNivel = nivel === "danger"  ? "⚠️ SOBRECARREGADA"
                     : nivel === "warning" ? "⚡ ATENÇÃO"
                     :                       "✅ NORMAL";

    // Badges de ajuste — ambos aparecem se existirem, independentemente um do outro
    let badgeAjuste = "";
    if (mnH_det > 0) {
        const impManut = Math.round(mnH_det * metaReal);
        badgeAjuste += `<div style="margin-top:6px;font-size:0.72rem;color:#ff8c00">
            🔧 <strong>${mnH_det.toFixed(1)}h</strong> de manutenção este mês
            (−${impManut.toLocaleString("pt-BR")} impressões descontadas)
        </div>`;
    }
    if (extH_det > 0) {
        const impExtras = Math.round(extH_det * metaReal);
        badgeAjuste += `<div style="margin-top:6px;font-size:0.72rem;color:#00ff88">
            ⏱ <strong>+${extH_det.toFixed(1)}h</strong> de horas extras este mês
            (+${impExtras.toLocaleString("pt-BR")} impressões adicionais)
        </div>`;
    }

    // Ordena por data de entrega mais próxima (igual à tabela de cadastro-op)
    // OPs sem prazo vão para o final
    const opsOrdenadas = [...grupo.ops].sort((a, b) => {
        if (!a.prazo && !b.prazo) return 0;
        if (!a.prazo) return 1;
        if (!b.prazo) return -1;
        return a.prazo.localeCompare(b.prazo);
    });

    const msUmDia = 24 * 60 * 60 * 1000;

    const linhas = opsOrdenadas.length > 0
        ? opsOrdenadas.map(op => {

            const atrasada = op.prazo && new Date(op.prazo + "T00:00:00") < hoje;

            // ── OP / PRAZO ──
            const prazoFmt = op.prazo
                ? new Date(op.prazo + "T00:00:00").toLocaleDateString("pt-BR")
                : "--";
            const alertaPrazo = (!atrasada) ? ""
                : ` <span style="color:#ef4444;font-size:11px;font-weight:bold">⚠️ ATRASADA</span>`;

            // ── HORAS NECESSÁRIAS ──
            let horasTxt = "--";
            if (op.impressoes && op.familia && CONFIG.familias[op.familia]) {
                const fam_     = CONFIG.familias[op.familia];
                const metaReal = fam_.metaHora * CONFIG.eficiencia;
                if (metaReal > 0) {
                    const h    = op.impressoes / metaReal;
                    const hInt = Math.floor(h);
                    const hMin = Math.round((h - hInt) * 60);
                    horasTxt   = `${hInt}h${hMin > 0 ? ` ${String(hMin).padStart(2,"0")}min` : ""}`;
                }
            }

            // ── FINALIZAR ATÉ = prazo − 8 dias corridos ──
            let finalizarTxt = "--";
            let finalizarCor = "inherit";
            if (op.prazo) {
                const dataFinalizar = new Date(op.prazo + "T00:00:00");
                dataFinalizar.setDate(dataFinalizar.getDate() - 8);
                finalizarTxt = dataFinalizar.toLocaleDateString("pt-BR");
                finalizarCor = dataFinalizar < hoje ? "#ef4444" : "#ffd600";
            }

            // ── FOLGA ATÉ O PRAZO ──
            let folgaTxt = "--";
            let folgaCor = "inherit";
            if (op.prazo) {
                const dataFinalizar = new Date(op.prazo + "T00:00:00");
                dataFinalizar.setDate(dataFinalizar.getDate() - 8);
                const folgaDias = Math.round((dataFinalizar - hoje) / msUmDia);
                if (folgaDias > 0) {
                    folgaTxt = `${folgaDias} dia(s)`;
                    folgaCor = folgaDias >= 5 ? "#00c853" : "#ffd600";
                } else if (folgaDias === 0) {
                    folgaTxt = "HOJE";
                    folgaCor = "#ffd600";
                } else {
                    folgaTxt = `−${Math.abs(folgaDias)} dia(s)`;
                    folgaCor = "#ef4444";
                }
            }

            // ── PRIORIDADE ──
            const corPrio = op.prioridade === "Amostra" ? "#ef4444"
                          : op.prioridade === "Urgente"    ? "#f59e0b"
                          :                                  "#6b7280";

            // ── STATUS ──
            const corStatus   = op.status === "FINALIZADA" ? "#22c55e" : "#3b82f6";
            const labelStatus = op.status === "FINALIZADA" ? "FINALIZADA" : "ABERTA";

            // ── FAMÍLIA (nome legível) ──
            const famNome = CONFIG.familias[op.familia]?.nome || op.familia;

            return `
            <tr class="${atrasada ? "linha-atrasada" : ""}">
                <td class="td-op"><strong>${op.op}</strong></td>
                <td>${op.cliente}</td>
                <td>${op.produto || "--"}</td>
                <td>${famNome}</td>
                <td style="text-align:right">${Number(op.impressoes).toLocaleString("pt-BR")}</td>
                <td style="font-weight:700;color:#00e6ff;text-align:center">${horasTxt}</td>
                <td style="${atrasada ? "color:#ef4444;font-weight:700" : ""}">${prazoFmt}${alertaPrazo}</td>
                <td style="color:${finalizarCor};font-weight:700">${finalizarTxt}</td>
                <td style="color:${folgaCor};font-weight:700">${folgaTxt}</td>
                <td><span style="background:${corPrio};color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${op.prioridade}</span></td>
                <td><span style="background:${corStatus};color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${labelStatus}</span></td>
            </tr>`;

        }).join("")
        : `<tr><td colspan="11" class="td-vazio">Nenhuma OP em aberto para esta família</td></tr>`;

    const wrap = document.getElementById("detalheWrap");
    wrap.innerHTML = `
    <div class="detalhe-card">

        <!-- CABEÇALHO DO DETALHE -->
        <div class="det-header" style="border-color:${cor}">
            <div class="det-header-esq">
                <div class="det-dot" style="background:${cor}"></div>
                <div>
                    <div class="det-nome" style="color:${cor}">${fam.nome.toUpperCase()}</div>
                    <div class="det-nivel" style="color:${corBarra}">${labelNivel}</div>
                    ${badgeAjuste}
                </div>
            </div>
            <div class="det-header-dir">
                <div class="det-kpi">
                    <div class="det-kpi-val">${fam.maquinas}</div>
                    <div class="det-kpi-label">MÁQUINAS</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#00ff88">${fam.op_t1 ?? "--"}</div>
                    <div class="det-kpi-label">OP. ☀️ T1</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#c084fc">${fam.op_t2 ?? "--"}</div>
                    <div class="det-kpi-label">OP. 🌙 T2</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:${cor}">${fam.metaHora}</div>
                    <div class="det-kpi-label">META P/H</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#aaa">${capDia.toLocaleString("pt-BR")}</div>
                    <div class="det-kpi-label">CAP./DIA</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:${corBarra}">${horasCarga % 1 === 0 ? horasCarga : horasCarga.toFixed(1)}h</div>
                    <div class="det-kpi-label">HORAS COMP.</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:${corBarra}">${diasCarga} dias</div>
                    <div class="det-kpi-label">DIAS COMP.</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#aaa">${diasCarga > 0 ? (horasCarga / diasCarga).toFixed(1) + "h" : "--"}</div>
                    <div class="det-kpi-label">MÉD. H/DIA</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#aaa">${grupo.ops.length}</div>
                    <div class="det-kpi-label">OPs ABERTAS</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#aaa">${grupo.totalImpressoes.toLocaleString("pt-BR")}</div>
                    <div class="det-kpi-label">IMPRESSÕES</div>
                </div>
                <div class="det-kpi">
                    <div class="det-kpi-val" style="color:#00ff88">${dataConc}</div>
                    <div class="det-kpi-label">CONCLUSÃO PREV.</div>
                </div>
            </div>
        </div>

        <!-- BARRA DE CARGA -->
        <div class="det-barra-wrap">
            <div class="det-barra-labels">
                <span>CARGA DA FILA (base: 20 dias úteis = 1 mês)</span>
                <span style="color:${corBarra};font-weight:700">${pct}%${pct >= 100 ? " — CAPACIDADE EXCEDIDA" : ""}</span>
            </div>
            <div class="det-barra-bg">
                <div class="det-barra-fill" style="width:${Math.min(pct,100)}%;background:${corBarra}"></div>
                <div class="det-barra-mark" style="left:70%">70%</div>
                <div class="det-barra-mark" style="left:100%">100%</div>
            </div>
        </div>

        <!-- CALENDÁRIO DE CARGA -->
        <div id="det-calendario" class="det-calendario"></div>

        <!-- TABELA DE OPs DA FAMÍLIA -->
        <div class="det-tabela-titulo" style="border-color:${cor}">
            <span style="color:${cor}">● ${fam.nome.toUpperCase()}</span>
            — ORDENS DE PRODUÇÃO EM ABERTO
            <span style="color:#7a7a7a;font-size:0.72rem;font-weight:400;margin-left:8px">${opsOrdenadas.length} OP${opsOrdenadas.length !== 1 ? "s" : ""} na fila · ordenadas por prioridade e prazo</span>
        </div>
        <div class="det-tabela-wrap">
            <table class="det-tabela">
                <thead>
                    <tr>
                        <th>OP</th>
                        <th>CLIENTE</th>
                        <th>PRODUTO</th>
                        <th>FAMÍLIA</th>
                        <th>IMPRESSÕES</th>
                        <th>HORAS NECES.</th>
                        <th>PRAZO DE ENTREGA</th>
                        <th>FINALIZAR ATÉ</th>
                        <th>FOLGA ATÉ O PRAZO</th>
                        <th>PRIORIDADE</th>
                        <th>STATUS</th>
                    </tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>

    </div>`;

    // Monta o calendário filtrado pela família selecionada
    const containerCal = document.getElementById("det-calendario");
    _calendarioInstancia = new CalendarioCarga(
        containerCal,
        dadosGlobais.ops,
        key
    );
    _calendarioInstancia.renderizar();

    // Scroll suave até o detalhe
    wrap.scrollIntoView({ behavior: "smooth", block: "start" });

}

// =============================================================
// CÁLCULO DE HORAS NECESSÁRIAS PARA UMA OP
// impressões ÷ (meta P/H × eficiência) = horas brutas
// =============================================================

function calcularHoras(impressoes, familiaKey) {

    const fam = CONFIG.familias[familiaKey];
    if (!fam || impressoes <= 0) return 0;
    const metaReal = fam.metaHora * CONFIG.eficiencia;
    if (metaReal <= 0) return 0;
    return impressoes / metaReal; // horas decimais

}

// =============================================================
// CÁLCULO DE DIAS PARA UMA OP
// Usa capacidade média diária real (T1 + T2, seg-qui + sexta)
// =============================================================

function calcularDias(impressoes, familiaKey) {

    const cap = configCapDiaMedia(familiaKey); // impressões/dia
    if (cap <= 0 || impressoes <= 0) return 0;
    return Math.ceil(impressoes / cap);

}

// =============================================================
// CAPACIDADE DIÁRIA DA FAMÍLIA (seg-qui, para exibição)
// =============================================================

function capacidadeDiaria(familiaKey) {
    return configCapDia(familiaKey, false);
}

// =============================================================
// HELPER — adiciona N dias úteis
// =============================================================

function adicionarDiasUteis(base, dias) {

    if (dias <= 0) return new Date(base);
    const d = new Date(base);
    let count = 0;
    let limite = 3650;
    while (count < dias) {
        d.setDate(d.getDate() + 1);
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6) count++;
        if (--limite <= 0) break;
    }
    return d;

}
