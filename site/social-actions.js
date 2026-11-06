(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const typeLabel = { announcement: 'Pengumuman', event: 'Acara', poll: 'Undian', residentNotice: 'Hebahan' };
  const userKey = () => window.COMMUNITY_SESSION?.profile?.user_id || 'guest';
  const storageKey = () => `impiria29-post-actions:${userKey()}`;
  let state = { saved: [], starred: [], hidden: [] };
  const keyFor = (type, id) => `${type}:${id}`;

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      state = { saved: Array.isArray(stored.saved) ? stored.saved : [], starred: Array.isArray(stored.starred) ? stored.starred : [], hidden: Array.isArray(stored.hidden) ? stored.hidden : [] };
    } catch { state = { saved: [], starred: [], hidden: [] }; }
  }
  function saveState() { try { localStorage.setItem(storageKey(), JSON.stringify(state)); } catch {} }
  function flash(message) {
    let box = $('#socialActionToast');
    if (!box) { box = document.createElement('div'); box.id = 'socialActionToast'; box.className = 'social-action-toast'; box.setAttribute('role', 'status'); document.body.append(box); }
    box.textContent = message; box.classList.add('show'); clearTimeout(flash.timer); flash.timer = setTimeout(() => box.classList.remove('show'), 2600);
  }
  function cardInfo(card) {
    let type = card.classList.contains('announcement-card') ? 'announcement' : card.classList.contains('event-card') ? 'event' : card.classList.contains('poll-card') ? 'poll' : card.classList.contains('resident-notice-card') ? 'residentNotice' : '';
    let id = type === 'poll' ? (card.id || '').replace(/^poll-/, '') : $('[data-content-detail]', card)?.dataset.id || '';
    return type && id ? { type, id, key: keyFor(type, id) } : null;
  }
  function cardFromTarget(target) { return target.closest('.announcement-card,.event-card,.poll-card,.resident-notice-card'); }
  function decorateCard(card) {
    const info = cardInfo(card);
    if (!info) return;
    let menu = $('.social-post-menu', card);
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'social-post-menu';
      menu.dataset.postKey = info.key;
      menu.innerHTML = `<button type="button" class="social-post-more" data-social-menu aria-label="Lagi pilihan untuk ${typeLabel[info.type]}" aria-expanded="false" title="Lagi pilihan">···</button><div class="social-post-options hidden" role="menu"><button type="button" role="menuitem" data-social-action="copy">↗ <span>Salin pautan</span></button><button type="button" role="menuitem" data-social-action="whatsapp">◉ <span>Kongsi ke WhatsApp</span></button><button type="button" role="menuitem" data-social-action="save">▣ <span>Simpan</span></button><button type="button" role="menuitem" data-social-action="star">☆ <span>Tandakan bintang</span></button><button type="button" role="menuitem" data-social-action="hide">⊘ <span>Sembunyikan</span></button></div>`;
      card.append(menu);
    }
    card.dataset.socialType = info.type;
    card.dataset.socialId = info.id;
    card.classList.toggle('social-post-starred', state.starred.includes(info.key));
    card.classList.toggle('social-post-saved', state.saved.includes(info.key));
    const star = $('[data-social-action="star"] span', menu), save = $('[data-social-action="save"] span', menu);
    if (star) star.textContent = state.starred.includes(info.key) ? 'Buang bintang' : 'Tandakan bintang';
    if (save) save.textContent = state.saved.includes(info.key) ? 'Buang daripada simpanan' : 'Simpan';
    if (state.hidden.includes(info.key)) hideCard(card, info.key, false);
    else {
      card.hidden = false;
      if (card.nextElementSibling?.classList.contains('social-hidden-notice')) card.nextElementSibling.remove();
    }
  }
  function hideCard(card, key, announce = true) {
    card.hidden = true;
    let notice = card.nextElementSibling;
    if (!notice?.classList.contains('social-hidden-notice')) {
      notice = document.createElement('div'); notice.className = 'social-hidden-notice';
      notice.innerHTML = `<span>Kandungan ini disembunyikan.</span><button type="button" data-social-unhide="${encodeURIComponent(key)}">Tunjuk semula</button>`;
      card.after(notice);
    }
    if (announce) flash('Kandungan disembunyikan. Anda boleh tunjukkan semula bila-bila masa.');
  }
  function scan() { loadState(); $$('.announcement-card,.event-card,.poll-card,.resident-notice-card').forEach(decorateCard); }
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  async function getShareUrl(type, id) {
    const session = window.COMMUNITY_SESSION?.session, config = window.SUPABASE_CONFIG;
    if (!session?.access_token || !config?.url || !config?.publishableKey) throw new Error('Log masuk dahulu untuk berkongsi kandungan.');
    const endpoint = new URL('/functions/v1/share-preview', config.url);
    endpoint.searchParams.set('type', type);
    endpoint.searchParams.set('id', id);
    const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, apikey: config.publishableKey, Accept: 'application/json' } });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(detail.includes('Hebahan ini') ? detail : 'Pautan pratonton tidak dapat disediakan. Pastikan kandungan telah diterbitkan.');
    }
    const result = await response.json();
    if (!result?.url) throw new Error('Pautan pratonton tidak diterima. Cuba lagi.');
    return result.url;
  }
  async function copyText(value) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const input = document.createElement('textarea'); input.value = value; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.append(input); input.select();
    const copied = document.execCommand('copy'); input.remove(); if (!copied) throw new Error('Pautan tidak dapat disalin pada peranti ini.');
  }
  async function shareToWhatsApp(type, id) {
    const tab = window.open('about:blank', '_blank');
    if (!tab) throw new Error('Benarkan pop-up untuk membuka WhatsApp.');
    tab.opener = null;
    try { const link = await getShareUrl(type, id); tab.location.replace(`https://wa.me/?text=${encodeURIComponent(link)}`); }
    catch (error) { tab.close(); throw error; }
  }
  window.shareCompactContentToWhatsApp = (type, record, id) => shareToWhatsApp(type, String(id || record?.id || ''));

  document.addEventListener('click', async event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const oldShare = target.closest('[data-share-content],[data-share-poll]');
    if (oldShare) {
      event.preventDefault(); event.stopImmediatePropagation();
      const type = oldShare.hasAttribute('data-share-poll') ? 'poll' : oldShare.dataset.shareContent;
      const id = oldShare.dataset.sharePoll || oldShare.dataset.id;
      try { await shareToWhatsApp(type, id); } catch (error) { flash(error.message || 'Pautan tidak dapat dikongsi.'); }
      return;
    }
    const toggle = target.closest('[data-social-menu]');
    if (toggle) {
      event.preventDefault(); event.stopImmediatePropagation();
      const menu = toggle.closest('.social-post-menu'), options = $('.social-post-options', menu), open = options.classList.contains('hidden');
      $$('.social-post-options').forEach(item => item.classList.add('hidden'));
      options.classList.toggle('hidden', !open); toggle.setAttribute('aria-expanded', String(open)); return;
    }
    const unhide = target.closest('[data-social-unhide]');
    if (unhide) {
      event.preventDefault(); event.stopImmediatePropagation();
      const key = decodeURIComponent(unhide.dataset.socialUnhide); state.hidden = state.hidden.filter(item => item !== key); saveState();
      const notice = unhide.closest('.social-hidden-notice'), card = notice?.previousElementSibling;
      if (card) card.hidden = false; notice?.remove(); flash('Kandungan dipaparkan semula.'); return;
    }
    const action = target.closest('[data-social-action]');
    if (action) {
      event.preventDefault(); event.stopImmediatePropagation();
      const menu = action.closest('.social-post-menu'), card = cardFromTarget(action), info = cardInfo(card), kind = action.dataset.socialAction;
      if (!info) return;
      try {
        if (kind === 'copy') { const link = await getShareUrl(info.type, info.id); await copyText(link); flash('Pautan pendek disalin. Tampal ke WhatsApp atau mesej.'); }
        if (kind === 'whatsapp') { await shareToWhatsApp(info.type, info.id); }
        if (kind === 'save' || kind === 'star') {
          const list = kind === 'save' ? 'saved' : 'starred', exists = state[list].includes(info.key);
          state[list] = exists ? state[list].filter(item => item !== info.key) : [...state[list], info.key]; saveState();
          card.classList.toggle(kind === 'save' ? 'social-post-saved' : 'social-post-starred', !exists);
          $('[data-social-action="save"] span', menu).textContent = state.saved.includes(info.key) ? 'Buang daripada simpanan' : 'Simpan';
          $('[data-social-action="star"] span', menu).textContent = state.starred.includes(info.key) ? 'Buang bintang' : 'Tandakan bintang';
          flash(exists ? (kind === 'save' ? 'Dibuang daripada simpanan.' : 'Bintang dibuang.') : (kind === 'save' ? 'Disimpan.' : 'Ditandakan dengan bintang.'));
        }
        if (kind === 'hide') { if (!state.hidden.includes(info.key)) state.hidden.push(info.key); saveState(); hideCard(card, info.key); }
      } catch (error) { flash(error.message || 'Tindakan tidak dapat dilakukan.'); }
      $$('.social-post-options').forEach(item => item.classList.add('hidden'));
      menu?.querySelector('[data-social-menu]')?.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!target.closest('.social-post-menu')) $$('.social-post-options').forEach(item => item.classList.add('hidden'));
  }, true);
})();

