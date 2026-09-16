// =============================================
// INDEMETAL — Cadastro de Ordem de Produção
// =============================================

document.addEventListener("DOMContentLoaded", iniciarSistema);

// OP em edição (null = nova OP)
let opEditando = null;

// =============================================
// CONSTANTES DE JORNADA
// Horas produtivas por dia por família
// (usa eficiência de 80% do CONFIG)
// =============================================

// Horas úteis médias por dia de trabalho (seg-qui 8h, sex 7h → média ~7.8h)
// Usamos 8h como base conservadora para o cálculo
const HORAS_DIA = 8;

// =============================================
// MARGEM DE DIAS PARA "FINALIZAR ATÉ"
// Regras:
//   Urgente (qualquer família) → 3 dias antes do prazo
//   Adesivo Líquido            → 4 dias antes do prazo
//   Demais                     → 8 dias antes do prazo
// =============================================

function _diasMargem(prioridade, familiaKey) {
    if (prioridade === "Urgente" || prioridade === "Amostra") return 3;
    if (familiaKey === "adesivo-liquido") return 4;
    return 8;
}

// =============================================
// INICIALIZAÇÃO
// =============================================

async function iniciarSistema() {

    await CONFIG_PRONTO;

    // Só inicializa eventos e lista se estivermos na página de cadastro (tem #formOP)
    const ehCadastro = !!document.getElementById("formOP");

    if (ehCadastro) {
        iniciarEventos();
        listarOPs();
        // Se veio de baixa-op.html com ?editar=ID, carrega a OP no form
        const params   = new URLSearchParams(window.location.search);
        const editarId = params.get("editar");
        if (editarId) await editarOP(editarId);
    } else {
        // baixa-op.html — lista OPs + ativa pesquisa
        listarOPs();
        const campoPesquisa = document.getElementById("pesquisaOP");
        if (campoPesquisa) campoPesquisa.addEventListener("input", pesquisarOP);
    }

}

// =============================================
// EVENTOS
// =============================================

function iniciarEventos() {

    document.getElementById("quantidade")
        .addEventListener("input", calcularPrevisao);

    document.getElementById("cores")
        .addEventListener("input", calcularPrevisao);

    document.getElementById("familia")
        .addEventListener("change", () => {
            calcularPrevisao();
            _atualizarVisibilidadeAdesivo();
        });

    document.getElementById("prazo")
        .addEventListener("change", calcularPrevisao);

    document.getElementById("prioridade")
        .addEventListener("change", calcularPrevisao);

    document.getElementById("formOP")
        .addEventListener("submit", salvarOP);

    // Produto → sempre maiúsculo
    document.getElementById("produto")
        .addEventListener("input", function() {
            const pos = this.selectionStart;
            this.value = this.value.toUpperCase();
            this.setSelectionRange(pos, pos);
        });

    // Cliente → autocomplete com nomes já usados
    document.getElementById("cliente")
        .addEventListener("input", _mostrarSugestoesCliente);

    document.getElementById("cliente")
        .addEventListener("blur", () => {
            // pequeno delay para deixar o clique na sugestão ser processado
            setTimeout(_esconderSugestoes, 150);
        });

}

// =============================================
// AUTOCOMPLETE DE CLIENTE
// =============================================

function _mostrarSugestoesCliente() {
    const input  = document.getElementById("cliente");
    const lista  = document.getElementById("clienteSugestoes");
    const texto  = input.value.trim().toLowerCase();

    if (!texto) { _esconderSugestoes(); return; }

    // Coleta nomes únicos do cache, filtra pelo texto digitado
    const nomes = [...new Set(
        _opsCache
            .map(op => op.cliente)
            .filter(c => c && c.toLowerCase().includes(texto))
    )].slice(0, 8); // máximo 8 sugestões

    if (nomes.length === 0) { _esconderSugestoes(); return; }

    lista.innerHTML = nomes.map(nome => `
        <li onclick="_selecionarCliente('${nome.replace(/'/g, "\\'")}')"
            style="padding:10px 14px;cursor:pointer;font-size:0.72rem;color:#e0e0e0;
                   border-bottom:1px solid rgba(255,255,255,0.06);font-family:var(--font,'Orbitron'),sans-serif;
                   letter-spacing:0.5px"
            onmouseenter="this.style.background='rgba(0,242,255,0.1)'"
            onmouseleave="this.style.background=''">${nome}</li>
    `).join("");

    lista.style.display = "block";
}

function _selecionarCliente(nome) {
    document.getElementById("cliente").value = nome;
    _esconderSugestoes();
}

function _esconderSugestoes() {
    const lista = document.getElementById("clienteSugestoes");
    if (lista) { lista.style.display = "none"; lista.innerHTML = ""; }
}

// =============================================
// CÁLCULO DE PREVISÃO (painel inteligente)
// =============================================

