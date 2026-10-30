(() => {
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const houseOptions = Array.from({length:43}, (_, index) => String(index + 1));
  let rows = [];
  let lastError = '';

  function render() {
    const list = $('#accountList');
    if (!list) return;
    const query = String($('#accountSearch')?.value || '').trim().toLowerCase();
    const visible = rows.filter(row => `${row.full_name} ${row.email}`.toLowerCase().includes(query));
    $('#accountTotal').textContent = String(rows.length);
    if (lastError) {
      list.innerHTML = `<div class="empty-state application-error">${esc(lastError)}</div>`;
      return;
    }
    list.innerHTML = visible.map(row => {
      const home = row.house_number ?? row.requested_house_number ?? '';
      const isAjkViewingAdmin = window.COMMUNITY_SESSION?.profile.role === 'ajk' && row.role === 'admin';
      const roleSelect = window.COMMUNITY_SESSION?.profile.role === 'admin'
        ? `<label>Peranan<select data-account-role><option value="resident" ${row.role === 'resident' ? 'selected' : ''}>Penduduk</option><option value="ajk" ${row.role === 'ajk' ? 'selected' : ''}>AJK</option><option value="bendahari" ${row.role === 'bendahari' ? 'selected' : ''}>Bendahari</option><option value="admin" ${row.role === 'admin' ? 'selected' : ''}>Admin</option></select></label>`
        : `<div class="account-role-readonly"><span>Peranan</span><b>${row.role === 'admin' ? 'Admin' : row.role === 'ajk' ? 'AJK' : row.role === 'bendahari' ? 'Bendahari' : 'Penduduk'}</b></div>`;
      return `<article class="account-card" data-account-id="${esc(row.user_id)}"><div class="account-card-heading"><div><span class="mini-tag ${row.approval_status === 'approved' ? 'green-tag' : 'notice-category'}">${row.approval_status === 'approved' ? 'Diluluskan' : row.approval_status === 'rejected' ? 'Ditolak' : 'Menunggu kelulusan'}</span><small>${new Date(row.created_at).toLocaleDateString('ms-MY',{dateStyle:'medium'})}</small></div>${isAjkViewingAdmin ? '<span class="account-role-readonly">Akaun pentadbir</span>' : '<button type="button" class="small-action delete" data-delete-account>Padam akaun</button>'}</div><div class="account-fields">${isAjkViewingAdmin ? `<div class="account-role-readonly"><span>Nama</span><b>${esc(row.full_name)}</b></div><div class="account-role-readonly"><span>E-mel</span><b>Maklumat peribadi Admin</b></div><div class="account-role-readonly"><span>Telefon</span><b>Maklumat peribadi Admin</b></div><div class="account-role-readonly"><span>Rumah</span><b>Maklumat peribadi Admin</b></div><div class="account-role-readonly"><span>Status kelulusan</span><b>${row.approval_status === 'approved' ? 'Diluluskan' : row.approval_status === 'rejected' ? 'Ditolak' : 'Menunggu'}</b></div>` : `<label>Nama penuh<input type="text" data-account-name value="${esc(row.full_name)}" maxlength="120" required></label><label>E-mel akaun<span class="account-email" title="E-mel tidak diubah di halaman ini">${esc(row.email)}</span></label><label>Nombor telefon<input type="tel" data-account-phone value="${esc(row.phone)}" inputmode="tel" required></label><label>Rumah dipautkan<select data-account-house><option value="">Belum dipautkan</option>${houseOptions.map(number => `<option value="${number}" ${String(home) === number ? 'selected' : ''}>Rumah ${number.padStart(2,'0')}</option>`).join('')}</select></label><label>Status kelulusan<select data-account-status><option value="pending" ${row.approval_status === 'pending' ? 'selected' : ''}>Menunggu</option><option value="approved" ${row.approval_status === 'approved' ? 'selected' : ''}>Diluluskan</option><option value="rejected" ${row.approval_status === 'rejected' ? 'selected' : ''}>Ditolak</option></select></label>`}${roleSelect}</div><div class="account-card-actions">${isAjkViewingAdmin ? '<span class="account-role-readonly">Maklumat pentadbir · paparan sahaja</span>' : '<button type="button" class="button button-primary" data-save-account>Simpan perubahan</button>'}</div></article>`;
    }).join('') || `<div class="empty-state">${rows.length ? 'Tiada akaun sepadan dengan carian.' : 'Tiada akaun ditemui.'}</div>`;
  }

  window.refreshAccountDirectory = async (showErrors = false) => {
    const role = window.COMMUNITY_SESSION?.profile.role;
    if (!['admin','ajk'].includes(role)) return;
    const button = $('#refreshAccountsButton');
    const restore = showErrors && button && window.beginAppButtonBusy ? window.beginAppButtonBusy(button, 'Memuatkan…') : null;
    try {
      const {data,error} = await window.COMMUNITY_SUPABASE.rpc('list_managed_accounts');
      if (error) { lastError = 'Tidak dapat memuatkan akaun. Pastikan migration pengurusan akaun sudah dijalankan di Supabase.'; rows = []; render(); if (showErrors) console.error(error); return; }
      lastError = '';
      rows = Array.isArray(data) ? data : [];
      render();
    } finally { restore?.(); }
  };

  document.addEventListener('input', event => { if (event.target.matches('#accountSearch')) render(); });
  document.addEventListener('click', async event => {
    const refresh = event.target.closest('#refreshAccountsButton');
    if (refresh) { await window.refreshAccountDirectory(true); return; }
    const card = event.target.closest('[data-account-id]');
    if (!card) return;
    const id = card.dataset.accountId;
    if (event.target.closest('[data-save-account]')) {
      const button = event.target.closest('[data-save-account]');
      const fullName = $('[data-account-name]',card).value.trim();
      const phone = $('[data-account-phone]',card).value.trim();
      const house = $('[data-account-house]',card).value;
      const status = $('[data-account-status]',card).value;
      const roleControl = $('[data-account-role]',card);
      const existing = rows.find(row => row.user_id === id);
      const role = roleControl?.value || existing?.role;
      if (!fullName || !phone) { window.alert('Nama penuh dan nombor telefon diperlukan.'); return; }
      if (status === 'approved' && !house) { window.alert('Pilih nombor rumah sebelum meluluskan akaun.'); return; }
      const restore = window.beginAppButtonBusy?.(button,'Menyimpan…');
      try {
        const {error} = await window.COMMUNITY_SUPABASE.rpc('update_managed_account',{p_user_id:id,p_full_name:fullName,p_phone:phone,p_house_number:house ? Number(house) : null,p_approval_status:status,p_role:role});
        if (error) { window.alert('Perubahan tidak dapat disimpan: '+error.message); return; }
        await window.refreshAccountDirectory(false);
        window.alert('Maklumat akaun berjaya dikemas kini.');
      } finally { restore?.(); }
      return;
    }
    if (event.target.closest('[data-delete-account]')) {
      const account = rows.find(row => row.user_id === id);
      if (!account) return;
      if (!window.confirm(`Padam akaun ${account.full_name} (${account.email}) secara kekal? Pengguna tidak dapat log masuk lagi. Rekod isi rumah akan dikekalkan.`)) return;
      const button = event.target.closest('[data-delete-account]');
      const restore = window.beginAppButtonBusy?.(button,'Memadam…');
      try {
        const {error} = await window.COMMUNITY_SUPABASE.rpc('delete_managed_account',{p_user_id:id});
        if (error) { window.alert('Akaun tidak dapat dipadam: '+error.message); return; }
        await window.refreshAccountDirectory(false);
      } finally { restore?.(); }
    }
  });
})();