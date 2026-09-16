// =============================================================
// INDEMETAL — Manutenção / Paradas de Máquina
// Coleção Firestore: "manutencao"
// Campos: familia, dtInicio (ISO string), dtFim (ISO string),
//         motivo, horasDescontadas (número decimal)
// =============================================================

// Cache local dos registros
let registros = [];

// =============================================================
// INICIALIZAÇÃO
// =============================================================

document.addEventListener("DOMContentLoaded", async () => {

    await CONFIG_PRONTO;

    // Preenche data/hora atual nos campos de datetime
    const agora = new Date();
    const fmt = dt => dt.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
    document.getElementById("f-inicio").value = fmt(agora);
    document.getElementById("f-fim").value    = fmt(agora);

    // Atualiza preview ao mudar campos
    ["f-inicio", "f-fim", "f-familia"].forEach(id => {
        document.getElementById(id).addEventListener("change", atualizarPreview);
    });

    await carregarRegistros();

});

// =============================================================
// CALCULAR HORAS DESCONTADAS
// Lógica: percorre o intervalo minuto a minuto (máx 30 dias)
// e conta minutos dentro do horário de turno (seg-sex, excl. dom/sab).
// Usa os turnos do CONFIG para determinar horas ativas.
// =============================================================

function calcularHorasDescontadas(dtInicioISO, dtFimISO) {

    const inicio = new Date(dtInicioISO);
    const fim    = new Date(dtFimISO);

    if (isNaN(inicio) || isNaN(fim) || fim <= inicio) return 0;

    // Limite de segurança: 30 dias
    const limiteMs = 30 * 24 * 60 * 60 * 1000;
    if (fim - inicio > limiteMs) return 0;

    let minutosAtivos = 0;
    const cursor = new Date(inicio);

    while (cursor < fim) {

        const dow    = cursor.getDay(); // 0=dom, 6=sab
        const hora   = cursor.getHours() + cursor.getMinutes() / 60;
        const isSex  = dow === 5;

        // Apenas seg-sex
        if (dow >= 1 && dow <= 5) {

            // Turno 1
            const hT1 = isSex ? CONFIG.turnos[1].horasSex : CONFIG.turnos[1].horasSegQui;
            // T1 começa 06:00 por convenção (o que importa é a duração)
            const t1Ini = 6;
            const t1Fim = t1Ini + hT1;

            // Turno 2 começa logo após o T1
            const hT2  = isSex ? CONFIG.turnos[2].horasSex : CONFIG.turnos[2].horasSegQui;
            const t2Ini = t1Fim;
            const t2Fim = t2Ini + hT2;

            if ((hora >= t1Ini && hora < t1Fim) || (hora >= t2Ini && hora < t2Fim)) {
                minutosAtivos++;
            }

        }

        cursor.setMinutes(cursor.getMinutes() + 1);

    }

    return minutosAtivos / 60; // horas decimais

}

// =============================================================
// PREVIEW
// =============================================================

function atualizarPreview() {

    const familia  = document.getElementById("f-familia").value;
    const inicioV  = document.getElementById("f-inicio").value;
    const fimV     = document.getElementById("f-fim").value;
    const el       = document.getElementById("preview-horas");

    if (!inicioV || !fimV) {
        el.textContent = "Preencha início e fim para ver as horas descontadas";
        return;
    }

    const horas = calcularHorasDescontadas(inicioV, fimV);
    const fam   = CONFIG.familias[familia];
    const metaR = fam ? fam.metaHora * CONFIG.eficiencia : 0;
    const impPerdidas = Math.round(horas * metaR);

    if (horas <= 0) {
        el.textContent = "⚠️  O fim deve ser posterior ao início (máx. 30 dias de intervalo)";
        return;
    }

    const h   = Math.floor(horas);
    const min = Math.round((horas - h) * 60);
    const fmtH = `${h}h${min > 0 ? ` ${String(min).padStart(2,"0")}min` : ""}`;

    el.innerHTML = `⏱ <strong style="color:#ff8c00">${fmtH}</strong> de tempo produtivo afetado`
        + (impPerdidas > 0
            ? ` — equivalente a <strong style="color:#ffd600">${impPerdidas.toLocaleString("pt-BR")} impressões</strong> perdidas na <strong>${fam.nome}</strong>`
            : "");

}

