(() => {
  const $ = selector => document.querySelector(selector);
  const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=2.9788811&longitude=101.5361309&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&forecast_days=16&timezone=Asia%2FKuala_Lumpur';
  const apimsUrl = 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm';
  const apimsLayerUrl = 'https://eqms.doe.gov.my/api3/publicmapproxy/PUBLIC_DISPLAY/CAQM_MCAQM_Current_Reading/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=json';
  const ipuSnapshotUrl = new URL('ipu.json', document.baseURI).href;
  const hazeMonitorUrl = 'https://hazemonitor.com/api/air-quality';
  const taman = { latitude: 2.9788811, longitude: 101.5361309 };
  let prayerZone = 'SGR01';
  const weatherDescription = code => {
    if (code === 0) return ['Cerah', '☀️'];
    if ([1, 2].includes(code)) return ['Cerah berawan', '⛅'];
    if (code === 3) return ['Mendung', '☁️'];
    if ([45, 48].includes(code)) return ['Berkabus', '🌫️'];
    if ([51, 53, 55, 56, 57].includes(code)) return ['Renyai', '🌦️'];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return ['Hujan', '🌧️'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return ['Hujan batu', '🌨️'];
    if ([95, 96, 99].includes(code)) return ['Ribut petir', '⛈️'];
    return ['Cuaca berubah-ubah', '🌤️'];
  };
  const dayLabel = (date, index) => index === 0 ? 'Hari ini' : new Date(`${date}T12:00:00`).toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'short' });
  const displayTime = value => String(value || '').match(/\d{1,2}:\d{2}/)?.[0] || '—';
  const number = value => value === null || value === undefined || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const prayerYearCache = new Map();
  const hijriMonths = ['Muharam', 'Safar', 'Rabiulawal', 'Rabiulakhir', 'Jamadilawal', 'Jamadilakhir', 'Rejab', 'Syaaban', 'Ramadan', 'Syawal', 'Zulkaedah', 'Zulhijjah'];
  function formatJAKIMHijri(value) {
    if (value && typeof value === 'object') value = value.hijri || value.date || value.value || '';
    const text = String(value || '').trim();
    let parts = text.match(/^([0-9]{4})[-/]([0-9]{1,2})[-/]([0-9]{1,2})$/);
    if (parts) return `${Number(parts[3])} ${hijriMonths[Number(parts[2]) - 1] || ''} ${parts[1]}H`.trim();
    parts = text.match(/^([0-9]{1,2})[-/]([0-9]{1,2})[-/]([0-9]{4})$/);
    if (parts) return `${Number(parts[1])} ${hijriMonths[Number(parts[2]) - 1] || ''} ${parts[3]}H`.trim();
    const aliases = [
      ['muharram', 'Muharam'], ['muharam', 'Muharam'], ['safar', 'Safar'], ['rabi al-awwal', 'Rabiulawal'], ['rabiulawal', 'Rabiulawal'],
      ['rabi al-thani', 'Rabiulakhir'], ['rabiulakhir', 'Rabiulakhir'], ['jumada al-awwal', 'Jamadilawal'], ['jamadilawal', 'Jamadilawal'],
      ['jumada al-thani', 'Jamadilakhir'], ['jamadilakhir', 'Jamadilakhir'], ['rajab', 'Rejab'], ['sha’ban', 'Syaaban'],
      ['shaban', 'Syaaban'], ['ramadan', 'Ramadan'], ['shawwal', 'Syawal'],
      ['dhu al-qi’dah', 'Zulkaedah'], ['dhu al-hijjah', 'Zulhijjah']
    ];
    const lower = text.toLocaleLowerCase();
    const day = text.match(/(^|[^0-9])([0-9]{1,2})(?=[^0-9])/);
    const year = text.match(/(14[0-9]{2})/);
    if (day && year) for (const [alias, malay] of aliases) if (lower.includes(alias)) return `${Number(day[2])} ${malay} ${year[1]}H`;
    return '';
  }
  async function hijriDateLabel(date = new Date()) {
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
    const iso = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    try {
      const table = await loadPrayerYear(prayerZone, Number(iso.slice(0, 4))), dateIndex = table.fields.indexOf('date'), hijriIndex = table.fields.indexOf('hijri');
      const row = table.days.find(item => String(item[dateIndex] || '').slice(0, 10) === iso);
      const official = hijriIndex >= 0 && row ? formatJAKIMHijri(row[hijriIndex]) : '';
      if (official) return official;
    } catch (error) { console.info('Takwim Hijrah JAKIM tidak dapat dimuatkan.', error); }
    try {
      const options = { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' };
      const formatter = new Intl.DateTimeFormat('ms-MY-u-ca-islamic-umalqura', options);
      if (formatter.resolvedOptions().calendar.includes('islamic')) return formatter.format(date).replace(/\s*(?:AH|H)$/i, '') + 'H';
    } catch {}
    return 'Tarikh Hijrah tidak tersedia';
  }
  function renderWeatherDay(weather, index, detail = false) {
    const date = weather.daily.time[index], [condition, symbol] = weatherDescription(Number(weather.daily.weather_code[index]));
    const high = Math.round(weather.daily.temperature_2m_max[index]), low = Math.round(weather.daily.temperature_2m_min[index]);
    const rain = weather.daily.precipitation_probability_max?.[index], wind = weather.daily.wind_speed_10m_max?.[index];
    if (!detail) return `<div class="weather-day"><b>${dayLabel(date, index)}</b><span class="weather-day-icon">${symbol}</span><span>${high}° <small>${low}°</small></span><small>${rain == null ? condition : `Hujan ${rain}%`}</small></div>`;
    const sunrise = weather.daily.sunrise?.[index]?.slice(11, 16), sunset = weather.daily.sunset?.[index]?.slice(11, 16);
    return `<article class="weather-week-card"><div class="weather-week-main"><span class="weather-week-icon">${symbol}</span><div><b>${dayLabel(date, index)}</b><small>${condition}</small></div></div><div class="weather-week-temp"><b>${high}°</b><span>${low}°</span></div><div class="weather-week-meta"><span>🌧 Hujan <b>${rain == null ? '—' : `${rain}%`}</b></span><span>💨 Angin <b>${wind == null ? '—' : `${Math.round(wind)} km/j`}</b></span><span>☀ Terbit <b>${sunrise || '—'}</b></span><span>☾ Terbenam <b>${sunset || '—'}</b></span></div></article>`;
  }

  async function loadWeather() {
    const current = $('#weatherCurrent'), forecast = $('#weatherForecast');
    try {
      const weather = await requestJson(weatherUrl, 9000);
      const [description, icon] = weatherDescription(Number(weather.current?.weather_code));
      current.innerHTML = `<span class="weather-icon">${icon}</span><b>${Math.round(weather.current?.temperature_2m ?? 0)}°C</b><span>${description}</span>`;
      forecast.innerHTML = (weather.daily?.time || []).slice(0, 3).map((_, index) => renderWeatherDay(weather, index)).join('') || '<p class="widget-muted">Ramalan belum tersedia.</p>';
      $('#weatherUpdated').textContent = `Open-Meteo · ${new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })} · Tekan untuk 16 hari`;
      $('#weatherDetailCurrent').textContent = `${icon} ${Math.round(weather.current.temperature_2m)}°C · ${description}`;
      $('#weatherDetailIcon').textContent = icon;
      $('#weatherFeelsLike').textContent = `${Math.round(weather.current.apparent_temperature)}°C`;
      $('#weatherHumidity').textContent = `${Math.round(weather.current.relative_humidity_2m)}%`;
      $('#weatherWind').textContent = `${Math.round(weather.current.wind_speed_10m)} km/j`;
      $('#weatherPrecipitation').textContent = `${Number(weather.current.precipitation).toLocaleString('ms-MY')} mm`;
      $('#weatherDetailUpdated').textContent = `Dikemas kini ${new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })} · Sumber: Open-Meteo`;
      $('#weatherWeekForecast').innerHTML = (weather.daily?.time || []).map((_, index) => renderWeatherDay(weather, index, true)).join('') || '<div class="empty-state">Ramalan belum tersedia.</div>';
    } catch {
      current.textContent = 'Cuaca tidak dapat dimuatkan sekarang.';
      forecast.innerHTML = '<p class="widget-muted">Semak sambungan internet dan cuba lagi kemudian.</p>';
      $('#weatherDetailCurrent').textContent = 'Cuaca tidak dapat dimuatkan sekarang.';
      $('#weatherWeekForecast').innerHTML = '<div class="empty-state">Semak sambungan internet dan cuba lagi kemudian.</div>';
    }
  }

  function toRows(payload) {
    if (Array.isArray(payload)) return payload.flatMap(item => item?.attributes ? [item.attributes] : item?.properties ? [item.properties] : [item]);
    if (payload && typeof payload === 'object') {
      for (const key of ['features', 'data', 'stations', 'results', 'items', 'records', 'result']) if (payload[key] && payload[key] !== payload) { const rows = toRows(payload[key]); if (rows.length) return rows; }
    }
    return [];
  }
  function getField(row, keys) {
    const entries = Object.entries(row || {});
    for (const key of keys) {
      const found = entries.find(([name]) => name.toLowerCase() === key.toLowerCase());
      if (found && found[1] !== null && found[1] !== undefined && found[1] !== '') return found[1];
    }
    return null;
  }
  function coordinate(row, aliases) {
    const direct = number(getField(row, aliases));
    if (direct !== null) return direct;
    const geometry = row?.geometry;
    if (geometry?.y !== undefined && aliases.some(x => /lat/i.test(x))) return number(geometry.y);
    if (geometry?.x !== undefined && aliases.some(x => /lon|lng/i.test(x))) return number(geometry.x);
    if (Array.isArray(geometry?.coordinates)) return number(geometry.coordinates[aliases.some(x => /lat/i.test(x)) ? 1 : 0]);
    return null;
  }
  function airIndex(row) {
    const raw = getField(row, ['API', 'CURRENT_API', 'CURRENTAPI', 'IPU', 'CAQM_API', 'API_VALUE', 'API_INDEX', 'AIR_POLLUTANT_INDEX', 'API24H', 'API_24H', 'CURRENT_API_VALUE']);
    const found = String(raw ?? '').match(/\d{1,3}/);
    return found ? Number(found[0]) : null;
  }
  function airStatus(value) {
    if (value <= 50) return ['Baik', 'good'];
    if (value <= 100) return ['Sederhana', 'moderate'];
    if (value <= 200) return ['Tidak sihat', 'unhealthy'];
    if (value <= 300) return ['Sangat tidak sihat', 'very-unhealthy'];
    return ['Berbahaya', 'hazardous'];
  }
  async function loadAirIndex() {
    const output = $('#currentIpu'), stationOutput = $('#ipuStation');
    const sources = [
      { name: 'Snapshot JAS', url: `${ipuSnapshotUrl}?t=${Date.now()}` },
      { name: 'APIMS JAS', url: apimsUrl },
      { name: 'APIMS JAS', url: apimsLayerUrl },
      { name: 'Haze Monitor · data JAS', url: hazeMonitorUrl }
    ];
    for (const source of sources) {
      try {
        const payload = await requestJson(source.url, 9000);
        const rows = toRows(payload);
        const target = source.name === 'Snapshot JAS' ? payload : rows.find(row => {
          const code = getField(row, ['STATION_ID', 'STATIONID', 'STATION_CODE', 'STATIONCODE', 'SITE_ID', 'SITEID', 'SITE_CODE', 'SITECODE', 'STATION_NO', 'STN', 'MCAQM_ID', 'CAQM_ID', 'CODE', 'ID']);
          const name = getField(row, ['STATION_LOCATION', 'LOCATION', 'STATION_NAME', 'STATION', 'NAME', 'STATIONNAME', 'PLACE', 'LOCATION_NAME', 'FULLNAME']);
          return String(code || '').trim().toUpperCase() === 'MCAQM001' || /JOHAN\s+SETIA/i.test(String(name || ''));
        });
        if (!target) throw new Error('Stesen MCAQM001 tiada dalam respons sumber.');
        const value = source.name === 'Snapshot JAS' || source.name.startsWith('Haze') ? number(getField(target, ['api'])) : airIndex(target);
        if (value === null) throw new Error('Bacaan IPU MCAQM001 tiada.');
        const [status, className] = airStatus(value);
        output.innerHTML = `<span class="ipu-value ${className}">${value}</span> <span class="ipu-status">${status}</span>`;
        const observedAt = getField(target, ['observedAt', 'DATETIME', 'TIMESTAMP', 'UPDATED_AT', 'READING_TIME', 'TIME', 'DATE_TIME', 'LAST_UPDATED']);
        let observedLabel = '';
        if (observedAt) {
          const date = new Date(observedAt);
          observedLabel = Number.isNaN(date.valueOf()) ? String(observedAt) : date.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' });
        }
        const isStale = observedAt && Date.now() - new Date(observedAt).getTime() > 2 * 60 * 60 * 1000;
        stationOutput.textContent = `Johan Setia · MCAQM001${observedLabel ? ` · ${observedLabel}` : ''}${isStale ? ' · bacaan lama' : ''} · ${source.name}`;
        return;
      } catch (error) {
        console.info(`Sumber IPU ${source.name} tidak tersedia; cuba sumber seterusnya.`, error);
      }
    }
    output.innerHTML = '<span class="ipu-unavailable">Tak tersedia</span>';
    stationOutput.innerHTML = '<a class="ipu-source-link" href="https://hazemonitor.com/station/johan-setia" target="_blank" rel="noopener">Johan Setia · MCAQM001 — buka bacaan ↗</a>';
  }

  async function requestJson(url, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function riverStatus(level, thresholds) {
    if (thresholds.danger !== null && level >= thresholds.danger) return ['Bahaya', 'danger'];
    if (thresholds.warning !== null && level >= thresholds.warning) return ['Amaran', 'warning'];
    if (thresholds.alert !== null && level >= thresholds.alert) return ['Waspada', 'alert'];
    return ['Normal', 'normal'];
  }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  async function loadRiverReadings() {
    const list = $('#riverStationSummary'), updated = $('#riverDataUpdated');
    if (!list || !updated) return;
    const requested = new Map([['0232961WL', 'SG. KLANG DI KG. LOMBONG']]);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch('https://publicinfobanjir.water.gov.my/index.php/waterleveldata/Selangor', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text(), documentData = new DOMParser().parseFromString(html, 'text/html');
      const stations = [...documentData.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent.trim().replace(/\s+/g, ' '))).filter(cells => requested.has(cells[1]));
      if (!stations.length) throw new Error('Stesen rujukan tidak dijumpai dalam jadual.');
      list.innerHTML = stations.map(cells => {
        const name = cells[2] || requested.get(cells[1]), river = cells[5] || 'Sungai di daerah Petaling', time = cells[6] || '—';
        const level = Number(String(cells[7] || '').replace(/[^\d.-]/g, ''));
        if (!Number.isFinite(level) || [-9999, -8888].includes(level)) return '';
        const thresholds = { alert: Number(cells[9]), warning: Number(cells[10]), danger: Number(cells[11]) };
        for (const key of Object.keys(thresholds)) if (!Number.isFinite(thresholds[key]) || thresholds[key] < -100) thresholds[key] = null;
        const [status, statusClass] = riverStatus(level, thresholds);
        return `<article class="river-station-card river-live-card"><span class="river-station-mark">〰</span><div><b>${escapeHtml(name)}</b><small>${escapeHtml(river)} · ${escapeHtml(time)}</small></div><strong>${level.toFixed(2)} m</strong><span class="river-status ${statusClass}">${status}</span></article>`;
      }).filter(Boolean).join('');
      if (!list.innerHTML) throw new Error('Bacaan stesen belum tersedia.');
      updated.textContent = 'Bacaan diambil daripada Public InfoBanjir JPS · semak masa kemas kini pada setiap stesen.';
    } catch (error) {
      console.info('Ringkasan bacaan sungai dibuka dalam carta JPS terbenam.', error);
      list.innerHTML = '<article class="river-station-card"><span class="river-station-mark">〰</span><div><b>SG. KLANG DI KG. LOMBONG</b><small>Sungai Klang · Klang</small></div><span class="river-status normal">Bacaan dipaparkan dalam carta di bawah</span></article>';
      updated.textContent = 'Ringkasan teks tidak tersedia ketika ini. Carta JPS masih dipaparkan di halaman ini.';
    } finally { clearTimeout(timeout); }
  }

  function malaysiaDate() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  async function loadPrayerYear(zone, year) {
    const key = `${zone}:${year}`;
    if (prayerYearCache.has(key)) return prayerYearCache.get(key);
    const request = (async () => {
      const index = await requestJson('https://sajadah.org/api/v1/regions.json');
      const region = (index.regions || []).find(item => String(item.zone || '').toUpperCase() === zone);
      if (!region?.id) throw new Error(`Zon ${zone} tidak dijumpai.`);
      const table = await requestJson(`https://sajadah.org/api/v1/times/my/${encodeURIComponent(region.id)}/${year}.json`);
      if (!Array.isArray(table.days) || !Array.isArray(table.fields)) throw new Error('Jadual tahunan waktu solat tiada format yang dikenali.');
      return table;
    })();
    prayerYearCache.set(key, request);
    try { return await request; } catch (error) { prayerYearCache.delete(key); throw error; }
  }
  async function loadPrayerFromOpenData(zone) {
    const year = Number(malaysiaDate().slice(0, 4)), table = await loadPrayerYear(zone, year), fields = table.fields || [];
    const today = (table.days || []).find(row => String(row[fields.indexOf('date')] || '').slice(0, 10) === malaysiaDate());
    if (!today) throw new Error('Jadual untuk hari ini belum tersedia.');
    const value = name => { const index = fields.indexOf(name); return index >= 0 ? today[index] : ''; };
    return { fajr: value('fajr'), dhuhr: value('dhuhr'), asr: value('asr'), maghrib: value('maghrib'), isha: value('isha') };
  }
  async function initPrayerMonthOptions() {
    const select = $('#prayerMonthSelect'), hijriSelect = $('#prayerHijriMonthSelect'), mode = $('#prayerCalendarMode');
    if (!select) return;
    if (!select.dataset.ready) {
      const [year, month] = malaysiaDate().split('-').map(Number), current = new Date(year, month - 1, 1);
      for (let offset = -2; offset <= 10; offset++) {
        const date = new Date(current.getFullYear(), current.getMonth() + offset, 1), value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const label = date.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' });
        select.add(new Option(label, value));
      }
      select.value = `${year}-${String(month).padStart(2, '0')}`;
      select.dataset.ready = 'true';
      select.addEventListener('change', () => { if (mode?.value !== 'hijri') window.loadPrayerMonth(); });
    }
    if (mode && !mode.dataset.ready) {
      mode.addEventListener('change', async () => {
        const isHijri = mode.value === 'hijri';
        $('#prayerGregorianPicker')?.classList.toggle('hidden', isHijri);
        $('#prayerHijriPicker')?.classList.toggle('hidden', !isHijri);
        if (isHijri) await populateHijriMonthOptions();
        window.loadPrayerMonth();
      });
      mode.dataset.ready = 'true';
    }
    if (hijriSelect && !hijriSelect.dataset.ready) {
      hijriSelect.addEventListener('change', () => window.loadPrayerMonth());
      hijriSelect.dataset.ready = 'true';
    }
    const printButton = document.querySelector('[data-print-prayer-month]');
    if (printButton && !printButton.dataset.ready) {
      printButton.addEventListener('click', () => {
        const clean = () => document.body.classList.remove('print-prayer-month');
        document.body.classList.add('print-prayer-month');
        window.addEventListener('afterprint', clean, { once: true });
        window.print();
        setTimeout(clean, 1200);
      });
      printButton.dataset.ready = 'true';
    }
  }
  function parsedHijriParts(value) {
    const label = formatJAKIMHijri(value), match = label.match(/^([0-9]{1,2})\s+(.+)\s+(14[0-9]{2})H$/);
    if (!match) return null;
    const month = hijriMonths.findIndex(name => name.toLocaleLowerCase() === match[2].toLocaleLowerCase()) + 1;
    return month ? { day: Number(match[1]), month, year: Number(match[3]) } : null;
  }
  async function loadGregorianYears(years) {
    const results = await Promise.all(years.map(async year => {
      try { const table = await loadPrayerYear(prayerZone, year); return { year, table }; }
      catch (error) { console.info(`Jadual waktu solat ${year} belum tersedia.`, error); return null; }
    }));
    return results.filter(Boolean);
  }
  async function populateHijriMonthOptions() {
    const select = $('#prayerHijriMonthSelect');
    if (!select || (select.dataset.ready && select.options.length)) return;
    select.innerHTML = '<option value="">Memuatkan bulan Hijrah…</option>';
    const currentYear = Number(malaysiaDate().slice(0, 4));
    const tables = await loadGregorianYears([currentYear, currentYear + 1]);
    const choices = new Map();
    let currentChoice = '';
    for (const { table } of tables) {
      const dateIndex = table.fields.indexOf('date'), hijriIndex = table.fields.indexOf('hijri');
      if (hijriIndex < 0) continue;
      for (const row of table.days) {
        const parts = parsedHijriParts(row[hijriIndex]);
        if (!parts) continue;
        const key = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
        choices.set(key, `${hijriMonths[parts.month - 1]} ${parts.year}H`);
        if (String(row[dateIndex] || '').slice(0, 10) === malaysiaDate()) currentChoice = key;
      }
    }
    select.innerHTML = [...choices].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
    if (!choices.size) throw new Error('Bulan Hijrah belum tersedia daripada takwim JAKIM.');
    select.value = currentChoice || [...choices.keys()].at(-1);
    select.dataset.ready = 'true';
  }
  async function loadHijriMonthRows(year, month) {
    const approximateGregorianYear = Math.floor(year * 0.97 + 622);
    const tables = await loadGregorianYears([approximateGregorianYear, approximateGregorianYear + 1]);
    const rows = [];
    for (const { table } of tables) {
      const dateIndex = table.fields.indexOf('date'), hijriIndex = table.fields.indexOf('hijri');
      if (dateIndex < 0 || hijriIndex < 0) continue;
      for (const row of table.days) {
        const parts = parsedHijriParts(row[hijriIndex]);
        if (parts?.year === year && parts.month === month) rows.push({ row, fields: table.fields });
      }
    }
    return rows;
  }
  window.loadPrayerMonth = async () => {
    const select = $('#prayerMonthSelect'), list = $('#prayerMonthRows'), mode = $('#prayerCalendarMode')?.value || 'gregorian';
    if (!select || !list) return;
    await initPrayerMonthOptions();
    list.innerHTML = '<div class="empty-state">Memuatkan jadual waktu solat…</div>';
    $('#prayerMonthZone').textContent = `Zon JAKIM ${prayerZone}`;
    $('#prayerMonthHijriDate').textContent = `Tarikh Hijrah hari ini · ${await hijriDateLabel()}`;
    try {
      let monthRows = [], fields = [], heading = '';
      if (mode === 'hijri') {
        await populateHijriMonthOptions();
        const [hijriYearText, hijriMonthText] = ($('#prayerHijriMonthSelect')?.value || '').split('-');
        const hijriYear = Number(hijriYearText), hijriMonth = Number(hijriMonthText);
        if (!hijriYear || !hijriMonth) throw new Error('Pilih bulan Hijrah yang tersedia.');
        const records = await loadHijriMonthRows(hijriYear, hijriMonth);
        monthRows = records.map(item => item.row);
        fields = records[0]?.fields || [];
        heading = `Waktu solat · ${hijriMonths[hijriMonth - 1]} ${hijriYear}H`;
      } else {
        const [yearText, monthText] = select.value.split('-'), year = Number(yearText);
        const table = await loadPrayerYear(prayerZone, year);
        fields = table.fields;
        const dateIndex = fields.indexOf('date');
        monthRows = table.days.filter(row => String(row[dateIndex] || '').slice(0, 7) === `${yearText}-${monthText}`);
        const date = new Date(`${select.value}-01T12:00:00+08:00`);
        heading = `Waktu solat · ${date.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' })}`;
      }
      $('#prayerMonthHeading').textContent = heading;
      if (!monthRows.length) throw new Error('Jadual bagi bulan ini belum tersedia.');
      const getIndex = name => fields.indexOf(name), dateIndex = getIndex('date');
      const names = [['imsak', 'Imsak'], ['fajr', 'Subuh'], ['sunrise', 'Syuruk'], ['dhuhr', 'Zohor'], ['asr', 'Asar'], ['maghrib', 'Maghrib'], ['isha', 'Isyak']];
      list.innerHTML = (await Promise.all(monthRows.map(async row => {
        const day = String(row[dateIndex]).slice(0, 10), date = new Date(`${day}T12:00:00+08:00`);
        const label = date.toLocaleDateString('ms-MY', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' });
        const hijri = formatJAKIMHijri(row[getIndex('hijri')]) || await hijriDateLabel(date);
        return `<article class="prayer-month-day"><div class="prayer-calendar-date"><b>${label}</b><small>${hijri}</small></div><div>${names.map(([field, name]) => `<span>${name}<strong>${displayTime(row[getIndex(field)])}</strong></span>`).join('')}</div></article>`;
      }))).join('');
    } catch (error) {
      console.warn('Jadual waktu solat bulanan gagal dimuatkan:', error);
      list.innerHTML = '<div class="empty-state">Jadual bulanan tidak dapat dimuatkan. Semak sambungan internet atau pilih bulan lain.</div>';
    }
  };
  async function loadPrayerFromSolatMy(zone) {
    const result = await requestJson(`https://solat.my/api/daily/${encodeURIComponent(zone)}`);
    const day = result.prayerTime?.[0] || result.data?.prayerTime?.[0] || result.data?.[0] || result.data || result;
    return { fajr: day.fajr, dhuhr: day.dhuhr, asr: day.asr, maghrib: day.maghrib, isha: day.isha };
  }
  async function loadPrayerTimes() {
    const next = $('#nextPrayer'), times = $('#prayerTimes');
    try {
      let day;
      try { day = await loadPrayerFromOpenData(prayerZone); }
      catch (primaryError) { console.warn('Sumber jadual terbuka waktu solat tidak tersedia, cuba sumber sandaran.', primaryError); day = await loadPrayerFromSolatMy(prayerZone); }
      const prayers = [['Subuh', day.fajr], ['Zohor', day.dhuhr], ['Asar', day.asr], ['Maghrib', day.maghrib], ['Isyak', day.isha]];
      if (prayers.some(([, time]) => !displayTime(time).match(/^\d{1,2}:\d{2}$/))) throw new Error('Format waktu solat tidak lengkap.');
      const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const [hourNow, minutePart] = clock.split(':').map(Number), minuteNow = hourNow * 60 + minutePart;
      const toMinutes = time => { const match = displayTime(time).match(/^(\d{1,2}):(\d{2})$/); return match ? Number(match[1]) * 60 + Number(match[2]) : null; };
      const upcomingIndex = prayers.findIndex(([, time]) => toMinutes(time) > minuteNow), currentIndex = upcomingIndex < 0 ? 0 : upcomingIndex;
      const nextTime = prayers[currentIndex], upcoming = upcomingIndex >= 0;
      next.innerHTML = `Seterusnya: <b>${nextTime[0]} · ${displayTime(nextTime[1])}${upcoming ? '' : ' esok'}</b>`;
      const prayerSymbols = { Subuh: '◒', Zohor: '☀', Asar: '◉', Maghrib: '◓', Isyak: '☾' };
      times.innerHTML = prayers.map(([name, time], index) => `<div class="${index === currentIndex ? 'prayer-time-next' : ''}"><i class="prayer-time-symbol prayer-symbol-${name.toLowerCase()}" aria-hidden="true">${prayerSymbols[name]}</i><span class="prayer-time-name">${name}</span><b>${displayTime(time)}</b></div>`).join('');
      let start, end, now = minuteNow;
      if (upcomingIndex === 0) { start = toMinutes(prayers[4][1]); end = toMinutes(prayers[0][1]) + 1440; now += 1440; }
      else if (upcomingIndex > 0) { start = toMinutes(prayers[upcomingIndex - 1][1]); end = toMinutes(prayers[upcomingIndex][1]); }
      else { start = toMinutes(prayers[4][1]); end = toMinutes(prayers[0][1]) + 1440; }
      const progress = Math.max(0, Math.min(100, end > start ? ((now - start) / (end - start)) * 100 : 0));
      $('#prayerProgressFill').style.width = `${progress}%`;
      $('#prayerProgressMarker').style.left = `${progress}%`;
      $('#prayerProgressLabel').textContent = `Menuju ${nextTime[0]} · ${Math.round(progress)}%`;
      $('#prayerUpdated').textContent = `Jadual e-Solat JAKIM · Zon ${prayerZone}`;
    } catch (error) {
      console.error('Gagal memuatkan waktu solat Shah Alam:', error);
      next.textContent = 'Waktu solat tidak dapat dimuatkan.';
      times.innerHTML = '<span class="widget-muted">Sumber jadual sedang tidak tersedia. Cuba muat semula sebentar lagi.</span>';
      $('#prayerUpdated').textContent = `Zon JAKIM ${prayerZone}`;
    }
  }

  window.refreshResidentFinanceSummary = async () => {
    if (window.COMMUNITY_SESSION?.profile.role !== 'resident') return;
    let data = null, error = null;
    try { ({ data, error } = await window.COMMUNITY_SUPABASE.rpc('get_resident_finance_summary')); } catch (caught) { error = caught; }
    if (window.COMMUNITY_SESSION?.profile.role !== 'resident') return;
    window.COMMUNITY_DATA_FINANCE_SUMMARY = error ? null : data;
    const amount = Number(data?.balance), displayAmount = !error && Number.isFinite(amount) ? `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
    if ($('#statBalance')) $('#statBalance').textContent = displayAmount;
    if ($('#paymentBalanceTotal')) $('#paymentBalanceTotal').textContent = displayAmount;
  };
  window.addEventListener('community-settings-updated', () => {
    const configuredZone = window.COMMUNITY_SETTINGS?.prayer_zone;
    if (!['SGR01', 'SGR03'].includes(configuredZone) || configuredZone === prayerZone) return;
    prayerZone = configuredZone;
    $('#prayerUpdated').textContent = `Memuatkan zon ${prayerZone}…`;
    loadPrayerTimes();
    window.loadPrayerMonth?.();
  });
  if ($('#prayerHijriDate')) hijriDateLabel().then(label => { $('#prayerHijriDate').textContent = `Tarikh Hijrah · ${label}`; });
  initPrayerMonthOptions();
  loadWeather();
  loadAirIndex();
  loadRiverReadings();
  loadPrayerTimes();
})();

