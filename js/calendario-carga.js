// =============================================================
// INDEMETAL — Calendário de Carga de Máquinas
// Renderizável em qualquer container, com família configurável.
// Pode ser usado em carga-maquinas.html (por família) ou em
// cadastro-op.html (visão geral — legado).
// =============================================================

// Nomes dos meses em PT-BR
const CAL_MESES = [
    "JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO",
    "JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"
];

const CAL_DOW = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];

const CAL_CORES = {
    rotativa:          "#00f2ff",
    semiautomatica:    "#00ff95",
    paralela:          "#ff9d00",
    manual:            "#ff5500",
    "sala-limpa":      "#a78bfa",
    "adesivo-liquido": "#f472b6"
};

// =============================================================
// INSTÂNCIA — um calendário por container
// Uso:
//   const cal = new CalendarioCarga(containerEl, opsArray, familiaKey);
//   cal.renderizar();
//   cal.setFamilia("rotativa");  // muda filtro e re-renderiza
// =============================================================

class CalendarioCarga {

    constructor(container, ops, familiaKey) {
        this.container  = container;
        this.ops        = ops;          // array de dados já carregados
        this.familia    = familiaKey || "TODAS";
        this.ano        = new Date().getFullYear();
        this.mes        = new Date().getMonth(); // 0-based
        this._montarShell();
    }

    // ── Constrói o HTML fixo do cabeçalho + placeholders ──────
    _montarShell() {
        const uid = "cal_" + Math.random().toString(36).slice(2, 7);
        this._uid = uid;

        this.container.innerHTML = `
        <div class="cal-section-header">
            <div class="cal-titulo-wrap">
                <h3 class="cal-titulo">CALENDÁRIO DE CARGA</h3>
                <div class="cal-nav">
                    <button class="cal-btn-nav" id="${uid}_ant">&#8592; ANT</button>
                    <span class="cal-mes-label" id="${uid}_mes">---</span>
                    <button class="cal-btn-nav" id="${uid}_pro">PRÓ &#8594;</button>
                </div>
                <span class="cal-badge-fora" id="${uid}_fora" style="display:none"></span>
            </div>
            <div class="cal-legenda">
                <div class="cal-leg-item"><span class="cal-leg-dot livre"></span>&lt; 80% — livre</div>
                <div class="cal-leg-item"><span class="cal-leg-dot atencao"></span>80–99% — atenção</div>
                <div class="cal-leg-item"><span class="cal-leg-dot critico"></span>≥ 100% — crítico</div>
            </div>
        </div>
        <div id="${uid}_grid" class="cal-grid-wrap"></div>`;

        // eventos dos botões de navegação
        this.container.querySelector(`#${uid}_ant`)
            .addEventListener("click", () => { this._navegar(-1); });
        this.container.querySelector(`#${uid}_pro`)
            .addEventListener("click", () => { this._navegar(+1); });
    }

    // ── Navega entre meses ─────────────────────────────────────
    _navegar(delta) {
        this.mes += delta;
        if (this.mes > 11) { this.mes = 0;  this.ano++; }
        if (this.mes < 0)  { this.mes = 11; this.ano--; }
        this.renderizar();
    }

    // ── Muda a família filtrada e re-renderiza ─────────────────
    setFamilia(fam) {
        this.familia = fam;
        this.renderizar();
    }

    // ── Atualiza as OPs e re-renderiza ─────────────────────────
    setOps(ops) {
        this.ops = ops;
        this.renderizar();
    }

    // ── Capacidade do dia para a família ativa ─────────────────
    _capDia(isSexta) {
        if (this.familia === "TODAS") {
            return Object.keys(CONFIG.familias).reduce((acc, key) => {
                return acc + configCapDia(key, isSexta);
            }, 0);
        }
        return configCapDia(this.familia, isSexta);
    }

    // ── Distribui carga das OPs pelos dias úteis ───────────────
    _distribuirCarga() {
        const mapa = {};

        const ops = this.familia === "TODAS"
            ? this.ops
            : this.ops.filter(op => op.familia === this.familia);

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        ops.forEach(op => {
            const impressoes = Number(op.impressoes || 0);
            if (impressoes <= 0) return;

            // Sempre calcula com configCapDiaMedia para ignorar diasNecessarios
            // antigo (salvo com horas÷8 fixo) — garante consistência com config atual
            const capDia = op.familia ? configCapDiaMedia(op.familia) : 0;
            const diasEfetivos = capDia > 0
                ? Math.max(Math.ceil(impressoes / capDia), 1)
                : Math.max(Number(op._dias || 1), 1);

            const impPorDia = impressoes / diasEfetivos;

            // Início = prazo − (diasEfetivos − 1) dias úteis, para que o último
            // dia alocado seja o próprio prazo (não o dia anterior a ele).
            // Nunca antes de hoje.
            let inicio = new Date(hoje);
            if (op.prazo) {
                const prazoDate  = new Date(op.prazo + "T00:00:00");
                const inicioCalc = this._subtrairDiasUteis(prazoDate, diasEfetivos - 1);
                if (inicioCalc > hoje) inicio = new Date(inicioCalc);
            }

            let cursor   = new Date(inicio);
            let alocados = 0;
            let limite   = diasEfetivos + 90; // margem maior para OPs longas

            while (alocados < diasEfetivos && limite-- > 0) {
                const dow = cursor.getDay();
                if (dow !== 0 && dow !== 6) {
                    const chave = this._chave(cursor);
                    if (!mapa[chave]) mapa[chave] = { carga: 0 };
                    mapa[chave].carga += impPorDia;
                    alocados++;
                }
                cursor.setDate(cursor.getDate() + 1);
            }
        });

        return mapa;
    }