function calcularPrevisao() {

    const familiaKey = document.getElementById("familia").value;
    const quantidade  = Number(document.getElementById("quantidade").value) || 0;
    const cores       = Number(document.getElementById("cores").value) || 0;
    const prazo       = document.getElementById("prazo").value;
    const prioridade  = document.getElementById("prioridade")?.value || "Normal";

    // Calcula impressões
    const totalImpressoes = quantidade * cores;
    document.getElementById("impressoes").value =
        totalImpressoes > 0 ? totalImpressoes.toLocaleString("pt-BR") : "";

    // Sem família ou sem impressões → limpa painel
    if (!familiaKey || totalImpressoes === 0) {
        limparPainel();
        document.getElementById("tempoEstimado").value   = "";
        document.getElementById("diasNecessarios").value = "";
        return;
    }

    const familia = CONFIG.familias[familiaKey];
    if (!familia) { limparPainel(); return; }

    // Horas necessárias usando meta real da família (com eficiência)
    const metaReal         = familia.metaHora * CONFIG.eficiencia;
    const horasNecessarias = totalImpressoes / metaReal;

    // Dias necessários usando capacidade diária média real da família
    const capDiaMedia  = configCapDiaMedia(familiaKey); // impressões/dia
    const diasNecessarios = capDiaMedia > 0
        ? Math.ceil(totalImpressoes / capDiaMedia)
        : Math.ceil(horasNecessarias / HORAS_DIA);

    // Formata horas necessárias (h min)
    const horas   = Math.floor(horasNecessarias);
    const minutos = Math.round((horasNecessarias - horas) * 60);
    const tempoFmt = `${horas}h ${String(minutos).padStart(2, "0")}min`;

    // Preenche campos do formulário
    document.getElementById("tempoEstimado").value   = tempoFmt;
    document.getElementById("diasNecessarios").value = diasNecessarios + (diasNecessarios === 1 ? " dia" : " dias");

    // ── Alerta de conflito de capacidade ──────────────────────
    // Verifica se a fila atual da família já comprometeu o prazo
    _verificarConflito(familiaKey, diasNecessarios, prazo);

    // ── Demanda no dia da entrega ──────────────────────────────
    _atualizarDemandaDia(familiaKey, prazo, totalImpressoes);

    // Painel inteligente — fixos
    const capDiaSeg = Math.round(configCapDia(familiaKey, false));
    const capDiaSex = Math.round(configCapDia(familiaKey, true));

    document.getElementById("infoMaquina").innerText = familia.nome;
    document.getElementById("infoMeta").innerText    = `${familia.metaHora} P/H`;
    document.getElementById("infoCapDia").innerText  =
        `${capDiaSeg.toLocaleString("pt-BR")} imp.`;
    document.getElementById("infoCapDia").title =
        `Seg–Qui: ${capDiaSeg.toLocaleString("pt-BR")} · Sex: ${capDiaSex.toLocaleString("pt-BR")} impressões/dia`;
    document.getElementById("infoTempo").innerText   = tempoFmt;
    document.getElementById("infoDias").innerText    = diasNecessarios + (diasNecessarios === 1 ? " dia útil" : " dias úteis");

    const elEntrega = document.getElementById("infoEntrega");
    const elIniciar = document.getElementById("infoIniciar");
    const elFolga   = document.getElementById("infoFolga");
    const elStatus  = document.getElementById("infoStatus");

    if (prazo) {

        const dataPrazo = new Date(prazo + "T00:00:00");
        const hoje      = new Date();
        hoje.setHours(0, 0, 0, 0);

        // DATA DE ENTREGA — sempre exibe o prazo da OP
        elEntrega.innerText = dataPrazo.toLocaleDateString("pt-BR");

        // FINALIZAR ATÉ — margem variável por prioridade/família
        const margem = _diasMargem(prioridade, familiaKey);
        const dataFinalizar = new Date(dataPrazo);
        dataFinalizar.setDate(dataFinalizar.getDate() - margem);
        elIniciar.innerText = dataFinalizar.toLocaleDateString("pt-BR");

        // FOLGA — dias corridos entre hoje e a data limite de finalização
        const msUmDia   = 24 * 60 * 60 * 1000;
        const folgaDias = Math.round((dataFinalizar - hoje) / msUmDia);

        if (folgaDias > 0) {
            elFolga.innerText   = `${folgaDias} dia(s)`;
            elFolga.style.color = folgaDias >= 5 ? "#00c853" : "#ffd600";
        } else if (folgaDias === 0) {
            elFolga.innerText   = "FINALIZAR HOJE";
            elFolga.style.color = "#ffd600";
        } else {
            elFolga.innerText   = `PASSOU ${Math.abs(folgaDias)} dia(s)`;
            elFolga.style.color = "#ef5350";
        }

        // STATUS GERAL: a data de finalização (prazo − 8 dias) já passou?
        if (dataFinalizar >= hoje) {
            elStatus.innerText   = "✅ NO PRAZO";
            elStatus.style.color = "#00c853";
        } else {
            elStatus.innerText   = `⚠️ LIMITE ULTRAPASSADO`;
            elStatus.style.color = "#ef5350";
        }

    } else {

        elEntrega.innerText   = "--";
        elIniciar.innerText   = "--";
        elIniciar.style.color = "#ffd600";
        elFolga.innerText     = "--";
        elFolga.style.color   = "";
        elStatus.innerText    = "AGUARDANDO";
        elStatus.style.color  = "";

    }

}

