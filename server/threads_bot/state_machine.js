/**
 * state_machine.js — Máquina de Estados do Threads Bot
 *
 * Define os 9 estados possíveis e as transições válidas entre eles.
 * Nenhuma ação pode ser executada fora do estado correto.
 */

const STATES = {
    IDLE:                   'IDLE',
    BUSCANDO_POST:          'BUSCANDO_POST',
    ANALISANDO_POST:        'ANALISANDO_POST',
    ABRINDO_COMENTARIOS:    'ABRINDO_COMENTARIOS',
    ESCREVENDO_COMENTARIO:  'ESCREVENDO_COMENTARIO',
    VALIDANDO_COMENTARIO:   'VALIDANDO_COMENTARIO',
    FECHANDO_COMENTARIOS:   'FECHANDO_COMENTARIOS',
    PROXIMO_POST:           'PROXIMO_POST',
    RECUPERACAO_DE_ERRO:    'RECUPERACAO_DE_ERRO',
};

// Mapa de transições válidas: estado atual → estados permitidos
const TRANSITIONS = {
    [STATES.IDLE]:                  [STATES.BUSCANDO_POST],
    [STATES.BUSCANDO_POST]:         [STATES.ANALISANDO_POST, STATES.RECUPERACAO_DE_ERRO],
    [STATES.ANALISANDO_POST]:       [STATES.ABRINDO_COMENTARIOS, STATES.PROXIMO_POST, STATES.RECUPERACAO_DE_ERRO],
    [STATES.ABRINDO_COMENTARIOS]:   [STATES.ESCREVENDO_COMENTARIO, STATES.RECUPERACAO_DE_ERRO],
    [STATES.ESCREVENDO_COMENTARIO]: [STATES.VALIDANDO_COMENTARIO, STATES.RECUPERACAO_DE_ERRO],
    [STATES.VALIDANDO_COMENTARIO]:  [STATES.FECHANDO_COMENTARIOS, STATES.RECUPERACAO_DE_ERRO],
    [STATES.FECHANDO_COMENTARIOS]:  [STATES.PROXIMO_POST, STATES.RECUPERACAO_DE_ERRO],
    [STATES.PROXIMO_POST]:          [STATES.ANALISANDO_POST, STATES.BUSCANDO_POST, STATES.IDLE],
    [STATES.RECUPERACAO_DE_ERRO]:   [STATES.PROXIMO_POST, STATES.BUSCANDO_POST, STATES.IDLE],
};

class StateMachine {
    constructor(logger) {
        this.current = STATES.IDLE;
        this.logger = logger;
        this.history = [STATES.IDLE];
    }

    /**
     * Retorna o estado atual
     */
    getState() {
        return this.current;
    }

    /**
     * Verifica se está no estado esperado
     */
    is(state) {
        return this.current === state;
    }

    /**
     * Tenta transicionar para um novo estado.
     * Lança erro se a transição for inválida.
     * @param {string} newState - Um dos valores de STATES
     */
    transition(newState) {
        const allowed = TRANSITIONS[this.current];
        if (!allowed || !allowed.includes(newState)) {
            const msg = `[StateMachine] Transição INVÁLIDA: ${this.current} → ${newState}. Permitidas: [${(allowed || []).join(', ')}]`;
            this.logger.log(msg, 'error');
            throw new Error(msg);
        }

        this.logger.logStateTransition(this.current, newState);
        this.history.push(newState);
        this.current = newState;
    }

    /**
     * Força transição para RECUPERACAO_DE_ERRO a partir de qualquer estado,
     * sem respeitar restrições de transição — usado em catch blocks.
     */
    forceError() {
        if (this.current !== STATES.RECUPERACAO_DE_ERRO) {
            this.logger.logStateTransition(this.current, STATES.RECUPERACAO_DE_ERRO);
            this.history.push(STATES.RECUPERACAO_DE_ERRO);
            this.current = STATES.RECUPERACAO_DE_ERRO;
        }
    }

    /**
     * Retorna histórico de estados para diagnóstico
     */
    getHistory() {
        return [...this.history];
    }
}

module.exports = { StateMachine, STATES };