    // ── Renderiza a grade do mês ───────────────────────────────
    renderizar() {
        const uid = this._uid;

        // label do mês
        const mesEl = this.container.querySelector(`#${uid}_mes`);
        if (mesEl) mesEl.textContent = `${CAL_MESES[this.mes]} ${this.ano}`;

        // Badge de OPs com prazo fora do mês visível
        const foraEl = this.container.querySelector(`#${uid}_fora`);
        if (foraEl) {
            const ops = this.familia === "TODAS"
                ? this.ops
                : this.ops.filter(op => op.familia === this.familia);
            const inicioMes = new Date(this.ano, this.mes, 1);
            const fimMes    = new Date(this.ano, this.mes + 1, 0, 23, 59, 59);
            const foraMes   = ops.filter(op => {
                if (!op.prazo) return false;
                const p = new Date(op.prazo + "T00:00:00");
                return p < inicioMes || p > fimMes;
            }).length;
            if (foraMes > 0) {
                foraEl.textContent = `${foraMes} OP${foraMes > 1 ? "s" : ""} com prazo fora deste mês`;
                foraEl.style.display = "inline-block";
            } else {
                foraEl.style.display = "none";
            }
        }

        const mapa       = this._distribuirCarga();
        const primeiroDia = new Date(this.ano, this.mes, 1);
        const ultimoDia   = new Date(this.ano, this.mes + 1, 0);
        const dowInicio   = primeiroDia.getDay();
        const totalDias   = ultimoDia.getDate();

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        let html = `<div class="cal-grid">`;

        // Cabeçalho dias da semana
        CAL_DOW.forEach((d, i) => {
            const fim = (i === 0 || i === 6) ? " fim" : "";
            html += `<div class="cal-dow${fim}">${d}</div>`;
        });

        // Células vazias antes do dia 1
        for (let i = 0; i < dowInicio; i++) {
            html += `<div class="cal-dia vazio"></div>`;
        }

        // Dias do mês
        for (let dia = 1; dia <= totalDias; dia++) {
            const data   = new Date(this.ano, this.mes, dia);
            const dow    = data.getDay();
            const chave  = this._chave(data);
            const isFds  = (dow === 0 || dow === 6);
            const isHoje = (data.getTime() === hoje.getTime());

            if (isFds) {
                html += `<div class="cal-dia fds"><div class="cal-dia-num muted">${dia}</div></div>`;
                continue;
            }

            const capDia   = this._capDia(dow === 5);
            const dadosDia = mapa[chave] || { carga: 0 };
            const pct      = capDia > 0 ? (dadosDia.carga / capDia) * 100 : 0;

            // classe de cor do quadrado
            let classeOcup = "";
            if (pct > 0 && pct < 80)     classeOcup = " livre";
            if (pct >= 80 && pct < 100)  classeOcup = " atencao";
            if (pct >= 100)              classeOcup = " critico";

            const classe = "cal-dia util" + (isHoje ? " hoje" : "") + classeOcup;

            // impressões do dia
            const impDia = dadosDia.carga > 0
                ? Math.round(dadosDia.carga).toLocaleString("pt-BR")
                : "";

            // cor do número acompanha a ocupação
            let corImp = "rgba(255,255,255,0.35)";
            if (pct > 0 && pct < 80)    corImp = "#00ff95";
            if (pct >= 80 && pct < 100) corImp = "#ff9d00";
            if (pct >= 100)             corImp = "#ff3333";

            const pctLabel  = pct > 0 ? `${Math.round(pct)}%` : "";
            const pctClasse = pct >= 100 ? "critico" : pct >= 80 ? "alerta" : "";

            const barraW   = Math.min(pct, 100);
            const barraCor = pct >= 100 ? "rgba(255,51,51,0.75)"
                           : pct >= 80  ? "rgba(255,157,0,0.75)"
                           :              "rgba(0,255,149,0.55)";

            html += `
            <div class="${classe}">
                <div class="cal-dia-num${isHoje ? " hoje" : ""}">${dia}</div>
                ${impDia ? `<div class="cal-imp" style="color:${corImp}">${impDia}</div>` : ""}
                ${pct > 0 ? `<div class="cal-dia-pct ${pctClasse}">${pctLabel}</div>` : ""}
                ${pct > 0 ? `<div class="cal-barra" style="width:${barraW}%;background:${barraCor}"></div>` : ""}
            </div>`;
        }

        // Preenche fim da última semana
        const dowFim = ultimoDia.getDay();
        if (dowFim !== 6) {
            for (let i = dowFim + 1; i <= 6; i++) {
                html += `<div class="cal-dia vazio"></div>`;
            }
        }

        html += `</div>`; // fecha cal-grid

        const gridEl = this.container.querySelector(`#${uid}_grid`);
        if (gridEl) gridEl.innerHTML = html;
    }

    // ── Helpers ────────────────────────────────────────────────
    _chave(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    }

    _subtrairDiasUteis(dataBase, dias) {
        if (dias <= 0) return new Date(dataBase);
        const d = new Date(dataBase);
        let count = 0, limite = 3650;
        while (count < dias) {
            d.setDate(d.getDate() - 1);
            if (d.getDay() !== 0 && d.getDay() !== 6) count++;
            if (--limite <= 0) break;
        }
        return d;
    }

}
