/**
 * auto-scale.js — INDEMETAL
 * Aplica zoom automático ao body quando a janela for menor que o
 * breakpoint de design (1600px), mantendo tudo visível na tela
 * sem scroll horizontal.
 *
 * Exemplos de escala resultante:
 *   1920px → 100%  (sem alteração)
 *   1600px → 100%  (sem alteração)
 *   1366px →  85%
 *   1280px →  80%
 *   1024px →  64%
 */
(function () {
    // Largura de referência do design (px) — altere se necessário
    var DESIGN_WIDTH = 1600;

    function applyScale() {
        var winW = window.innerWidth;
        if (winW < DESIGN_WIDTH) {
            var scale = winW / DESIGN_WIDTH;
            document.documentElement.style.zoom = scale;
        } else {
            document.documentElement.style.zoom = '';
        }
    }

    // Aplica assim que o DOM existir
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyScale);
    } else {
        applyScale();
    }

    // Re-aplica ao redimensionar
    window.addEventListener('resize', applyScale);
})();
