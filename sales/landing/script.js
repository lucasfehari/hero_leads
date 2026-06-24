/* ─── Scroll Interativo & FAQ & Timer & Nav ─── */

// ── Nav scroll ───────────────────────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 50);
});

// ── FAQ accordion ────────────────────────────────────────────────
document.querySelectorAll('.faq__question').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq__item');
    const isOpen = item.classList.contains('open');

    // Fecha todos
    document.querySelectorAll('.faq__item.open').forEach(el => {
      el.classList.remove('open');
      el.querySelector('.faq__question').setAttribute('aria-expanded', 'false');
    });

    // Abre o clicado
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// ── Countdown Timer ──────────────────────────────────────────────
(function () {
  // Pega ou cria timestamp de deadline (24h a partir da primeira visita)
  const DEADLINE_KEY = 'browzebot_deadline';
  let deadline = localStorage.getItem(DEADLINE_KEY);

  if (!deadline) {
    deadline = Date.now() + 24 * 60 * 60 * 1000; // 24 horas
    localStorage.setItem(DEADLINE_KEY, deadline);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function tick() {
    const now = Date.now();
    const diff = Math.max(0, deadline - now);

    const totalSeconds = Math.floor(diff / 1000);
    const hours   = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const elH = document.getElementById('timerH');
    const elM = document.getElementById('timerM');
    const elS = document.getElementById('timerS');

    if (elH) elH.textContent = pad(hours);
    if (elM) elM.textContent = pad(minutes);
    if (elS) elS.textContent = pad(seconds);

    if (diff <= 0) {
      // Reset timer quando expirar
      localStorage.removeItem(DEADLINE_KEY);
    }
  }

  tick();
  setInterval(tick, 1000);
})();

// ── Scroll reveal ────────────────────────────────────────────────
(function () {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  // Adiciona classe e estilo inicial para elementos a revelar
  const revealTargets = document.querySelectorAll(
    '.feature-card, .testimonial-card, .how__step, .problem__item, .faq__item'
  );

  revealTargets.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = `opacity 0.6s ease ${i * 0.05}s, transform 0.6s ease ${i * 0.05}s`;
    observer.observe(el);
  });

  document.addEventListener('scroll', () => {}, { passive: true });

  // Adiciona o CSS de .revealed dinamicamente
  const style = document.createElement('style');
  style.textContent = '.revealed { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);
})();

// ── Smooth anchor links ───────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// ── Mobile nav ────────────────────────────────────────────────────
const hamburger = document.getElementById('navHamburger');
let mobileMenuOpen = false;
let mobileNav = null;

hamburger?.addEventListener('click', () => {
  mobileMenuOpen = !mobileMenuOpen;

  if (mobileMenuOpen) {
    mobileNav = document.createElement('div');
    mobileNav.className = 'mobile-nav';
    mobileNav.innerHTML = `
      <style>
        .mobile-nav {
          position: fixed; inset: 0; z-index: 999;
          background: rgba(7,7,18,0.97);
          backdrop-filter: blur(20px);
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 32px; animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .mobile-nav a {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.8rem; font-weight: 700;
          color: #f1f5f9; text-decoration: none;
          transition: color 0.2s;
        }
        .mobile-nav a:hover { color: #818cf8; }
        .mobile-nav-close {
          position: absolute; top: 24px; right: 24px;
          font-size: 1.5rem; cursor: pointer;
          color: #94a3b8; background: none; border: none;
        }
      </style>
      <button class="mobile-nav-close" id="mobileClose">✕</button>
      <a href="#features">Módulos</a>
      <a href="#how">Como Funciona</a>
      <a href="#pricing">Preços</a>
      <a href="#faq">FAQ</a>
      <a href="#pricing" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Quero Acesso →</a>
    `;
    document.body.appendChild(mobileNav);

    document.getElementById('mobileClose').addEventListener('click', closeMobile);
    mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMobile));
  } else {
    closeMobile();
  }
});

function closeMobile() {
  mobileMenuOpen = false;
  if (mobileNav) { mobileNav.remove(); mobileNav = null; }
}

// ── CTA button pulse ring ─────────────────────────────────────────
(function () {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes ring {
      0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.6); }
      70%  { box-shadow: 0 0 0 12px rgba(99,102,241,0); }
      100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
    }
    #buyNowBtn, #finalCtaBtn {
      animation: ring 2.5s ease-in-out infinite, float 4s ease-in-out infinite;
    }
  `;
  document.head.appendChild(style);
})();

console.log('%c⚡ Browze Bot', 'color:#818cf8;font-size:20px;font-weight:900;');
console.log('%cAutomação de Prospecção que realmente funciona.', 'color:#94a3b8;font-size:13px;');
