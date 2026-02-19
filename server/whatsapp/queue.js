const antiBan = require('./anti-ban');

const {
    gaussianDelay, distractionSpike, sleep,
    getSessionWarmup, recordSend,
    simulateHumanActivity,
    loadBadNumbers, saveBadNumber, isValidWhatsAppNumber,
    humanizeMessage,
    checkRateLimits,
    shuffleContacts,
} = antiBan;

class MessageQueue {
    constructor(getClient, getSessionName) {
        this.getClient = getClient;     // () => currentClient
        this.getSessionName = getSessionName || (() => 'default');
        this.queue = [];
        this.isProcessing = false;
        this.totalProcessed = 0;
        this.totalSkipped = 0;
        this.statusCallback = null;
        this.config = {
            minDelay: 10,
            maxDelay: 30,
            batchSize: 20,
            longPauseMin: 600,
            longPauseMax: 900,
            msgMinDelay: 3,
            msgMaxDelay: 8,
            // Anti-ban
            hourlyLimit: 40,
            dailyLimit: null,
            activityEvery: 5,
            validateNumbers: true,
            emojiPool: [],
            antiBanEnabled: true,
            shuffle: true,
            // Agendamento
            scheduleEnabled: false,
            scheduleStart: '08:00',   // 'HH:MM'
            scheduleEnd: '18:00',     // 'HH:MM'
        };
    }

    // Retorna minutos desde meia-noite para uma string 'HH:MM'
    _toMinutes(hhmm) {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
    }

    // Verifica se agora está dentro da janela configurada
    isWithinSchedule() {
        if (!this.config.scheduleEnabled) return true;
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const start = this._toMinutes(this.config.scheduleStart);
        const end = this._toMinutes(this.config.scheduleEnd);
        return cur >= start && cur < end;
    }

    // Calcula ms até o próximo horário de início
    msUntilScheduleStart() {
        const now = new Date();
        const cur = now.getHours() * 60 + now.getMinutes();
        const start = this._toMinutes(this.config.scheduleStart);
        let diff = start - cur; // em minutos
        if (diff <= 0) diff += 24 * 60; // próximo dia
        return diff * 60 * 1000;
    }