// =============================================
// DEMANDA NO DIA DA ENTREGA
// Soma impressões de todas as OPs abertas da mesma
// família com o mesmo prazo + esta OP e compara
// com a capacidade diária da família naquele dia.
// =============================================

function _atualizarDemandaDia(familiaKey, prazo, impressoesEstaOP) {

    const elVal = document.getElementById("infoDemandaDia");
    const elSub = document.getElementById("infoDemandaDiaSub");
    if (!elVal) return;

    if (!prazo || !familiaKey) {
        elVal.innerText  = "--";
        elVal.style.color = "";
        elSub.textContent = "";
        return;
    }

    // Soma impressões de OPs abertas da mesma família com o mesmo prazo
    // (exclui a OP em edição para não contar duas vezes)
    const impFila = _opsCache
        .filter(op =>
            op.familia === familiaKey &&
            op.status  === "ABERTA"  &&
            op.prazo   === prazo     &&
            (!opEditando || op.id !== opEditando)
        )
        .reduce((acc, op) => acc + Number(op.impressoes || 0), 0);

    const totalDemanda = impFila + impressoesEstaOP;

    // Capacidade da família naquele dia específico (sexta = menor capacidade)
    const dataPrazo = new Date(prazo + "T00:00:00");
    const dow       = dataPrazo.getDay(); // 0=dom, 5=sex, 6=sab
    const isSexta   = (dow === 5);
    const capDia    = configCapDia(familiaKey, isSexta);

    const pct = capDia > 0 ? Math.round((totalDemanda / capDia) * 100) : 0;

    // Cor conforme ocupação
    let cor;
    if      (pct >= 100) cor = "#ef5350";       // vermelho — acima da capacidade
    else if (pct >= 80)  cor = "#ffd600";       // amarelo  — atenção
    else                 cor = "#00c853";       // verde    — tranquilo

    const outrasLabel = impFila > 0
        ? `+ ${impFila.toLocaleString("pt-BR")} já agendadas`
        : "nenhuma outra OP nesse dia";

    elVal.innerText   = `${totalDemanda.toLocaleString("pt-BR")} imp. (${pct}% cap.)`;
    elVal.style.color = cor;
    elSub.textContent = outrasLabel;

}

// =============================================
// HELPER — adiciona N dias úteis (pula sábado/domingo)
// =============================================

function adicionarDiasUteis(dataBase, dias) {

    const data = new Date(dataBase);
    let adicionados = 0;

    while (adicionados < dias) {
        data.setDate(data.getDate() + 1);
        const dow = data.getDay();
        if (dow !== 0 && dow !== 6) adicionados++;
    }

    return data;

}

// =============================================
// HELPER — subtrai N dias úteis (conta para trás)
// =============================================

function subtrairDiasUteis(dataBase, dias) {

    const data = new Date(dataBase);
    let subtraidos = 0;

    while (subtraidos < dias) {
        data.setDate(data.getDate() - 1);
        const dow = data.getDay();
        if (dow !== 0 && dow !== 6) subtraidos++;
    }

    return data;

}

// =============================================
// HELPER — conta dias úteis entre duas datas
// retorna positivo se dataFim está no futuro
// =============================================

function diasUteisEntre(dataInicio, dataFim) {

    const inicio = new Date(dataInicio);
    const fim    = new Date(dataFim);
    inicio.setHours(0, 0, 0, 0);
    fim.setHours(0, 0, 0, 0);

    if (inicio.getTime() === fim.getTime()) return 0;

    const avanca = fim > inicio;
    let count = 0;
    const cur = new Date(inicio);

    // Limite de segurança: máximo 3650 iterações (10 anos)
    let limite = 3650;

    while (avanca ? cur < fim : cur > fim) {
        cur.setDate(cur.getDate() + (avanca ? 1 : -1));
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) count++;
        if (--limite <= 0) break;
    }

    return avanca ? count : -count;

}

// =============================================
// ALERTA DE CONFLITO DE CAPACIDADE
// Exibe aviso no painel se a fila da família
// mais esta OP ultrapassar o prazo informado
// =============================================

