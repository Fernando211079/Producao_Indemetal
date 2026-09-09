/*
 * config.js — compatibilidade retroativa
 * As configurações reais estão em js/configuracoes.js (lidas do Firestore).
 * Este arquivo existe apenas para não quebrar scripts antigos que
 * referenciam CONFIG diretamente sem carregar js/configuracoes.js.
 * Não edite aqui — use o painel de Configurações.
 */

// Se CONFIG já foi carregado por js/configuracoes.js, não sobrescreve.
if (typeof CONFIG === "undefined") {

    var CONFIG = {

        empresa: "INDEMETAL",

        eficiencia: 0.80,

        jornada: {
            turno1: { segundaQuinta: 9, sexta: 8 },
            turno2: { segundaQuinta: 8, sexta: 7 }
        },

        familias: {
            semiautomatica:    { nome: "Semiautomática",  ph: 145, maquinas: 8, operadores: 8, metaHora: 145 },
            rotativa:          { nome: "Rotativa",        ph: 530, maquinas: 8, operadores: 8, metaHora: 530 },
            paralela:          { nome: "Paralela",        ph: 80,  maquinas: 4, operadores: 4, metaHora: 80  },
            manual:            { nome: "Manual",          ph: 45,  maquinas: 4, operadores: 4, metaHora: 45  },
            "sala-limpa":      { nome: "Sala Limpa",      ph: 145, maquinas: 2, operadores: 2, metaHora: 145 },
            "adesivo-liquido": { nome: "Adesivo Líquido", ph: 170, maquinas: 2, operadores: 2, metaHora: 170 }
        }

    };

}
