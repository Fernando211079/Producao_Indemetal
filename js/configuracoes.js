// =======================================================
// INDEMETAL — Configurações Globais do Sistema
// Lê do Firestore e expõe CONFIG globalmente.
// =======================================================

const CONFIG_DEFAULT = {

    eficiencia: 0.80,

    turnos: {
        1: { nome: "1º Turno", horasSegQui: 9, horasSex: 8 },
        2: { nome: "2º Turno", horasSegQui: 8, horasSex: 7 }
    },

    familias: {
        rotativa:          { nome: "Rotativa",        maquinas: 8, op_t1: 4, op_t2: 2, metaHora: 530 },
        semiautomatica:    { nome: "Semiautomática",  maquinas: 8, op_t1: 4, op_t2: 2, metaHora: 145 },
        paralela:          { nome: "Paralela",        maquinas: 4, op_t1: 2, op_t2: 1, metaHora: 80  },
        manual:            { nome: "Manual",          maquinas: 4, op_t1: 2, op_t2: 1, metaHora: 45  },
        "sala-limpa":      { nome: "Sala Limpa",      maquinas: 2, op_t1: 1, op_t2: 1, metaHora: 145 },
        "adesivo-liquido": { nome: "Adesivo Líquido", maquinas: 2, op_t1: 1, op_t2: 1, metaHora: 170 }
    }

};

// CONFIG global — começa com defaults, sobrescrito pelo Firestore
let CONFIG = JSON.parse(JSON.stringify(CONFIG_DEFAULT));

// Promise que resolve quando CONFIG estiver pronto
// Use:  await CONFIG_PRONTO  antes de usar CONFIG
let CONFIG_PRONTO = (async () => {

    try {

        const snap = await db.collection("configuracoes").doc("geral").get();

        if (snap.exists) {

            const data = snap.data();

            // Eficiência (armazenada como inteiro 0-100 no Firestore)
            CONFIG.eficiencia = (data.eficiencia || 80) / 100;

            // Jornadas
            CONFIG.turnos[1].horasSegQui = data.horasSegQui_t1 || 9;
            CONFIG.turnos[1].horasSex    = data.horasSex_t1    || 8;
            CONFIG.turnos[2].horasSegQui = data.horasSegQui_t2 || 8;
            CONFIG.turnos[2].horasSex    = data.horasSex_t2    || 7;

            // Famílias
            if (data.familias) {
                Object.keys(data.familias).forEach(key => {
                    if (CONFIG.familias[key]) {
                        const f = data.familias[key];
                        CONFIG.familias[key].maquinas  = f.maquinas  ?? CONFIG.familias[key].maquinas;
                        CONFIG.familias[key].op_t1     = f.op_t1     ?? (f.operadores ?? CONFIG.familias[key].op_t1);
                        CONFIG.familias[key].op_t2     = f.op_t2     ?? CONFIG.familias[key].op_t2;
                        CONFIG.familias[key].metaHora  = f.metaHora  ?? CONFIG.familias[key].metaHora;
                    }
                });
            }

        }

    } catch (err) {
        console.warn("⚠️ Configurações: usando valores padrão.", err);
    }

    return CONFIG;

})();

// =======================================================
// HELPER GLOBAL — capacidade diária de uma família
// cap = [ min(maq, op_t1) × hT1  +  min(maq, op_t2) × hT2 ]
//       × meta × eficiência
// Chame com isSexta=true para usar a jornada de sexta
// =======================================================

function configCapDia(familiaKey, isSexta) {

    const fam = CONFIG.familias[familiaKey];
    if (!fam) return 0;

    const hT1 = isSexta ? CONFIG.turnos[1].horasSex    : CONFIG.turnos[1].horasSegQui;
    const hT2 = isSexta ? CONFIG.turnos[2].horasSex    : CONFIG.turnos[2].horasSegQui;
    const ef  = CONFIG.eficiencia;

    const maq      = Number(fam.maquinas || 0);
    const ativasT1 = Math.min(maq, Number(fam.op_t1 || 0));
    const ativasT2 = Math.min(maq, Number(fam.op_t2 || 0));

    return (ativasT1 * hT1 + ativasT2 * hT2) * fam.metaHora * ef;

}

// Capacidade média diária considerando 4 dias seg-qui + 1 sexta por semana
function configCapDiaMedia(familiaKey) {
    return (configCapDia(familiaKey, false) * 4 + configCapDia(familiaKey, true)) / 5;
}