// =============================================================
// SALVAR
// =============================================================

async function salvarManutencao() {

    const familia = document.getElementById("f-familia").value;
    const inicioV = document.getElementById("f-inicio").value;
    const fimV    = document.getElementById("f-fim").value;
    const motivo  = document.getElementById("f-motivo").value.trim();
    const msg     = document.getElementById("form-msg");

    msg.className = "";
    msg.textContent = "";

    if (!familia || !inicioV || !fimV) {
        msg.className = "form-msg erro";
        msg.textContent = "⚠️  Preencha família, início e fim.";
        return;
    }

    const horas = calcularHorasDescontadas(inicioV, fimV);

    if (horas <= 0) {
        msg.className = "form-msg erro";
        msg.textContent = "⚠️  O fim deve ser posterior ao início.";
        return;
    }

    try {

        await db.collection("manutencao").add({
            familia,
            dtInicio:          inicioV,
            dtFim:             fimV,
            motivo:            motivo || "—",
            horasDescontadas:  Math.round(horas * 100) / 100,
            criadoEm:          firebase.firestore.FieldValue.serverTimestamp()
        });

        msg.className = "form-msg ok";
        msg.textContent = "✅  Parada registrada com sucesso!";

        // Limpa form
        document.getElementById("f-motivo").value = "";
        document.getElementById("preview-horas").textContent =
            "Preencha início e fim para ver as horas descontadas";

        await carregarRegistros();

    } catch (err) {
        console.error(err);
        msg.className = "form-msg erro";
        msg.textContent = "❌  Erro ao salvar: " + err.message;
    }

}

// =============================================================
// CARREGAR LISTA DO FIRESTORE
// =============================================================

async function carregarRegistros() {

    const snap = await db.collection("manutencao")
        .orderBy("dtInicio", "desc")
        .limit(200)
        .get();

    registros = [];
    snap.forEach(doc => registros.push({ id: doc.id, ...doc.data() }));
    renderizarLista();

}

// =============================================================
// RENDERIZAR TABELA
// =============================================================

function renderizarLista() {

    const filtro = document.getElementById("filtro-familia").value;
    const tbody  = document.getElementById("lista-body");

    const lista = filtro
        ? registros.filter(r => r.familia === filtro)
        : registros;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="td-vazio">Nenhuma parada registrada</td></tr>`;
        return;
    }

    const CORES = {
        rotativa:          "#00e6ff",
        semiautomatica:    "#ff9800",
        paralela:          "#00ff88",
        manual:            "#ff4444",
        "sala-limpa":      "#c084fc",
        "adesivo-liquido": "#ffd600"
    };

    tbody.innerHTML = lista.map(r => {

        const cor     = CORES[r.familia] || "#fff";
        const nomeFam = CONFIG.familias[r.familia]?.nome || r.familia;
        const fmtDt   = iso => iso ? iso.replace("T", " ").slice(0, 16) : "--";
        const h       = Math.floor(r.horasDescontadas || 0);
        const min     = Math.round(((r.horasDescontadas || 0) - h) * 60);
        const fmtH    = `${h}h${min > 0 ? ` ${String(min).padStart(2,"0")}min` : ""}`;

        return `
        <tr>
            <td><span style="color:${cor};font-weight:700">${nomeFam}</span></td>
            <td style="color:#aaa">${fmtDt(r.dtInicio)}</td>
            <td style="color:#aaa">${fmtDt(r.dtFim)}</td>
            <td style="color:#ff8c00;font-weight:700;font-family:'Orbitron',sans-serif;font-size:0.88rem">${fmtH}</td>
            <td>${r.motivo || "—"}</td>
            <td style="text-align:center">
                <button class="btn-excluir" onclick="excluirRegistro('${r.id}')">✕ EXCLUIR</button>
            </td>
        </tr>`;

    }).join("");

}

// =============================================================
// EXCLUIR
// =============================================================

async function excluirRegistro(id) {

    if (!confirm("Excluir esta parada?")) return;

    try {
        await db.collection("manutencao").doc(id).delete();
        await carregarRegistros();
    } catch (err) {
        alert("Erro ao excluir: " + err.message);
    }

}
