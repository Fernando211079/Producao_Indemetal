// =============================================================
// INDEMETAL — HORAS EXTRAS
// =============================================================
// Coleção Firestore: "horas_extra"
// Campos:
//   familia
//   data              -> YYYY-MM-DD
//   horas             -> número
//   impressoesGanhas  -> calculado
//   obs
//   criadoEm
//
// VISUALIZAÇÃO:
//   Família + Mês = acumulado de horas extras
//   É possível abrir os dias que formam o acumulado.
// =============================================================


// =============================================================
// CACHE LOCAL
// =============================================================

let registros = [];


// =============================================================
// INICIALIZAÇÃO
// =============================================================

document.addEventListener("DOMContentLoaded", async () => {

    try {

        await CONFIG_PRONTO;

        // ---------------------------------------------------------
        // Preenche data de hoje
        // ---------------------------------------------------------

        const hoje = new Date().toISOString().slice(0, 10);

        const campoData = document.getElementById("f-data");

        if (campoData) {
            campoData.value = hoje;
        }


        // ---------------------------------------------------------
        // Atualiza preview ao alterar os campos
        // ---------------------------------------------------------

        ["f-familia", "f-data", "f-horas"].forEach(id => {

            const campo = document.getElementById(id);

            if (campo) {
                campo.addEventListener("input", atualizarPreview);
                campo.addEventListener("change", atualizarPreview);
            }

        });


        atualizarPreview();

        await carregarRegistros();

    } catch (err) {

        console.error("Erro na inicialização:", err);

        const tbody = document.getElementById("lista-body");

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="td-vazio">
                        ❌ Erro ao carregar as horas extras
                    </td>
                </tr>
            `;
        }

    }

});


// =============================================================
// PREVIEW
// Quantas impressões extras serão ganhas
// =============================================================

function atualizarPreview() {

    const campoFamilia = document.getElementById("f-familia");
    const campoHoras   = document.getElementById("f-horas");
    const campoData    = document.getElementById("f-data");
    const el           = document.getElementById("preview-imp");

    if (!campoFamilia || !campoHoras || !campoData || !el) {
        return;
    }

    const familia = campoFamilia.value;
    const horasV  = parseFloat(campoHoras.value);
    const dataV   = campoData.value;


    // ---------------------------------------------------------
    // Verificação
    // ---------------------------------------------------------

    if (!horasV || horasV <= 0 || !dataV) {

        el.textContent =
            "Preencha os campos para ver o impacto na capacidade";

        return;
    }


    // ---------------------------------------------------------
    // Busca configuração da família
    // ---------------------------------------------------------

    const fam = CONFIG.familias[familia];

    if (!fam) {

        el.textContent =
            "Família não encontrada na configuração";

        return;
    }


    // ---------------------------------------------------------
    // Calcula impressões
    // ---------------------------------------------------------

    const metaReal =
        fam.metaHora * CONFIG.eficiencia;

    const impressoesGanhas =
        Math.round(horasV * metaReal);


    // ---------------------------------------------------------
    // Verifica sábado/domingo
    // ---------------------------------------------------------

    const dow =
        new Date(dataV + "T00:00:00").getDay();

    const aviso =
        dow === 0
            ? " ⚠️ Domingo"
            : dow === 6
                ? " ⚠️ Sábado"
                : "";


    // ---------------------------------------------------------
    // Mostra preview
    // ---------------------------------------------------------

    el.innerHTML =
        `➕ <strong style="color:#00ff88">${horasV}h</strong> extras na `
        + `<strong>${fam.nome}</strong>`
        + ` — ganho de `
        + `<strong style="color:#ffd600">`
        + `${impressoesGanhas.toLocaleString("pt-BR")}`
        + ` impressões</strong> adicionais`
        + (aviso
            ? `<span style="color:#ffd600">${aviso}</span>`
            : "");

}


// =============================================================
// SALVAR HORA EXTRA
// =============================================================

async function salvarHoraExtra() {

    const familia = document.getElementById("f-familia").value;
    const dataV   = document.getElementById("f-data").value;
    const horasV  = parseFloat(document.getElementById("f-horas").value);
    const obs     = document.getElementById("f-obs").value.trim();
    const msg     = document.getElementById("form-msg");


    // ---------------------------------------------------------
    // Limpa mensagem
    // ---------------------------------------------------------

    msg.className = "form-msg";
    msg.textContent = "";


    // ---------------------------------------------------------
    // Validação
    // ---------------------------------------------------------

    if (!familia || !dataV || !horasV || horasV <= 0) {

        msg.className = "form-msg erro";
        msg.textContent =
            "⚠️ Preencha família, data e horas.";

        return;
    }


    // ---------------------------------------------------------
    // Busca família
    // ---------------------------------------------------------

    const fam = CONFIG.familias[familia];

    if (!fam) {

        msg.className = "form-msg erro";
        msg.textContent =
            "❌ Família não encontrada na configuração.";

        return;
    }


    // ---------------------------------------------------------
    // Calcula impressões
    // ---------------------------------------------------------

    const metaReal =
        fam.metaHora * CONFIG.eficiencia;

    const impressoesGanhas =
        Math.round(horasV * metaReal);


    // ---------------------------------------------------------
    // Salva no Firestore
    // ---------------------------------------------------------

    try {

        await db.collection("horas_extra").add({

            familia: familia,

            data: dataV,

            horas: horasV,

            impressoesGanhas: impressoesGanhas,

            obs: obs || "—",

            criadoEm:
                firebase.firestore.FieldValue.serverTimestamp()

        });


        // -----------------------------------------------------
        // Mensagem de sucesso
        // -----------------------------------------------------

        msg.className = "form-msg ok";

        msg.textContent =
            "✅ Horas extras registradas com sucesso!";


        // -----------------------------------------------------
        // Limpa campos
        // -----------------------------------------------------

        document.getElementById("f-horas").value = "";

        document.getElementById("f-obs").value = "";

        document.getElementById("preview-imp").textContent =
            "Preencha os campos para ver o impacto na capacidade";


        // -----------------------------------------------------
        // Recarrega lista
        // -----------------------------------------------------

        await carregarRegistros();


    } catch (err) {

        console.error(err);

        msg.className = "form-msg erro";

        msg.textContent =
            "❌ Erro ao salvar: " + err.message;

    }

}


// =============================================================
// CARREGAR DO FIRESTORE
// =============================================================

async function carregarRegistros() {

    try {

        const snap = await db
            .collection("horas_extra")
            .orderBy("data", "desc")
            .get();


        registros = [];


        snap.forEach(doc => {

            registros.push({

                id: doc.id,

                ...doc.data()

            });

        });


        renderizarLista();


    } catch (err) {

        console.error("Erro ao carregar registros:", err);

        const tbody =
            document.getElementById("lista-body");

        if (tbody) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="td-vazio">
                        ❌ Erro ao carregar dados:
                        ${escaparHTML(err.message)}
                    </td>
                </tr>
            `;

        }

    }

}