function _verificarConflito(familiaKey, diasEstaOP, prazo) {
    const elStatus  = document.getElementById("infoStatus");
    const elConflito = document.getElementById("infoConflito");
    if (!elConflito) return;

    if (!prazo || !familiaKey) { elConflito.innerHTML = ""; return; }

    // Dias já comprometidos na fila (carregados em _opsCache)
    const diasFila = _opsCache
        .filter(op => op.familia === familiaKey && op.status === "ABERTA"
                   && (!opEditando || op.id !== opEditando))
        .reduce((acc, op) => {
            const imp = Number(op.impressoes || 0);
            const cap = configCapDiaMedia(familiaKey);
            return acc + (cap > 0 ? Math.ceil(imp / cap) : 0);
        }, 0);

    const totalDias = diasFila + diasEstaOP;
    const hoje      = new Date(); hoje.setHours(0,0,0,0);
    const dataPrazo = new Date(prazo + "T00:00:00");

    // Data prevista de conclusão (dias fila + esta OP)
    let cursor = new Date(hoje);
    let util = 0, limite = 1000;
    while (util < totalDias && limite-- > 0) {
        cursor.setDate(cursor.getDate() + 1);
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) util++;
    }

    if (cursor > dataPrazo) {
        const diffMs   = cursor - dataPrazo;
        const diffDias = Math.ceil(diffMs / (24*60*60*1000));
        elConflito.innerHTML = `⚠️ Fila da família tem ${diasFila} dia(s) comprometidos. Com esta OP, conclusão prevista em ${cursor.toLocaleDateString("pt-BR")} — <strong>${diffDias} dia(s) após o prazo.</strong>`;
        elConflito.style.color = "#ff4444";
    } else {
        const sobra = Math.round((dataPrazo - cursor) / (24*60*60*1000));
        elConflito.innerHTML = `✅ Cabe no prazo. Conclusão prevista: ${cursor.toLocaleDateString("pt-BR")} (${sobra} dia(s) de folga).`;
        elConflito.style.color = "#00c853";
    }
}

// Cache de OPs para pesquisa local (evita query extra ao Firestore)
let _opsCache = [];

// =============================================
// LIMPA PAINEL INTELIGENTE
// =============================================

function limparPainel() {

    ["infoMaquina","infoMeta","infoCapDia","infoTempo","infoDias","infoEntrega","infoIniciar","infoFolga"].forEach(id => {
        document.getElementById(id).innerText = "--";
        document.getElementById(id).style.color = "";
    });
    document.getElementById("infoIniciar").style.color = "#ffd600";
    document.getElementById("infoStatus").innerText    = "AGUARDANDO";
    document.getElementById("infoStatus").style.color  = "";
    const elConf = document.getElementById("infoConflito");
    if (elConf) elConf.innerHTML = "";
    const elDem = document.getElementById("infoDemandaDia");
    if (elDem) { elDem.innerText = "--"; elDem.style.color = ""; }
    const elSub = document.getElementById("infoDemandaDiaSub");
    if (elSub) elSub.textContent = "";

}

// =============================================
// CAMPOS DO FORMULÁRIO
// =============================================

function campos() {

    return {
        op:          document.getElementById("op"),
        cliente:     document.getElementById("cliente"),
        produto:     document.getElementById("produto"),
        familia:     document.getElementById("familia"),
        quantidade:  document.getElementById("quantidade"),
        cores:       document.getElementById("cores"),
        prazo:       document.getElementById("prazo"),
        prioridade:  document.getElementById("prioridade"),
        observacao:  document.getElementById("observacao")
    };

}

// =============================================
// VALIDAÇÃO
// =============================================

function validarFormulario() {

    const c = campos();

    if (!c.op.value.trim())       { mostrarMensagem("Informe a OP.");              c.op.focus();       return false; }
    if (!c.cliente.value.trim())  { mostrarMensagem("Informe o Cliente.");         c.cliente.focus();  return false; }
    if (!c.produto.value.trim())  { mostrarMensagem("Informe o Produto.");         c.produto.focus();  return false; }
    if (!c.familia.value)         { mostrarMensagem("Selecione a Família.");       c.familia.focus();  return false; }
    if (!c.quantidade.value)      { mostrarMensagem("Informe a Quantidade.");      c.quantidade.focus(); return false; }
    if (!c.cores.value)           { mostrarMensagem("Informe o número de cores."); c.cores.focus();    return false; }

    return true;

}

// =============================================
// MENSAGEM DE SISTEMA
// =============================================

function mostrarMensagem(texto) {

    const msg = document.getElementById("mensagemSistema");
    msg.innerHTML = texto;
    setTimeout(() => { msg.innerHTML = ""; }, 3500);

}

// =============================================
// SALVAR OP
// =============================================

// Mostra ou oculta o toggle de adesivo líquido conforme a família selecionada
function _atualizarVisibilidadeAdesivo() {
    const familia = document.getElementById("familia").value;
    const wrap    = document.getElementById("wrapAdesivo");
    if (!wrap) return;
    // Só exibe o toggle quando NÃO é adesivo-liquido nem está em branco
    if (familia && familia !== "adesivo-liquido") {
        wrap.style.display = "block";
    } else {
        wrap.style.display = "none";
        const cb = document.getElementById("temAdesivo");
        if (cb) cb.checked = false;
    }
}

