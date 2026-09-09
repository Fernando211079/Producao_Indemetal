let idEditando = null;

// REGRAS carregadas dinamicamente do Firestore (configuracoes/geral)
// Fallback com os valores padrão caso o Firebase ainda não tenha respondido
let REGRAS = {
    'semiautomatica':{v:145,a:120}, 'rotativa':{v:530,a:500},
    'paralela':{v:80,a:65}, 'manual':{v:45,a:30},
    'sala-limpa':{v:145,a:120}, 'adesivo-liquido':{v:170,a:150}
};

// Carrega as metas do painel de configurações e sobrescreve REGRAS
async function carregarRegrasDoFirestore() {
    try {
        const snap = await db.collection("configuracoes").doc("geral").get();
        if (snap.exists) {
            const data = snap.data();
            if (data.familias) {
                Object.keys(data.familias).forEach(key => {
                    const meta = Number(data.familias[key].metaHora) || 0;
                    if (meta > 0) {
                        // alerta amarelo a partir de 90% da meta
                        REGRAS[key] = { v: meta, a: Math.round(meta * 0.9) };
                    }
                });
            }
        }
    } catch(e) {
        console.warn("Configurações: usando metas padrão.", e);
    }
}

const hToMin = (h) => {
    if(!h || !h.includes(':')) return 0;
    const [hrs, min] = h.split(':').map(n => parseInt(n) || 0);
    return (hrs * 60) + min;
};

const minToH = (m) => {
    return String(Math.floor(m / 60)).padStart(2,'0') + ":" + String(m % 60).padStart(2,'0');
};


// 🔥 LISTAR OPERADORES
function draw() {

    const setores = ['semiautomatica','rotativa','paralela','manual','sala-limpa','adesivo-liquido'];

    db.collection("operadores").onSnapshot(snapshot => {

        setores.forEach(s => { 
            const el = document.getElementById('box-' + s); 
            if(el) el.innerHTML = ''; 
        });

        snapshot.forEach(doc => {

            const op = doc.data();
            const box = document.getElementById('box-' + op.setor);

            if(box){

const div = document.createElement('div');
div.className = "operador-item";

div.style.display = "flex";
div.style.alignItems = "center";
div.style.padding = "8px 10px";

if(op.turno == '2'){
    div.style.borderLeft = "5px solid #ff9900";
    div.style.boxShadow = "0 0 10px rgba(255,153,0,0.4)";
}
else{
    div.style.borderLeft = "5px solid #00f2ff";
    div.style.boxShadow = "0 0 10px rgba(0,242,255,0.4)";
}

div.innerHTML = `
<div style="
display:flex;
justify-content:space-between;
align-items:center;
width:100%;
">

    <span style="
        font-weight:bold;
        color:white;
    ">
        ${op.turno == '2' ? '🟡' : '🔵'}
        ${op.nome}
        (${op.turno || '1'}º)
    </span>

    <span style="
        display:flex;
        gap:5px;
    ">

        <button
            onclick="alterarTurno('${doc.id}','${op.turno || '1'}', event)"
            style="
                background:#444;
                color:white;
                border:none;
                width:28px;
                height:28px;
                border-radius:5px;
                cursor:pointer;
            ">
            🔄
        </button>

        <button
            onclick="excluirOperador('${doc.id}', event)"
            style="
                background:#8b0000;
                color:white;
                border:none;
                width:28px;
                height:28px;
                border-radius:5px;
                cursor:pointer;
            ">
            🗑
        </button>

    </span>

</div>
`;

div.onclick = () => {

    localStorage.setItem('current_op_nome', op.nome);
    localStorage.setItem('current_op_setor', op.setor);
    localStorage.setItem('current_op_turno', op.turno || '1');
    localStorage.setItem('reabrir_produtividade', '1');

    window.location.href = 'producao.html';

};

box.appendChild(div);

            }
        });
    });
}


// 🔥 CADASTRAR
function add() {

    const n = document.getElementById('nome');
    const s = document.getElementById('setor');
    const t = document.getElementById('turno');

    if(!n.value.trim()) return;

    db.collection("operadores").add({
        nome: n.value.toUpperCase(),
        setor: s.value,
        turno: t.value
    })
    .then(() => {

        alert("Operador salvo!");

        n.value = '';

    });
}