// =============================================================
// AGRUPAR POR FAMÍLIA + MÊS
// =============================================================

function agruparPorMes(lista) {

    const grupos = {};


    lista.forEach(r => {

        if (!r.data) {
            return;
        }


        // -----------------------------------------------------
        // Exemplo:
        // 2026-08-15
        //
        // vira:
        // 2026-08
        // -----------------------------------------------------

        const mes = r.data.substring(0, 7);


        // -----------------------------------------------------
        // Chave única:
        //
        // rotativa_2026-08
        // -----------------------------------------------------

        const chave =
            `${r.familia}_${mes}`;


        // -----------------------------------------------------
        // Cria grupo se não existir
        // -----------------------------------------------------

        if (!grupos[chave]) {

            grupos[chave] = {

                familia: r.familia,

                mes: mes,

                horas: 0,

                impressoesGanhas: 0,

                registros: []

            };

        }


        // -----------------------------------------------------
        // Soma horas
        // -----------------------------------------------------

        grupos[chave].horas +=
            Number(r.horas) || 0;


        // -----------------------------------------------------
        // Soma impressões
        // -----------------------------------------------------

        grupos[chave].impressoesGanhas +=
            Number(r.impressoesGanhas) || 0;


        // -----------------------------------------------------
        // Guarda lançamento individual
        // -----------------------------------------------------

        grupos[chave].registros.push(r);

    });


    return Object.values(grupos);

}


// =============================================================
// FORMATAR MÊS
// =============================================================

function formatarMes(mes) {

    if (!mes) {
        return "--";
    }


    const partes = mes.split("-");

    if (partes.length !== 2) {
        return mes;
    }


    const ano = partes[0];

    const numeroMes =
        parseInt(partes[1], 10);


    const nomesMeses = [

        "Janeiro",
        "Fevereiro",
        "Março",
        "Abril",
        "Maio",
        "Junho",
        "Julho",
        "Agosto",
        "Setembro",
        "Outubro",
        "Novembro",
        "Dezembro"

    ];


    return `${nomesMeses[numeroMes - 1] || partes[1]}/${ano}`;

}


// =============================================================
// FORMATAR DATA
// =============================================================