async function salvarOP(e) {

    e.preventDefault();

    if (!validarFormulario()) return;

    try {

        const quantidade  = Number(document.getElementById("quantidade").value);
        const cores       = Number(document.getElementById("cores").value);
        const impressoes  = quantidade * cores;
        const familiaKey  = document.getElementById("familia").value;
        const temAdesivo  = document.getElementById("temAdesivo")?.checked && familiaKey !== "adesivo-liquido";

        const novaOP = {
            op:           document.getElementById("op").value.trim().toUpperCase(),
            cliente:      document.getElementById("cliente").value.trim(),
            produto:      document.getElementById("produto").value.trim(),
            familia:      familiaKey,
            quantidade:   quantidade,
            cores:        cores,
            impressoes:   impressoes,
            // diasNecessarios NÃO é salvo fixo — calculado sempre na hora de exibir
            prazo:        document.getElementById("prazo").value,
            prioridade:   document.getElementById("prioridade").value,
            observacao:   document.getElementById("observacao").value,
            status:       "ABERTA",
            dataCadastro: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (opEditando) {

            await db.collection("ops").doc(opEditando).update(novaOP);
            opEditando = null;
            document.getElementById("btnSalvar").innerText = "SALVAR ORDEM DE PRODUÇÃO";
            mostrarMensagem("✏️ OP atualizada com sucesso.");

        } else {

            await db.collection("ops").add(novaOP);

            // ── Adesivo Líquido automático ────────────────────────────
            if (temAdesivo) {
                const opAdesivoBase = novaOP.op;
                const opAdesivoNum  = opAdesivoBase + "-AL";
                const opAdesivo = {
                    op:           opAdesivoNum,
                    cliente:      novaOP.cliente,
                    produto:      novaOP.produto,
                    familia:      "adesivo-liquido",
                    quantidade:   novaOP.quantidade,
                    cores:        1,
                    impressoes:   novaOP.quantidade,   // cores = 1 → imp = qtd × 1
                    prazo:        novaOP.prazo,
                    prioridade:   novaOP.prioridade,
                    observacao:   novaOP.observacao
                                    ? novaOP.observacao + " [ADESIVO LÍQUIDO]"
                                    : "[ADESIVO LÍQUIDO]",
                    status:       "ABERTA",
                    dataCadastro: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection("ops").add(opAdesivo);
                mostrarMensagem("✅ OP cadastrada + Adesivo Líquido registrado automaticamente!");
            } else {
                mostrarMensagem("✅ Ordem cadastrada com sucesso.");
            }

        }

        document.getElementById("formOP").reset();
        document.getElementById("impressoes").value      = "";
        document.getElementById("tempoEstimado").value   = "";   // id mantido; label = "Horas Necessárias"
        document.getElementById("diasNecessarios").value = "";
        _atualizarVisibilidadeAdesivo();
        limparPainel();
        document.getElementById("op").focus();

        await listarOPs();

    } catch (error) {

        console.error(error);
        mostrarMensagem("❌ Erro ao salvar a Ordem de Produção.");

    }

}

// =============================================
// FILTRO DE STATUS ATIVO
// =============================================

let filtroStatusAtivo  = "ABERTA";
let filtroFamiliaAtivo = "TODAS";

function setFiltroStatus(status) {
    filtroStatusAtivo = status;
    document.querySelectorAll(".btn-filtro").forEach(btn => {
        btn.classList.toggle("ativo", btn.dataset.status === status);
    });
    document.getElementById("pesquisaOP").value = "";
    listarOPs();
}

function setFiltroFamilia(fam) {
    filtroFamiliaAtivo = fam;
    document.querySelectorAll(".chip-fam").forEach(btn => {
        btn.classList.toggle("ativo", btn.dataset.fam === fam);
    });
    document.getElementById("pesquisaOP").value = "";
    listarOPs();
}

// =============================================
// HELPER — monta uma linha da tabela
// =============================================

function montarLinha(doc) {

    const op  = doc.data();
    const id  = doc.id;

    const corPrioridade = {
        "Normal":     "#6b7280",
        "Urgente":    "#f59e0b",
        "Amostra":    "#ef4444"
    };
    const corP = corPrioridade[op.prioridade] || "#6b7280";

    const finalizada  = op.status === "FINALIZADA";
    const corStatus   = finalizada ? "#22c55e" : "#3b82f6";
    const labelStatus = finalizada ? "FINALIZADA" : "ABERTA";

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    // ── PRAZO formatado em pt-BR + alerta de atraso ──
    let prazoTxt = "--";
    let alertaPrazo = "";
    if (op.prazo) {
        const dataPrazo = new Date(op.prazo + "T00:00:00");
        prazoTxt = dataPrazo.toLocaleDateString("pt-BR");
        if (!finalizada && dataPrazo < hoje) {
            alertaPrazo = ` <span style="color:#ef4444;font-size:11px;font-weight:bold;">⚠️ ATRASADA</span>`;
        }
    }
    if (finalizada && op.dataFinalizacao) {
        const dtFin = op.dataFinalizacao.toDate
            ? op.dataFinalizacao.toDate().toLocaleDateString("pt-BR")
            : op.dataFinalizacao;
        prazoTxt += ` <span style="color:#22c55e;font-size:11px">✅ fin. ${dtFin}</span>`;
    }

    // ── HORAS NECESSÁRIAS (impressões ÷ meta × eficiência) ──
    let horasTxt = "--";
    if (op.impressoes && op.familia && CONFIG.familias[op.familia]) {
        const fam      = CONFIG.familias[op.familia];
        const metaReal = fam.metaHora * CONFIG.eficiencia;
        if (metaReal > 0) {
            const h    = op.impressoes / metaReal;
            const hInt = Math.floor(h);
            const hMin = Math.round((h - hInt) * 60);
            horasTxt   = `${hInt}h${hMin > 0 ? ` ${String(hMin).padStart(2,"0")}min` : ""}`;
        }
    }

    // ── FINALIZAR ATÉ — margem variável por prioridade/família ──
    const _marg = _diasMargem(op.prioridade, op.familia);
    let finalizarTxt = "--";
    let finalizarCor = "inherit";
    if (op.prazo) {
        const dataFinalizar = new Date(op.prazo + "T00:00:00");
        dataFinalizar.setDate(dataFinalizar.getDate() - _marg);
        finalizarTxt = dataFinalizar.toLocaleDateString("pt-BR");
        finalizarCor = dataFinalizar < hoje ? "#ef4444" : "#ffd600";
    }

    // ── FOLGA ATÉ O PRAZO = dias corridos entre hoje e "Finalizar até" ──
    let folgaTxt = "--";
    let folgaCor = "inherit";
    if (op.prazo && !finalizada) {
        const dataFinalizar = new Date(op.prazo + "T00:00:00");
        dataFinalizar.setDate(dataFinalizar.getDate() - _marg);
        const msUmDia   = 24 * 60 * 60 * 1000;
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

    // ── BOTÕES DE AÇÃO ──
    const btnAcao = finalizada
        ? `<button class="btnReabrir"   onclick="reabrirOP('${id}', '${op.op}')">↩ REABRIR</button>`
        : `<button class="btnFinalizar" onclick="finalizarOP('${id}', '${op.op}', '${op.cliente}')">✅ FINALIZAR</button>`;

    return `
        <tr class="${finalizada ? "linha-finalizada" : ""}">
            <td><strong>${op.op}</strong></td>
            <td>${op.cliente}</td>
            <td>${op.produto}</td>
            <td>${CONFIG.familias[op.familia]?.nome || op.familia}</td>
            <td>${Number(op.impressoes).toLocaleString("pt-BR")}</td>
            <td style="font-weight:bold;color:var(--cyan)">${horasTxt}</td>
            <td>${prazoTxt}${alertaPrazo}</td>
            <td style="color:${finalizarCor};font-weight:bold">${finalizarTxt}</td>
            <td style="color:${folgaCor};font-weight:bold">${folgaTxt}</td>
            <td><span style="background:${corP};color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold;">${op.prioridade}</span></td>
            <td><span style="background:${corStatus};color:#fff;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:bold;">${labelStatus}</span></td>
            <td style="white-space:nowrap">
                ${btnAcao}
                <button class="btnEditar"  onclick="editarOP('${id}')">✏️</button>
                <button class="btnExcluir" onclick="excluirOP('${id}')">🗑️</button>
            </td>
        </tr>
    `;
}

// =============================================
// LISTAR OPs + ATUALIZAR KPIs
// =============================================

async function listarOPs() {

    const tabela = document.getElementById("listaOP");

    // Sinaliza carregamento somente se a tabela existe (baixa-op.html)
    if (tabela) {
        tabela.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:24px;color:var(--text-3);font-size:0.85rem">Carregando...</td></tr>`;
    }

    try {

        const snapshot = await db.collection("ops")
            .orderBy("dataCadastro", "desc")
            .get();

        let totalOPs        = 0;
        let totalImpressoes = 0;
        let totalHoras      = 0;
        let urgentes        = 0;
        let html            = "";

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const msUmDia = 24 * 60 * 60 * 1000;

        function _folga(op) {
            if (!op.prazo) return 99999;
            const dataFinalizar = new Date(op.prazo + "T00:00:00");
            dataFinalizar.setDate(dataFinalizar.getDate() - _diasMargem(op.prioridade, op.familia));
            return Math.round((dataFinalizar - hoje) / msUmDia);
        }

        // Reconstrói o cache completo para uso na pesquisa local e no alerta de conflito
        _opsCache = [];
        const docs = [];

        snapshot.forEach(doc => {
            const op = doc.data();
            _opsCache.push({ id: doc.id, ...op });

            // KPIs sempre baseados nas abertas
            if (op.status === "ABERTA") {
                totalOPs++;
                totalImpressoes += Number(op.impressoes || 0);
                // Horas comprometidas: calcula em tempo real com a config atual
                if (op.familia && CONFIG.familias[op.familia]) {
                    const fam = CONFIG.familias[op.familia];
                    const metaR = fam.metaHora * CONFIG.eficiencia;
                    if (metaR > 0) totalHoras += Number(op.impressoes || 0) / metaR;
                }
                // Urgentes + atrasadas
                const atrasada = op.prazo && new Date(op.prazo + "T00:00:00") < hoje;
                if (op.prioridade === "Urgente" || op.prioridade === "Amostra" || atrasada) urgentes++;
            }

            // Aplica filtros para tabela (só quando ela existe)
            if (!tabela) return;
            if (filtroStatusAtivo !== "TODAS" && op.status !== filtroStatusAtivo) return;
            if (filtroFamiliaAtivo !== "TODAS" && op.familia !== filtroFamiliaAtivo) return;
            docs.push(doc);
        });

        // Renderiza tabela somente se ela existir
        if (tabela) {
            docs.sort((a, b) => {
                const opA = a.data(), opB = b.data();
                const fa = opA.status === "FINALIZADA" ? 99998 : _folga(opA);
                const fb = opB.status === "FINALIZADA" ? 99998 : _folga(opB);
                return fa - fb;
            });

            docs.forEach(doc => { html += montarLinha(doc); });

            tabela.innerHTML = html ||
                `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-3);font-size:0.85rem;font-family:var(--font)">
                    Nenhuma OP ${filtroStatusAtivo === "ABERTA" ? "em aberto" : filtroStatusAtivo === "FINALIZADA" ? "finalizada" : ""} encontrada.
                 </td></tr>`;
        }

        // Atualiza KPIs — funciona em cadastro-op.html e baixa-op.html
        const hTot = Math.floor(totalHoras);
        const hMin = Math.round((totalHoras - hTot) * 60);
        const horasFmt = hTot > 0
            ? `${hTot}h${hMin > 0 ? ` ${String(hMin).padStart(2,"0")}min` : ""}`
            : "0h";

        const elOps     = document.getElementById("kpiOps");
        const elImp     = document.getElementById("kpiImp");
        const elHoras   = document.getElementById("kpiHoras");
        const elUrg     = document.getElementById("kpiUrgentes");
        if (elOps)   elOps.innerHTML   = totalOPs;
        if (elImp)   elImp.innerHTML   = totalImpressoes.toLocaleString("pt-BR");
        if (elHoras) elHoras.innerHTML = horasFmt;
        if (elUrg)   elUrg.innerHTML   = urgentes;

    } catch (error) {
        console.error(error);
    }

}

// =============================================
// PESQUISA EM TEMPO REAL (respeita filtro ativo)
// =============================================

function pesquisarOP() {

    const texto = document.getElementById("pesquisaOP").value.toLowerCase().trim();

    if (!texto) { listarOPs(); return; }

    // Filtra localmente sobre o cache — zero queries ao Firestore
    const hoje2    = new Date(); hoje2.setHours(0,0,0,0);
    const msUmDia2 = 24 * 60 * 60 * 1000;

    function _folga2(op) {
        if (!op.prazo) return 99999;
        const d = new Date(op.prazo + "T00:00:00");
        d.setDate(d.getDate() - _diasMargem(op.prioridade, op.familia));
        return Math.round((d - hoje2) / msUmDia2);
    }

    let filtrados = _opsCache.filter(op => {
        if (filtroStatusAtivo !== "TODAS" && op.status !== filtroStatusAtivo) return false;
        if (filtroFamiliaAtivo !== "TODAS" && op.familia !== filtroFamiliaAtivo) return false;
        return [op.op, op.cliente, op.produto, op.familia].join(" ").toLowerCase().includes(texto);
    });

    filtrados.sort((a, b) => {
        const fa = a.status === "FINALIZADA" ? 99998 : _folga2(a);
        const fb = b.status === "FINALIZADA" ? 99998 : _folga2(b);
        return fa - fb;
    });

    // Adapta para o formato que montarLinha espera (objeto com .data() e .id)
    const html = filtrados.map(op => {
        const { id, ...data } = op;
        return montarLinha({ id, data: () => data });
    }).join("");

    document.getElementById("listaOP").innerHTML = html ||
        `<tr><td colspan="12" style="text-align:center;padding:32px;color:var(--text-3);font-size:0.85rem">
            Nenhum resultado para "${texto}".
         </td></tr>`;
}

// =============================================
// FINALIZAR OP
// =============================================

async function finalizarOP(id, numeroOP, cliente) {

    const confirmado = confirm(
        `Finalizar a OP ${numeroOP} — ${cliente}?\n\nEla sairá dos cálculos de carga e poderá ser reaberta a qualquer momento.`
    );
    if (!confirmado) return;

    try {

        // Calcula pontualidade: diferença em dias entre dataFinalizacao e prazo
        const op     = _opsCache.find(o => o.id === id);
        const agora  = new Date();
        let pontualidade = null;
        if (op && op.prazo) {
            const dataPrazo = new Date(op.prazo + "T00:00:00");
            const diffMs    = agora - dataPrazo;
            pontualidade    = Math.round(diffMs / (24 * 60 * 60 * 1000)); // negativo = adiantado, positivo = atrasado
        }

        const update = {
            status:           "FINALIZADA",
            dataFinalizacao:  firebase.firestore.FieldValue.serverTimestamp()
        };
        if (pontualidade !== null) update.diasAtraso = pontualidade;

        await db.collection("ops").doc(id).update(update);

        mostrarMensagem(`✅ OP ${numeroOP} finalizada com sucesso!`);
        await listarOPs();

    } catch (err) {
        console.error(err);
        mostrarMensagem("❌ Erro ao finalizar a OP.");
    }

}

// =============================================
// REABRIR OP
// =============================================

async function reabrirOP(id, numeroOP) {

    const confirmado = confirm(`Reabrir a OP ${numeroOP}?\n\nEla voltará para os cálculos de carga.`);
    if (!confirmado) return;

    try {

        await db.collection("ops").doc(id).update({
            status:          "ABERTA",
            dataFinalizacao: firebase.firestore.FieldValue.delete()
        });

        mostrarMensagem(`↩ OP ${numeroOP} reaberta com sucesso!`);
        await listarOPs();

    } catch (err) {
        console.error(err);
        mostrarMensagem("❌ Erro ao reabrir a OP.");
    }

}

// =============================================
// EXCLUIR OP
// =============================================

async function excluirOP(id) {

    if (!confirm("Deseja realmente excluir esta OP?")) return;

    try {

        await db.collection("ops").doc(id).delete();
        mostrarMensagem("🗑️ OP excluída com sucesso.");
        await listarOPs();

    } catch (error) {

        console.error(error);
        mostrarMensagem("❌ Erro ao excluir.");

    }

}

// =============================================
// EDITAR OP
// =============================================

async function editarOP(id) {

    // Se estamos em baixa-op.html (sem form), redireciona para cadastro-op com parâmetro
    if (!document.getElementById("formOP")) {
        window.location.href = `cadastro-op.html?editar=${id}`;
        return;
    }

    opEditando = id;

    const doc = await db.collection("ops").doc(id).get();

    if (!doc.exists) return;

    const op = doc.data();

    document.getElementById("op").value         = op.op;
    document.getElementById("cliente").value    = op.cliente;
    document.getElementById("produto").value    = op.produto;
    document.getElementById("familia").value    = op.familia;
    document.getElementById("quantidade").value = op.quantidade;
    document.getElementById("cores").value      = op.cores;
    document.getElementById("prazo").value      = op.prazo;
    document.getElementById("prioridade").value = op.prioridade;
    document.getElementById("observacao").value = op.observacao || "";

    calcularPrevisao();

    document.getElementById("btnSalvar").innerText = "✏️ ATUALIZAR ORDEM DE PRODUÇÃO";

    // Scroll até o formulário
    document.getElementById("formOP").scrollIntoView({ behavior: "smooth" });

    mostrarMensagem("✏️ OP carregada para edição.");

}

// =============================================
// EXPORTAR OPs PARA CSV
// =============================================

function exportarCSV() {

    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const msUmDia = 24 * 60 * 60 * 1000;

    // Usa o cache já carregado, respeitando os filtros ativos
    const ops = _opsCache.filter(op => {
        if (filtroStatusAtivo !== "TODAS" && op.status !== filtroStatusAtivo) return false;
        if (filtroFamiliaAtivo !== "TODAS" && op.familia !== filtroFamiliaAtivo) return false;
        return true;
    });

    if (ops.length === 0) { alert("Nenhuma OP para exportar com os filtros atuais."); return; }

    const cabecalho = [
        "OP","CLIENTE","PRODUTO","FAMÍLIA","IMPRESSÕES",
        "HORAS NECES.","PRAZO","FINALIZAR ATÉ","FOLGA (dias)",
        "PRIORIDADE","STATUS","OBS"
    ];

    const linhas = ops.map(op => {
        const fam      = CONFIG.familias[op.familia];
        const metaReal = fam ? fam.metaHora * CONFIG.eficiencia : 0;
        const h        = metaReal > 0 ? op.impressoes / metaReal : 0;
        const hFmt     = h > 0 ? `${Math.floor(h)}h ${String(Math.round((h % 1)*60)).padStart(2,"0")}min` : "--";

        let prazoFmt = op.prazo
            ? new Date(op.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "--";
        let finFmt = "--", folga = "--";
        if (op.prazo) {
            const fin = new Date(op.prazo + "T00:00:00");
            fin.setDate(fin.getDate() - 8);
            finFmt = fin.toLocaleDateString("pt-BR");
            folga  = String(Math.round((fin - hoje) / msUmDia));
        }

        return [
            op.op, op.cliente, op.produto,
            fam ? fam.nome : op.familia,
            op.impressoes, hFmt, prazoFmt, finFmt, folga,
            op.prioridade, op.status, op.observacao || ""
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(";");
    });

    const csv = "\uFEFF" + [cabecalho.join(";"), ...linhas].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `ops_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

}