// 🔥 SALVAR PRODUÇÃO
function salvarProducao() {

    const dataVal = document.getElementById('p-data').value;
    if(!dataVal) return alert("Selecione a Data!");

    const item = {
        nome: localStorage.getItem('current_op_nome'),
        setor: localStorage.getItem('current_op_setor'),
        turno: localStorage.getItem('current_op_turno'),
        data: dataVal,
        jornada: document.getElementById('p-hrs').value,
        qtd_imp: parseInt(document.getElementById('p-qtd-imp').value) || 0,
        qtd_set: parseInt(document.getElementById('p-qtd-set').value) || 0,
        t_set: document.getElementById('p-t-set').value, 
        t_tin: document.getElementById('p-t-tin').value,
        t_tel: document.getElementById('p-t-tel').value, 
        t_aus: document.getElementById('p-t-aus').value,
        t_out: document.getElementById('p-t-out').value, 
        obs: document.getElementById('p-obs').value.toUpperCase()
    };

console.log("Turno gravado:", item.turno);

    // 🔥 SE ESTIVER EDITANDO
    if(idEditando){

        db.collection("producao").doc(idEditando).update(item)
        .then(() => {
            alert("Atualizado com sucesso!");

            idEditando = null; // limpa modo edição
        });

    } else {

        // 🔥 NOVO REGISTRO
        db.collection("producao").add(item)
        .then(() => {
            alert("SALVOU!");
        });

    }
}


// 🔥 HISTÓRICO COMPLETO
function atualizarTabelaIndividual() {

    const nome = localStorage.getItem('current_op_nome');
    const setor = localStorage.getItem('current_op_setor');
    const filtro = document.getElementById('filtro-mes').value;
    const corpo = document.getElementById('corpo-individual');

    if(!corpo) return;

    const meta = REGRAS[setor];

    db.collection("producao")
    .where("nome", "==", nome)
    .where("setor", "==", setor)
    .onSnapshot(snapshot => {

        corpo.innerHTML = "";

        let dados = [];
        snapshot.forEach(doc => {
    dados.push({
        id: doc.id,
        ...doc.data()
    });
});

        const filtrados = dados
    .filter(item => item.data.substring(0,7) === filtro)
    .sort((a, b) => new Date(a.data) - new Date(b.data));

        let totalImp = 0;
        let totalMin = 0;

        let sumJ = 0;
        let sumQS = 0;
        let sumTS = 0;
        let sumTTi = 0;
        let sumTTe = 0;
        let sumTA = 0;
        let sumTO = 0;

        filtrados.forEach(item => {

            const dataBr = new Date(item.data + "T00:00:00").toLocaleDateString('pt-BR');

            const jornada = hToMin(item.jornada);
            const paradas = hToMin(item.t_set) + hToMin(item.t_tin) + hToMin(item.t_tel) + hToMin(item.t_aus) + hToMin(item.t_out);
            const tempoUtil = jornada - paradas;

            const ph = tempoUtil > 0 ? Math.round((item.qtd_imp / tempoUtil) * 60) : 0;

            totalImp += item.qtd_imp;
            totalMin += tempoUtil;

            sumJ += jornada;
            sumQS += item.qtd_set;
            sumTS += hToMin(item.t_set);
            sumTTi += hToMin(item.t_tin);
            sumTTe += hToMin(item.t_tel);
            sumTA += hToMin(item.t_aus);
            sumTO += hToMin(item.t_out);

            let cor = "white";
            if(meta){
                if(ph >= meta.v) cor = "#00ff00";
                else if(ph >= meta.a) cor = "yellow";
                else cor = "red";
            }

            const tr = document.createElement('tr');

            tr.innerHTML = `
    <td>${dataBr}</td>
    <td>${item.jornada}</td>
    <td>${item.qtd_imp}</td>
    <td>${item.qtd_set}</td>
    <td>${item.t_set}</td>
    <td>${item.t_tin}</td>
    <td>${item.t_tel}</td>
    <td>${item.t_aus}</td>
    <td>${item.t_out}</td>
    <td>${item.obs}</td>
    <td style="color:${cor}; font-weight:bold;">${ph}</td>

    <td>
        <button onclick="editarRegistro('${item.id}')" class="btn-action">✏️</button>
        <button onclick="excluirRegistro('${item.id}')" class="btn-action" style="border-color:red;color:red;">🗑️</button>
    </td>
`;

            corpo.appendChild(tr);
        });

        // 🔥 LINHA TOTAL COMPLETA
        if(filtrados.length > 0){

            const mediaPH = totalMin > 0 ? Math.round((totalImp / totalMin) * 60) : 0;

            let corMedia = "white";
            if(meta){
                if(mediaPH >= meta.v) corMedia = "#00ff00";
                else if(mediaPH >= meta.a) corMedia = "yellow";
                else corMedia = "red";
            }

            const trTotal = document.createElement('tr');

            trTotal.style.background = "rgba(0,229,255,0.2)";

            trTotal.innerHTML = `
                <td><b>TOTAL</b></td>
                <td><b>${minToH(sumJ)}</b></td>
                <td><b>${totalImp}</b></td>
                <td><b>${sumQS}</b></td>
                <td><b>${minToH(sumTS)}</b></td>
                <td><b>${minToH(sumTTi)}</b></td>
                <td><b>${minToH(sumTTe)}</b></td>
                <td><b>${minToH(sumTA)}</b></td>
                <td><b>${minToH(sumTO)}</b></td>
                <td><b>MÉDIA</b></td>
                <td style="color:${corMedia}; font-weight:bold;"><b>${mediaPH}</b></td>
            `;

            corpo.appendChild(trTotal);
        }

    });
}