    setConfig(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * @param {string[]} numbers
     * @param {string[]} messages - Array de mensagens enviadas em sequência para cada número
     */
    addToQueue(numbers, messages) {
        let list = this.config.antiBanEnabled && this.config.shuffle
            ? shuffleContacts(numbers)
            : numbers;

        const badNumbers = loadBadNumbers(sessionName);
        const tasks = list.map(num => ({
            number: num.replace(/\D/g, '') + '@c.us',
            rawNumber: num.replace(/\D/g, ''),
            messages: messages
        })).filter(t => !badNumbers.has(t.number));

        const skipped = numbers.length - tasks.length;
        if (skipped > 0) this.notifyStatus('bad_numbers_skipped', { count: skipped });

        this.queue.push(...tasks);
        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        // ── Agendamento: espera o horário de início se necessário ────────────
        if (this.config.scheduleEnabled && !this.isWithinSchedule()) {
            const waitMs = this.msUntilScheduleStart();
            const waitMin = Math.round(waitMs / 60000);
            this.notifyStatus('scheduled_wait', {
                msg: `⏰ Campanha agendada — iniciando em ${waitMin} minuto(s) (às ${this.config.scheduleStart})`
            });
            await sleep(waitMs);
        }

        this.notifyStatus('processing');
        let contactsProcessed = 0;

        while (this.queue.length > 0) {
            // ── Agendamento: pausa se saiu da janela de envio ─────────────────
            if (this.config.scheduleEnabled && !this.isWithinSchedule()) {
                const waitMs = this.msUntilScheduleStart();
                const waitMin = Math.round(waitMs / 60000);
                this.notifyStatus('schedule_pause', {
                    msg: `⏸ Fora do horário (${this.config.scheduleEnd}) — retomando às ${this.config.scheduleStart} (em ${waitMin}min)`
                });
                await sleep(waitMs);
                this.notifyStatus('processing');
            }

            const task = this.queue.shift();
            const client = this.getClient();
            const sessionName = this.getSessionName();


            // ── Camada 6: Verificar limites de taxa ───────────────────────────
            if (this.config.antiBanEnabled) {
                const limits = checkRateLimits(sessionName, this.config);
                if (limits.hardStop) {
                    this.notifyStatus('rate_limit', { msg: `🛑 ${limits.reason}` });
                    // Aguarda até a próxima hora e recalcula
                    await sleep(60000);
                    this.queue.unshift(task); // devolve o contato
                    continue;
                }
                if (limits.softThrottle) {
                    this.notifyStatus('throttle', { msg: `⚠️ ${limits.reason}` });
                    // Aumenta delays em 50%
                    await sleep(gaussianDelay(
                        this.config.minDelay * 1500,
                        this.config.maxDelay * 1500
                    ));
                }
            }

            try {
                // ── Camada 4: Validar número ──────────────────────────────────
                if (this.config.antiBanEnabled && this.config.validateNumbers && client) {
                    const valid = await isValidWhatsAppNumber(client, task.number);
                    if (!valid) {
                        saveBadNumber(sessionName, task.number);
                        this.totalSkipped++;
                        this.notifyStatus('invalid_number', { number: task.rawNumber, skipped: this.totalSkipped });
                        continue;
                    }
                }

                // ── Enviar cada mensagem para este contato ─────────────────────
                for (let i = 0; i < task.messages.length; i++) {
                    const rawTemplate = task.messages[i];

                    // ── Camada 5: Humanizar mensagem ──────────────────────────
                    const message = this.config.antiBanEnabled
                        ? humanizeMessage(rawTemplate, { emojiPool: this.config.emojiPool })
                        : rawTemplate.replace(/\{([^{}]+)\}/g, (_, c) => {
                            const opts = c.split('|');
                            return opts[Math.floor(Math.random() * opts.length)];
                        });

                    // Simulação de digitação (typing indicator)
                    try {
                        if (client) {
                            const chat = await client.getChatById(task.number);
                            await chat.sendStateTyping();
                            // Tempo de digitação proporcional ao tamanho (humano)
                            const typingTime = this.config.antiBanEnabled
                                ? gaussianDelay(
                                    Math.min(message.length * 50, 1000),
                                    Math.min(message.length * 120, 6000)
                                )
                                : Math.min(message.length * 80, 4000);
                            await sleep(typingTime);
                        }
                    } catch (e) {
                        await sleep(1500);
                    }

                    // Enviar
                    const activeClient = this.getClient();
                    if (!activeClient) throw new Error('Cliente WhatsApp não disponível');
                    await activeClient.sendMessage(task.number, message);

                    this.totalProcessed++;

                    // Registrar envio para warmup/rate limiter
                    if (this.config.antiBanEnabled) {
                        recordSend(sessionName, this.config.dailyLimit);
                    }

                    this.notifyStatus('sent', {
                        number: task.rawNumber,
                        count: this.totalProcessed,
                        msgIndex: i + 1,
                        msgTotal: task.messages.length,
                    });

                    // Delay entre mensagens da mesma pessoa (se houver mais)
                    if (i < task.messages.length - 1) {
                        const interDelay = this.config.antiBanEnabled
                            ? gaussianDelay(this.config.msgMinDelay * 1000, this.config.msgMaxDelay * 1000)
                            : Math.random() * (this.config.msgMaxDelay - this.config.msgMinDelay) * 1000 + this.config.msgMinDelay * 1000;
                        this.notifyStatus('waiting_next_msg', { duration: interDelay, number: task.rawNumber });
                        await sleep(interDelay);
                    }
                }

                contactsProcessed++;

                // ── Camada 3: Atividade humana entre contatos ─────────────────
                if (
                    this.config.antiBanEnabled &&
                    contactsProcessed % this.config.activityEvery === 0 &&
                    this.queue.length > 0
                ) {
                    await simulateHumanActivity(this.getClient(), (status, data) =>
                        this.notifyStatus(status, data)
                    );
                }

                // ── Anti-ban: delay entre contatos ────────────────────────────
                if (this.queue.length > 0) {
                    const isBatchPause = this.totalProcessed % this.config.batchSize === 0;

                    if (isBatchPause) {
                        const pause = this.config.antiBanEnabled
                            ? gaussianDelay(this.config.longPauseMin * 1000, this.config.longPauseMax * 1000)
                            : Math.random() * (this.config.longPauseMax - this.config.longPauseMin) * 1000 + this.config.longPauseMin * 1000;
                        this.notifyStatus('batch_pause', { duration: pause });
                        await sleep(pause);
                    } else {
                        let delay = gaussianDelay(
                            this.config.minDelay * 1000,
                            this.config.maxDelay * 1000
                        );
                        // Camada 1: spike de distração ocasional
                        if (this.config.antiBanEnabled) {
                            delay += distractionSpike(this.config.maxDelay * 1000);
                        }
                        this.notifyStatus('waiting', { duration: delay });
                        await sleep(delay);
                    }
                }

            } catch (error) {
                console.error('Erro ao enviar mensagem WhatsApp:', error);
                this.notifyStatus('error', { number: task.rawNumber, error: error.message });
            }
        }

        this.isProcessing = false;
        this.notifyStatus('idle', { total: this.totalProcessed, skipped: this.totalSkipped });
    }

    onStatus(callback) { this.statusCallback = callback; }

    notifyStatus(status, data = {}) {
        if (this.statusCallback) {
            this.statusCallback({ status, ...data, queueLength: this.queue.length });
        }
    }
}

module.exports = MessageQueue;
