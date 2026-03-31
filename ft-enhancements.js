(function FTEnhancements() {
  'use strict';

  const CSS = `
    .topbar {
      padding-left: 16px !important;
      padding-right: 16px !important;
      align-items: center !important;
      gap: 10px !important;
    }
    .topbar-title { line-height: 1.1 !important; }

    .add-btn, .dash-btn, .avatar-btn {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0 !important;
    }

    #appScreen .topbar { display: flex !important; }
    #appScreen .topbar > *:last-child { margin-left: auto !important; }

    .teacher-card, .batch-card, .student-card, .standalone-card {
      position: relative;
      overflow: hidden;
    }
    .card-top {
      align-items: flex-start !important;
    }
    .due-amount {
      line-height: 1 !important;
    }

    .pay-tabs {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(0, 1fr)) !important;
      gap: 7px !important;
    }
    .pay-tab {
      width: 100% !important;
      text-align: center !important;
    }

    .section-label {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding-left: 2px !important;
      margin-bottom: 14px !important;
    }
    .section-label-count {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: 22px !important;
      height: 18px !important;
    }

    .modal-sheet {
      padding-bottom: max(52px, calc(32px + env(safe-area-inset-bottom, 0px))) !important;
    }

    .batch-subj-chip {
      display: inline-flex !important;
      align-items: center !important;
      height: 22px !important;
      white-space: nowrap !important;
    }

    .total-card { isolation: isolate; }
    .total-meta {
      display: flex !important;
      align-items: stretch !important;
    }
    .total-meta-item {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 1 !important;
      text-align: center !important;
    }

    .search-wrap { position: relative !important; display: flex !important; align-items: center !important; }
    .search-icon {
      position: absolute !important;
      left: 13px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      display: flex !important;
      align-items: center !important;
      pointer-events: none !important;
    }
    .search-clear {
      position: absolute !important;
      right: 12px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 20px !important;
      height: 20px !important;
      border-radius: 50% !important;
      background: var(--surface3) !important;
      color: var(--muted) !important;
    }

    .toast {
      left: 50% !important;
      transform: translateX(-50%) !important;
      white-space: nowrap !important;
      max-width: calc(100vw - 32px) !important;
    }

    .confirm-overlay {
      align-items: center !important;
      justify-content: center !important;
    }
    .confirm-box {
      width: calc(100% - 48px) !important;
      max-width: 320px !important;
    }
    .confirm-actions {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 9px !important;
    }

    .user-menu {
      top: max(56px, calc(env(safe-area-inset-top, 0px) + 56px)) !important;
    }
    .menu-user-section {
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    }

    .role-toggle {
      align-items: stretch !important;
    }
    .role-opt {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
    }

    .bd-sum-pills {
      display: flex !important;
      gap: 8px !important;
      flex-wrap: wrap !important;
    }
    .bd-sum-pill {
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
    }

    .standalone-actions {
      display: flex !important;
      align-items: center !important;
      justify-content: flex-end !important;
      gap: 4px !important;
      padding: 0 10px 10px !important;
    }
    .standalone-action-btn {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
    }

    .ft-ripple {
      position: absolute;
      border-radius: 50%;
      transform: scale(0);
      pointer-events: none;
      background: rgba(255,255,255,0.18);
      animation: ftRippleAnim 0.55s cubic-bezier(0.4, 0, 0.2, 1) forwards;
      z-index: 9999;
    }
    :root.light .ft-ripple { background: rgba(80,80,140,0.10); }
    @keyframes ftRippleAnim {
      to { transform: scale(4); opacity: 0; }
    }

    @keyframes ftOverduePulse {
      0%, 100% { text-shadow: none; }
      50%       { text-shadow: 0 0 12px rgba(255,77,109,0.6); }
    }
    .ft-overdue-pulse {
      animation: ftOverduePulse 2.4s ease-in-out infinite;
    }

    .ft-card-enter {
      animation: ftSlideUp 0.26s cubic-bezier(0.25, 0.8, 0.25, 1) both;
    }
    @keyframes ftSlideUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .ft-num-counting { display: inline-block; }

    .sk {
      background: linear-gradient(
        90deg,
        var(--surface2) 0%,
        var(--surface3) 30%,
        var(--surface2) 50%,
        var(--surface3) 70%,
        var(--surface2) 100%
      ) !important;
      background-size: 300% 100% !important;
      animation: ftShimmer 1.6s ease-in-out infinite !important;
    }
    @keyframes ftShimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .ft-topbar-shadow {
      box-shadow: 0 1px 0 var(--border), 0 4px 20px rgba(0,0,0,0.2) !important;
    }

    :focus:not(.focus-visible) { outline: none !important; }
    :focus-visible {
      outline: 2px solid var(--accent) !important;
      outline-offset: 2px !important;
    }

    .ft-vscroll {
      position: relative;
      overflow: visible;
    }
    .ft-vscroll-spacer {
      width: 100%;
      pointer-events: none;
    }

    .modal-sheet { -webkit-overflow-scrolling: touch !important; }

    .teacher-card, .batch-card {
      transition: transform 0.14s cubic-bezier(0.34, 1.4, 0.64, 1),
                  box-shadow 0.14s ease,
                  border-color 0.15s ease !important;
      will-change: transform;
    }
    .teacher-card:active, .batch-card:active {
      transform: scale(0.985) translateY(1px) !important;
    }

    .pay-btn.ft-loading {
      position: relative;
      color: transparent !important;
    }
    .pay-btn.ft-loading::after {
      content: '';
      position: absolute;
      width: 18px; height: 18px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: ftSpin 0.7s linear infinite;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
    }
    @keyframes ftSpin { to { transform: translate(-50%, -50%) rotate(360deg); } }

    .batch-card.selected {
      border-color: var(--accent) !important;
      background: rgba(124,107,255,0.05) !important;
    }

    #appScreen, #loginScreen, #splashSkeleton, #onboardScreen, #authOverlay {
      transition: opacity 0.25s ease !important;
    }
  `;

  const style = document.createElement('style');
  style.id = 'ft-enhancements-css';
  style.textContent = CSS;
  document.head.appendChild(style);


  const RIPPLE_SELECTORS = [
    '.teacher-card', '.batch-card', '.student-card', '.standalone-card',
    '.pay-btn', '.pay-tab', '.btn-primary', '.btn-cancel',
    '.batch-open-btn', '.menu-item', '.role-opt',
    '.ob-role-card', '.google-btn',
    '[data-ripple]',
  ].join(',');

  function spawnRipple(el, x, y) {
    const rect = el.getBoundingClientRect();
    const r = document.createElement('span');
    r.className = 'ft-ripple';
    const size = Math.max(rect.width, rect.height) * 2;
    r.style.cssText = `width:${size}px;height:${size}px;left:${x - rect.left - size/2}px;top:${y - rect.top - size/2}px`;
    el.appendChild(r);
    r.addEventListener('animationend', () => r.remove(), { once: true });
  }

  document.addEventListener('pointerdown', e => {
    const el = e.target.closest(RIPPLE_SELECTORS);
    if (!el) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    spawnRipple(el, e.clientX, e.clientY);
  }, { passive: true });


  function haptic(pattern) {
    try { navigator.vibrate?.(pattern); } catch(e) {}
  }

  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.teacher-card, .batch-card, .student-card')) haptic(8);
    if (e.target.closest('.pay-btn:not(:disabled)')) haptic([12, 5, 12]);
    if (e.target.closest('.btn-primary')) haptic(15);
    if (e.target.closest('.google-btn')) haptic(10);
  }, { passive: true });

  const _origToast = window.toast;
  window.toast = function(msg, type) {
    if (type === 'success') haptic([10, 5, 20]);
    else if (type === 'error') haptic([30, 10, 30]);
    return _origToast?.apply(this, arguments);
  };


  function animateNumber(el, from, to, duration = 600) {
    if (from === to) return;
    const startTs = performance.now();
    const fmt = window._fmt || (n => n.toLocaleString());
    const fmtSample = fmt(to);
    const prefix = fmtSample.replace(/[\d,. ]+/, '').split(/[\d,. ]/)[0] || '';

    function step(ts) {
      const p = Math.min((ts - startTs) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const cur = Math.round(from + (to - from) * ease);
      const children = [...el.childNodes];
      const textNode = children.find(n => n.nodeType === Node.TEXT_NODE && /\d/.test(n.textContent));
      if (textNode) {
        textNode.textContent = fmt(cur).replace(/[^\d,.]/g, '') || cur.toLocaleString();
      }
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const _numObserver = new MutationObserver(muts => {
    muts.forEach(m => {
      const el = m.target.closest?.('.total-amount');
      if (!el) return;
      const prev = parseFloat(m.oldValue?.replace(/[^\d.]/g, '') || '0') || 0;
      const next = parseFloat(el.textContent?.replace(/[^\d.]/g, '') || '0') || 0;
      if (prev !== next) animateNumber(el, prev, next, 700);
    });
  });

  function attachNumObserver() {
    document.querySelectorAll('.total-amount').forEach(el => {
      _numObserver.observe(el, { characterData: true, subtree: true, characterDataOldValue: true, childList: true });
    });
  }
  setTimeout(attachNumObserver, 1000);


  function staggerCards(container) {
    const cards = container.querySelectorAll(
      '.teacher-card, .batch-card, .student-card, .standalone-card'
    );
    cards.forEach((card, i) => {
      card.style.animationDelay = `${Math.min(i * 0.045, 0.32)}s`;
      card.classList.add('ft-card-enter');
    });
  }

  const _renderObserver = new MutationObserver(muts => {
    muts.forEach(m => {
      if (m.addedNodes.length) staggerCards(m.target);
      m.target.querySelectorAll?.('.due-amount, .sc-due-amt, .standalone-due-amt').forEach(el => {
        const text = el.textContent || '';
        const amount = parseFloat(text.replace(/[^\d.]/g, '')) || 0;
        const color = el.style.color || '';
        if (amount > 0 && (color.includes('ff4d') || color.includes('red') || el.closest('[style*="var(--red)"]'))) {
          el.classList.add('ft-overdue-pulse');
        }
      });
    });
  });

  function attachRenderObserver() {
    const inner = document.getElementById('appInner');
    const bdBody = document.getElementById('bdBody');
    if (inner) _renderObserver.observe(inner, { childList: true, subtree: false });
    if (bdBody) _renderObserver.observe(bdBody, { childList: true, subtree: false });
  }
  const _obsTimer = setInterval(() => {
    attachRenderObserver();
    if (document.getElementById('appInner')) clearInterval(_obsTimer);
  }, 300);


  const VSCROLL_THRESHOLD = 20;
  const CARD_HEIGHT_EST   = 160;
  const OVERSCAN          = 5;

  class VirtualList {
    constructor(container, items, renderItem) {
      this.container  = container;
      this.items      = items;
      this.renderItem = renderItem;
      this.cardH      = CARD_HEIGHT_EST;
      this.rendered   = new Map();
      this._tick      = null;
      this._init();
    }

    _init() {
      this.container.style.position = 'relative';
      this.spacer = document.createElement('div');
      this.spacer.className = 'ft-vscroll-spacer';
      this._updateSpacerHeight();
      this.container.appendChild(this.spacer);

      this._onScroll = () => {
        if (this._tick) return;
        this._tick = requestAnimationFrame(() => { this._tick = null; this._update(); });
      };
      window.addEventListener('scroll', this._onScroll, { passive: true });
      this._update();
    }

    _updateSpacerHeight() {
      this.spacer.style.height = `${this.items.length * this.cardH}px`;
    }

    _visibleRange() {
      const scrollY  = window.scrollY;
      const viewH    = window.innerHeight;
      const offsetTop = this.container.getBoundingClientRect().top + scrollY;
      const start = Math.max(0, Math.floor((scrollY - offsetTop) / this.cardH) - OVERSCAN);
      const end   = Math.min(this.items.length, Math.ceil((scrollY + viewH - offsetTop) / this.cardH) + OVERSCAN);
      return { start, end };
    }

    _update() {
      const { start, end } = this._visibleRange();
      const toRemove = [];
      this.rendered.forEach((el, i) => {
        if (i < start || i >= end) toRemove.push(i);
      });
      toRemove.forEach(i => {
        this.rendered.get(i)?.remove();
        this.rendered.delete(i);
      });
      for (let i = start; i < end; i++) {
        if (this.rendered.has(i)) continue;
        const el = this.renderItem(this.items[i], i);
        el.style.position = 'absolute';
        el.style.top = `${i * this.cardH}px`;
        el.style.left  = '0';
        el.style.right = '0';
        el.style.animationDelay = `${Math.min(i * 0.03, 0.2)}s`;
        this.container.appendChild(el);
        this.rendered.set(i, el);
        if (i === start) {
          requestAnimationFrame(() => {
            const h = el.offsetHeight;
            if (h > 0 && h !== this.cardH) {
              this.cardH = h + 10;
              this._updateSpacerHeight();
              this.rendered.forEach((e, idx) => { e.style.top = `${idx * this.cardH}px`; });
              this._update();
            }
          });
        }
      }
    }

    destroy() {
      window.removeEventListener('scroll', this._onScroll);
      this.rendered.forEach(el => el.remove());
      this.spacer.remove();
    }
  }

  let _vList = null;

  function _maybeActivateVScroll() {
    const inner = document.getElementById('appInner');
    if (!inner) return;
    const cards = inner.querySelectorAll('.teacher-card, .batch-card');
    if (cards.length < VSCROLL_THRESHOLD) {
      if (_vList) { _vList.destroy(); _vList = null; }
      return;
    }
    if (_vList && _vList.items.length === cards.length) return;
    if (_vList) { _vList.destroy(); _vList = null; }
    const cardEls = [...cards];
    const wrap = document.createElement('div');
    wrap.id = 'ft-vscroll-wrap';
    cardEls.forEach(c => c.remove());
    const items = cardEls.map(el => el.outerHTML);
    inner.insertBefore(wrap, inner.firstChild);
    _vList = new VirtualList(wrap, items, (html, i) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const el = tmp.firstElementChild;
      el.classList.add('ft-card-enter');
      return el;
    });
  }


  function initTopbarScroll() {
    const topbar = document.querySelector('#appScreen .topbar');
    if (!topbar) return;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        topbar.classList.toggle('ft-topbar-shadow', window.scrollY > 8);
      });
    }, { passive: true });
  }
  setTimeout(initTopbarScroll, 800);


  let _usingMouse = false;
  document.addEventListener('mousedown', () => { _usingMouse = true; });
  document.addEventListener('keydown',   () => { _usingMouse = false; });
  document.addEventListener('focusin', e => {
    if (_usingMouse) e.target.blur?.();
  }, { passive: true });


  const _origPay = window.payMonths;
  if (_origPay) {
    window.payMonths = async function(id, type = 'full') {
      const btn = document.querySelector(`.pay-btn[onclick*="'${id}'"][onclick*="'${type}'"]`)
               || document.querySelector(`#pay-btn-${type}-${id}`)
               || document.getElementById(`pay-btn-${id}`);
      btn?.classList.add('ft-loading');
      try {
        return await _origPay.apply(this, arguments);
      } finally {
        btn?.classList.remove('ft-loading');
      }
    };
  }


  document.addEventListener('input', e => {
    const inp = e.target;
    if (!inp.classList.contains('search-input')) return;
    const clear = inp.closest('.search-wrap')?.querySelector('.search-clear');
    if (!clear) return;
    const show = inp.value.length > 0;
    clear.style.opacity    = show ? '1' : '0';
    clear.style.transform  = `translateY(-50%) scale(${show ? 1 : 0.7})`;
    clear.style.transition = 'opacity 0.15s, transform 0.15s';
    clear.style.pointerEvents = show ? 'auto' : 'none';
  }, { passive: true });


  function _pulseOverdueAmounts() {
    document.querySelectorAll('.due-amount, .sc-due-amt, .standalone-due-amt').forEach(el => {
      const months = parseInt(el.closest('[data-months]')?.dataset.months || '0');
      if (months >= 3 || el.style.color?.includes('ff4d') || el.style.color === 'var(--red)') {
        el.classList.add('ft-overdue-pulse');
      }
    });
  }
  const _overdueMO = new MutationObserver(() => { _pulseOverdueAmounts(); });
  setTimeout(() => {
    const inner = document.getElementById('appInner');
    if (inner) _overdueMO.observe(inner, { childList: true, subtree: true });
  }, 1000);


  const TILT_MAX = 3;
  function onCardTiltMove(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const rx = ((e.clientY - cy) / (rect.height / 2)) * TILT_MAX;
    const ry = -((e.clientX - cx) / (rect.width  / 2)) * TILT_MAX;
    card.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) scale(1.01)`;
  }
  function onCardTiltLeave(e) {
    const card = e.currentTarget;
    card.style.transform = '';
    card.style.transition = 'transform 0.35s cubic-bezier(0.34,1.4,0.64,1)';
  }

  function attachTilt() {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      document.querySelectorAll('.teacher-card, .batch-card').forEach(card => {
        if (card._tiltAttached) return;
        card._tiltAttached = true;
        card.addEventListener('pointermove', onCardTiltMove);
        card.addEventListener('pointerleave', onCardTiltLeave);
      });
    }
  }

  const _tiltMO = new MutationObserver(() => attachTilt());
  setTimeout(() => {
    const inner = document.getElementById('appInner');
    if (inner) { _tiltMO.observe(inner, { childList: true, subtree: false }); attachTilt(); }
  }, 1000);


  const _origCloseModal = window.closeModal;
  window.closeModal = function(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return _origCloseModal?.apply(this, arguments);
    overlay.style.transition = 'opacity 0.18s ease';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.opacity = '';
      overlay.style.transition = '';
      _origCloseModal?.apply(this, arguments);
    }, 180);
  };


  const _origScreenTo = window.screenTo;
  window.screenTo = function(show, hide, dir) {
    const showEl = document.getElementById(show);
    if (showEl) { showEl.style.opacity = '0'; }
    const result = _origScreenTo?.apply(this, arguments);
    if (showEl) {
      requestAnimationFrame(() => {
        showEl.style.transition = 'opacity 0.22s ease';
        showEl.style.opacity = '1';
        setTimeout(() => { showEl.style.transition = ''; }, 240);
      });
    }
    return result;
  };


  let _vscrollDebounce = null;
  const _vscrollMO = new MutationObserver(() => {
    clearTimeout(_vscrollDebounce);
    _vscrollDebounce = setTimeout(_maybeActivateVScroll, 120);
  });

  setTimeout(() => {
    const inner = document.getElementById('appInner');
    if (inner) _vscrollMO.observe(inner, { childList: true });
  }, 500);


  const safeCSS = `
    :root {
      --sat: env(safe-area-inset-top, 0px);
      --sab: env(safe-area-inset-bottom, 0px);
      --sal: env(safe-area-inset-left, 0px);
      --sar: env(safe-area-inset-right, 0px);
    }
    #appScreen .topbar {
      padding-top: calc(var(--sat) + 14px) !important;
    }
    #batchDetailScreen .bd-topbar {
      padding-top: calc(var(--sat) + 18px) !important;
    }
    .sel-bar {
      padding-bottom: calc(var(--sab) + 14px) !important;
    }
    #notifBanner {
      padding-bottom: calc(var(--sab) + 12px) !important;
    }
  `;
  const safeStyle = document.createElement('style');
  safeStyle.textContent = safeCSS;
  document.head.appendChild(safeStyle);


  const _origEnterSel = window.enterSelMode;
  if (_origEnterSel) {
    window.enterSelMode = function() {
      haptic([20, 10, 20, 10, 40]);
      return _origEnterSel.apply(this, arguments);
    };
  }


  function _enrichBatchCards() {
    document.querySelectorAll('.batch-card[data-id]').forEach(card => {
      const name = card.querySelector('.batch-name');
      if (name && !card.querySelector('.ft-batch-badge')) {
        // reserved for future badge injection
      }
    });
  }

  setTimeout(() => {
    const inner = document.getElementById('appInner');
    if (inner) {
      new MutationObserver(() => _enrichBatchCards()).observe(inner, { childList: true, subtree: false });
    }
  }, 1000);


  document.addEventListener('click', e => {
    const topbar = e.target.closest('#appScreen .topbar-title');
    if (topbar) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      haptic(12);
    }
  });


  const _skMO = new MutationObserver(() => {
    const splash = document.getElementById('splashSkeleton');
    if (splash && !splash.classList.contains('hidden')) {
      return;
    }
    const inner = document.getElementById('appInner');
    if (!inner) return;
    const hasSk  = !!inner.querySelector('.sk-tc, .sk-hero');
    const hasReal = !!inner.querySelector('.teacher-card, .batch-card, .empty-state');
    if (!hasSk && hasReal) {
      inner.style.transition = 'opacity 0.2s ease';
      inner.style.opacity = '0';
      requestAnimationFrame(() => {
        inner.style.opacity = '1';
        setTimeout(() => { inner.style.transition = ''; }, 220);
      });
      _skMO.disconnect();
    }
  });
  setTimeout(() => {
    const inner = document.getElementById('appInner');
    if (inner) _skMO.observe(inner, { childList: true });
  }, 200);


  console.log('[FT-Enhancements] Loaded ✓ — ripple, haptics, virtual-scroll, micro-interactions active');

})();