function formatarData(data) {

    if (!data) {
        return "--";
    }


    const partes = data.split("-");


    if (partes.length !== 3) {
        return data;
    }


    return `${partes[2]}/${partes[1]}/${partes[0]}`;

}


// =============================================================
// CORES DAS FAMÍLIAS
// =============================================================

const CORES_FAMILIAS = {

    rotativa: "#00e6ff",

    semiautomatica: "#ff9800",

    paralela: "#00ff88",

    manual: "#ff4444",

    "sala-limpa": "#c084fc",

    "adesivo-liquido": "#ffd600"

};


// =============================================================
// RENDERIZAR LISTA
// =============================================================
//
// AGORA A TABELA PRINCIPAL MOSTRA:
//
// FAMÍLIA | MÊS | HORAS | IMPRESSÕES | LANÇAMENTOS | AÇÕES
//
// O usuário pode abrir os dias daquele mês.
// =============================================================

function renderizarLista() {

    const filtro =
        document.getElementById("filtro-familia").value;

    const tbody =
        document.getElementById("lista-body");


    // ---------------------------------------------------------
    // Filtra família
    // ---------------------------------------------------------

    const lista = filtro

        ? registros.filter(r =>
            r.familia === filtro
        )

        : registros;


    // ---------------------------------------------------------
    // Agrupa
    // ---------------------------------------------------------

    const grupos =
        agruparPorMes(lista);


    // ---------------------------------------------------------
    // Nenhum registro
    // ---------------------------------------------------------

    if (grupos.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="td-vazio">
                    Nenhuma hora extra registrada
                </td>
            </tr>
        `;

        return;

    }


    // ---------------------------------------------------------
    // Ordena:
    //
    // primeiro mês mais recente
    // depois família
    // ---------------------------------------------------------

    grupos.sort((a, b) => {

        if (a.mes !== b.mes) {

            return b.mes.localeCompare(a.mes);

        }

        return a.familia.localeCompare(b.familia);

    });


    // ---------------------------------------------------------
    // Monta HTML
    // ---------------------------------------------------------

    let html = "";


    grupos.forEach((grupo, index) => {

        const cor =
            CORES_FAMILIAS[grupo.familia] || "#fff";


        const nomeFam =
            CONFIG.familias[grupo.familia]?.nome
            || grupo.familia;


        const idDetalhes =
            `detalhes-${index}`;


        // -----------------------------------------------------
        // Ordena lançamentos do mais recente para o mais antigo
        // -----------------------------------------------------

        grupo.registros.sort((a, b) =>
            (b.data || "").localeCompare(a.data || "")
        );


        // -----------------------------------------------------
        // Linha principal
        // -----------------------------------------------------

        html += `

        <tr>

            <td>
                <span
                    style="
                        color:${cor};
                        font-weight:700;
                    "
                >
                    ${escaparHTML(nomeFam)}
                </span>
            </td>


            <td style="color:#aaa;font-weight:700;">
                ${formatarMes(grupo.mes)}
            </td>


            <td
                style="
                    color:#00ff88;
                    font-weight:700;
                    font-family:'Orbitron',sans-serif;
                    font-size:0.95rem;
                "
            >
                +${formatarHoras(grupo.horas)}h
            </td>


            <td
                style="
                    color:#ffd600;
                    font-weight:700;
                "
            >
                +${grupo.impressoesGanhas.toLocaleString("pt-BR")}
            </td>


            <td
                style="
                    color:#aaa;
                    text-align:center;
                "
            >
                ${grupo.registros.length}
                lançamento(s)
            </td>


            <td style="text-align:center;">

                <button
                    class="btn-detalhes"
                    onclick="alternarDetalhes('${idDetalhes}', this)"
                >
                    👁 VER DIAS
                </button>

            </td>

        </tr>
        `;


        // -----------------------------------------------------
        // Linha escondida com os detalhes
        // -----------------------------------------------------

        html += `

        <tr
            id="${idDetalhes}"
            style="display:none;"
        >

            <td colspan="6">

                <div
                    style="
                        padding:15px;
                        margin:5px 0;
                        border:1px solid rgba(255,255,255,0.08);
                        background:rgba(0,0,0,0.25);
                        border-radius:8px;
                    "
                >

                    <div
                        style="
                            color:${cor};
                            font-family:'Orbitron',sans-serif;
                            font-size:0.9rem;
                            font-weight:700;
                            margin-bottom:12px;
                        "
                    >
                        📅 ${escaparHTML(nomeFam)}
                        — ${formatarMes(grupo.mes)}
                    </div>


                    <table
                        style="
                            width:100%;
                            border-collapse:collapse;
                        "
                    >

                        <thead>

                            <tr>

                                <th
                                    style="
                                        text-align:left;
                                        padding:8px;
                                        color:#888;
                                    "
                                >
                                    DATA
                                </th>

                                <th
                                    style="
                                        text-align:left;
                                        padding:8px;
                                        color:#888;
                                    "
                                >
                                    HORAS
                                </th>

                                <th
                                    style="
                                        text-align:left;
                                        padding:8px;
                                        color:#888;
                                    "
                                >
                                    IMPRESSÕES
                                </th>

                                <th
                                    style="
                                        text-align:left;
                                        padding:8px;
                                        color:#888;
                                    "
                                >
                                    OBSERVAÇÃO
                                </th>

                                <th
                                    style="
                                        text-align:center;
                                        padding:8px;
                                        color:#888;
                                    "
                                >
                                    AÇÃO
                                </th>

                            </tr>

                        </thead>


                        <tbody>

                            ${grupo.registros.map(r => `

                                <tr>

                                    <td
                                        style="
                                            padding:8px;
                                            color:#ccc;
                                        "
                                    >
                                        ${formatarData(r.data)}
                                    </td>


                                    <td
                                        style="
                                            padding:8px;
                                            color:#00ff88;
                                            font-weight:700;
                                        "
                                    >
                                        +${formatarHoras(r.horas)}h
                                    </td>


                                    <td
                                        style="
                                            padding:8px;
                                            color:#ffd600;
                                            font-weight:700;
                                        "
                                    >
                                        +${(
                                            Number(r.impressoesGanhas) || 0
                                        ).toLocaleString("pt-BR")}
                                    </td>


                                    <td
                                        style="
                                            padding:8px;
                                            color:#ccc;
                                        "
                                    >
                                        ${escaparHTML(r.obs || "—")}
                                    </td>


                                    <td
                                        style="
                                            padding:8px;
                                            text-align:center;
                                        "
                                    >

                                        <button
                                            class="btn-excluir"
                                            onclick="excluirRegistro('${r.id}')"
                                        >
                                            ✕
                                        </button>

                                    </td>

                                </tr>

                            `).join("")}

                        </tbody>

                    </table>


                    <div
                        style="
                            margin-top:12px;
                            padding-top:10px;
                            border-top:1px solid rgba(255,255,255,0.08);
                            display:flex;
                            justify-content:flex-end;
                            gap:20px;
                            font-weight:700;
                        "
                    >

                        <span style="color:#00ff88;">
                            TOTAL: +${formatarHoras(grupo.horas)}h
                        </span>

                        <span style="color:#ffd600;">
                            IMPRESSÕES:
                            +${grupo.impressoesGanhas.toLocaleString("pt-BR")}
                        </span>

                    </div>

                </div>

            </td>

        </tr>

        `;

    });


    tbody.innerHTML = html;

}


// =============================================================
// ABRIR / FECHAR DETALHES
// =============================================================

function alternarDetalhes(id, botao) {

    const linha =
        document.getElementById(id);


    if (!linha) {
        return;
    }


    if (linha.style.display === "none") {

        linha.style.display = "table-row";

        botao.innerHTML = "🔽 OCULTAR DIAS";

    } else {

        linha.style.display = "none";

        botao.innerHTML = "👁 VER DIAS";

    }

}


// =============================================================
// FORMATAR HORAS
// =============================================================
//
// Evita aparecer:
//
// 2.0000000000000004
//
// Mostra:
//
// 2h
// 2,5h
// 10,75h
// =============================================================

function formatarHoras(valor) {

    const numero =
        Number(valor) || 0;


    return numero
        .toFixed(2)
        .replace(/\.00$/, "")
        .replace(/(\.\d)0$/, "$1")
        .replace(".", ",");

}


// =============================================================
// ESCAPAR HTML
// =============================================================
//
// Protege a tela caso uma observação contenha caracteres HTML.
// =============================================================

function escaparHTML(valor) {

    if (valor === null || valor === undefined) {
        return "";
    }


    return String(valor)

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#039;");

}


// =============================================================
// EXCLUIR REGISTRO
// =============================================================

async function excluirRegistro(id) {

    if (!id) {
        return;
    }


    if (!confirm(
        "Excluir este registro de horas extras?"
    )) {

        return;

    }


    try {

        await db
            .collection("horas_extra")
            .doc(id)
            .delete();


        await carregarRegistros();


    } catch (err) {

        console.error(err);

        alert(
            "Erro ao excluir: " + err.message
        );

    }

}