// 🔥 INICIAR
window.onload = async () => {

    if(document.getElementById('nome')) draw();

    if(document.getElementById('corpo-individual')) {

        const nome = localStorage.getItem('current_op_nome') || "-";
        const setor = localStorage.getItem('current_op_setor') || "-";
        const turno = localStorage.getItem('current_op_turno') || "1";

        document.getElementById('op-nome-display').innerText = nome;
        document.getElementById('op-setor-display').innerText =
    setor +
    (turno === "2"
        ? " | 🌙 2º TURNO"
        : " | ☀️ 1º TURNO");
  
        if(turno === "1"){
    document.getElementById('p-hrs').value = "07:04";
}

if(turno === "2"){
    document.getElementById('p-hrs').value = "06:24";
}

        // Carrega metas dinâmicas do painel de configurações
        await carregarRegrasDoFirestore();

        const meta = REGRAS[setor];
        if(meta){
            document.getElementById('meta-display').innerText = meta.v + " P/H";
        }

        const h = new Date();

        document.getElementById('filtro-mes').value = h.toISOString().substring(0,7);
        document.getElementById('p-data').value = h.toISOString().split('T')[0];

        atualizarTabelaIndividual();
    }
};
function excluirRegistro(id) {
    if(confirm("Deseja excluir este registro?")) {
        db.collection("producao").doc(id).delete()
        .then(() => {
            alert("Excluído com sucesso!");
        });
    }
}

function editarRegistro(id) {

    db.collection("producao").doc(id).get().then(doc => {

        if(!doc.exists) return alert("Registro não encontrado!");

        const d = doc.data();

        // Preenche os campos
        document.getElementById('p-data').value = d.data;
        document.getElementById('p-hrs').value = d.jornada;
        document.getElementById('p-qtd-imp').value = d.qtd_imp;
        document.getElementById('p-qtd-set').value = d.qtd_set;
        document.getElementById('p-t-set').value = d.t_set;
        document.getElementById('p-t-tin').value = d.t_tin;
        document.getElementById('p-t-tel').value = d.t_tel;
        document.getElementById('p-t-aus').value = d.t_aus;
        document.getElementById('p-t-out').value = d.t_out;
        document.getElementById('p-obs').value = d.obs;

        // Marca que está editando
        idEditando = id;

        alert("Modo edição ativado!");
    });

}
function excluirOperador(id, event) {

    // evita abrir a tela de produção
    event.stopPropagation();

    if(confirm("Deseja excluir este operador?")) {

        db.collection("operadores").doc(id).delete()
        .then(() => {
            alert("Operador excluído!");
        })
        .catch(() => {
            alert("Erro ao excluir!");
        });

    }
}

function alterarTurno(id, turnoAtual, event){

    event.stopPropagation();

    const novoTurno = turnoAtual === "2" ? "1" : "2";

    db.collection("operadores")
    .doc(id)
    .update({
        turno: novoTurno
    })
    .then(() => {

        alert(
            "Turno alterado para " +
            (novoTurno === "1" ? "1º Turno" : "2º Turno")
        );

    });

}