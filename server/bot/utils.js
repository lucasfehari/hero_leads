// Helper functions

const randomDelay = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1) + min);
};

const humanType = async (page, text) => {
    // Type with random delays between keystrokes (50ms - 200ms)
    // Occasional long pauses (simulating thinking)
    for (const char of text) {
        await page.keyboard.type(char, { delay: randomDelay(40, 120) });
        if (Math.random() < 0.05) { // 5% chance of a "thinking" pause
            await randomDelay(400, 800);
        }
    }
};

/*
 * Human Scroll
 * Scrolls with variable speed, pauses, and occasional scroll-ups (reading).
 */
const autoScroll = async (page) => {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            let distance = 100;

            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;

                // Randomize scroll distance
                const randomScroll = Math.floor(Math.random() * 150) + 50;

                // 10% chance to scroll UP (Reading something again)
                if (Math.random() < 0.1 && window.scrollY > 200) {
                    window.scrollBy(0, -100);
                } else {
                    window.scrollBy(0, randomScroll);
                }

                totalHeight += randomScroll;

                if (totalHeight >= scrollHeight - window.innerHeight || totalHeight > 3000) { // Limit scroll depth
                    clearInterval(timer);
                    resolve();
                }
            }, Math.floor(Math.random() * 400) + 200); // Random interval 200-600ms
        });
    });
};

/*
 * Bezier Curve Mouse Movement
 * Simulates organic hand movement rather than straight lines.
 */
const humanMove = async (page) => {
    // We start from a random position or current position if possible
    // Puppeteer doesn't track current mouse pos easily without storage, so we assume random move.

    const width = 1280; // Standard viewport width
    const height = 800;

    // Target: Random point on screen
    const targetX = Math.floor(Math.random() * width * 0.8) + (width * 0.1);
    const targetY = Math.floor(Math.random() * height * 0.8) + (height * 0.1);

    const startX = Math.random() * width;
    const startY = Math.random() * height;

    // Two Control Points for Cubic Bezier (More complex curve)
    const cp1X = Math.random() * width;
    const cp1Y = Math.random() * height;
    const cp2X = Math.random() * width;
    const cp2Y = Math.random() * height;

    const steps = 30 + Math.floor(Math.random() * 20); // 30-50 steps

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;

        // Cubic Bezier Formula
        // B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)t^2*P2 + t^3*P3
        const cx = 3 * (1 - t) * (1 - t) * t * cp1X + 3 * (1 - t) * t * t * cp2X;
        const cy = 3 * (1 - t) * (1 - t) * t * cp1Y + 3 * (1 - t) * t * t * cp2Y;

        const x = Math.pow(1 - t, 3) * startX + cx + Math.pow(t, 3) * targetX;
        const y = Math.pow(1 - t, 3) * startY + cy + Math.pow(t, 3) * targetY;

        await page.mouse.move(x, y);

        // Micro-pause (friction)
        if (i % 5 === 0) {
            await new Promise(r => setTimeout(r, Math.random() * 5));
        }
    }
};

// Scroll inside a specific element (like a modal)
const scrollElement = async (page, selector) => {
    await page.evaluate(async (sel) => {
        const el = document.querySelector(sel);
        if (el) {
            el.scrollBy({ top: 500, behavior: 'smooth' });
        }
    }, selector);
};

// Smart Click: Move to element with curve, hover, pause, then click
const smartClick = async (page, elementHandle) => {
    if (!elementHandle) return;

    try {
        const box = await elementHandle.boundingBox();
        if (box) {
            // Target: Center of element + slight noise
            const targetX = box.x + (box.width / 2) + (Math.random() * 10 - 5);
            const targetY = box.y + (box.height / 2) + (Math.random() * 10 - 5);

            // Current mouse pos is unknown, so we move *to* the target in steps
            // Ideally we'd valid current mouse pos but Puppeteer tracks it internally.
            // Let's just use move with steps which is linear, but better than instant.
            // For true human, we'd calculate curve from last known pos.

            await page.mouse.move(targetX, targetY, { steps: 25 });

            // Hover / "Confirming"
            await randomDelay(400, 1000);

            await elementHandle.click();
        } else {
            // Fallback if no bounding box
            await elementHandle.click();
        }
    } catch (e) {
        console.error("Smart click failed, using standard click:", e);
        try { await elementHandle.click(); } catch (err) { }
    }
};

module.exports = { randomDelay, humanType, autoScroll, humanMove, scrollElement, smartClick };
