(() => {
  const $ = selector => document.querySelector(selector);
  const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=2.9788811&longitude=101.5361309&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset&forecast_days=7&timezone=Asia%2FKuala_Lumpur';
  const apimsUrl = 'https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm';
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
      const response = await fetch(weatherUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Cuaca tidak tersedia.');
      const weather = await response.json();
      const [description, icon] = weatherDescription(Number(weather.current?.weather_code));
      current.innerHTML = `<span class="weather-icon">${icon}</span><b>${Math.round(weather.current?.temperature_2m ?? 0)}°C</b><span>${description}</span>`;
      forecast.innerHTML = (weather.daily?.time || []).slice(0, 3).map((_, index) => renderWeatherDay(weather, index)).join('') || '<p class="widget-muted">Ramalan belum tersedia.</p>';
      $('#weatherUpdated').textContent = `Sumber: Open-Meteo · ${new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })} · Tekan untuk 7 hari`;
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
      for (const key of ['features', 'data', 'stations', 'results', 'items', 'records']) if (Array.isArray(payload[key])) return toRows(payload[key]);
      if (Array.isArray(payload.result?.features)) return toRows(payload.result.features);
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
    const raw = getField(row, ['API', 'AQI', 'CURRENT_API', 'IPU', 'VALUE', 'CAQM_API', 'API_VALUE']);
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
    try {
      const result = await requestJson(apimsUrl, 10000), rows = toRows(result).map(row => {
        const lat = coordinate(row, ['LATITUDE', 'LAT', 'Y']), lon = coordinate(row, ['LONGITUDE', 'LON', 'LNG', 'X']);
        const api = airIndex(row);
        const distance = lat === null || lon === null ? Infinity : Math.hypot((lat - taman.latitude) * 111, (lon - taman.longitude) * 111 * Math.cos(taman.latitude * Math.PI / 180));
        return { row, lat, lon, api, distance };
      }).filter(item => item.api !== null && item.distance !== Infinity).sort((a, b) => a.distance - b.distance);
      const nearest = rows[0];
      if (!nearest) throw new Error('Format data APIMS tidak dapat dibaca.');
      const [status, className] = airStatus(nearest.api);
      output.innerHTML = `<span class="ipu-value ${className}">${nearest.api}</span> <span class="ipu-status">${status}</span>`;
      const name = getField(nearest.row, ['STATION_LOCATION', 'LOCATION', 'STATION_NAME', 'STATION', 'NAME', 'STATIONNAME']) || 'Stesen JAS terdekat';
      const updated = getField(nearest.row, ['DATETIME', 'TIMESTAMP', 'UPDATED_AT', 'READING_TIME', 'TIME']);
      stationOutput.textContent = `${name}${nearest.distance < 100 ? ` · kira-kira ${Math.round(nearest.distance)} km` : ''}${updated ? ` · ${updated}` : ''}`;
    } catch (error) {
      console.warn('Bacaan IPU APIMS tidak tersedia:', error);
      output.textContent = '—';
      stationOutput.innerHTML = '<a href="https://eqms.doe.gov.my/APIMS/main" target="_blank" rel="noopener">Lihat bacaan rasmi JAS / APIMS ↗</a>';
    }
  }

  async function requestJson(url, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
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
    const requested = new Map([['3015435', 'Batu Tiga'], ['3015490', 'T.T.D.I Jaya, Shah Alam'], ['3115404', 'Kampung Melayu Subang']]);
    try {
      const response = await fetch('https://publicinfobanjir.water.gov.my/waterleveldata/Selangor', { cache: 'no-store' });
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
      console.info('Bacaan sungai JPS dibuka terus melalui pautan rasmi.', error);
      updated.textContent = 'Paparan bacaan automatik tidak tersedia pada browser ini. Tekan “Bacaan langsung JPS” untuk data semasa.';
    }
  }

  function malaysiaDate() {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }

  async function loadPrayerFromOpenData(zone) {
    const index = await requestJson('https://sajadah.org/api/v1/regions.json');
    const region = (index.regions || []).find(item => String(item.zone || '').toUpperCase() === zone);
    if (!region?.id) throw new Error(`Zon ${zone} tidak dijumpai.`);
    const year = Number(malaysiaDate().slice(0, 4));
    const table = await requestJson(`https://sajadah.org/api/v1/times/my/${encodeURIComponent(region.id)}/${year}.json`);
    const fields = table.fields || [];
    const today = (table.days || []).find(row => row[fields.indexOf('date')] === malaysiaDate());
    if (!today) throw new Error('Jadual untuk hari ini belum tersedia.');
    const value = name => { const index = fields.indexOf(name); return index >= 0 ? today[index] : ''; };
    return { fajr: value('fajr'), dhuhr: value('dhuhr'), asr: value('asr'), maghrib: value('maghrib'), isha: value('isha') };
  }
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
      const upcoming = prayers.find(([, time]) => { const match = displayTime(time).match(/^(\d{1,2}):(\d{2})$/); return match && Number(match[1]) * 60 + Number(match[2]) > minuteNow; });
      const nextTime = upcoming || prayers[0];
      next.innerHTML = `Seterusnya: <b>${nextTime[0]} · ${displayTime(nextTime[1])}${upcoming ? '' : ' esok'}</b>`;
      times.innerHTML = prayers.map(([name, time]) => `<div><span>${name}</span><b>${displayTime(time)}</b></div>`).join('');
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
  });
  loadWeather();
  loadAirIndex();
  loadRiverReadings();
  loadPrayerTimes();
})();

