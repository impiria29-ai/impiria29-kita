(() => {
  const $ = selector => document.querySelector(selector);
  const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=2.9788811&longitude=101.5361309&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=Asia%2FKuala_Lumpur';
  const prayerUrl = 'https://solat.my/api/daily/SGR01';
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
  const dayLabel = (date, index) => index === 0 ? 'Hari ini' : new Date(`${date}T12:00:00`).toLocaleDateString('ms-MY', { weekday: 'short' });
  const displayTime = value => String(value || '').match(/\d{1,2}:\d{2}/)?.[0] || '—';

  async function loadWeather() {
    const current = $('#weatherCurrent'), forecast = $('#weatherForecast');
    try {
      const response = await fetch(weatherUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Cuaca tidak tersedia.');
      const weather = await response.json();
      const [description, icon] = weatherDescription(Number(weather.current?.weather_code));
      current.innerHTML = `<span class="weather-icon">${icon}</span><b>${Math.round(weather.current?.temperature_2m ?? 0)}°C</b><span>${description}</span>`;
      forecast.innerHTML = (weather.daily?.time || []).slice(0, 3).map((date, index) => {
        const [condition, symbol] = weatherDescription(Number(weather.daily.weather_code[index]));
        const high = Math.round(weather.daily.temperature_2m_max[index]);
        const low = Math.round(weather.daily.temperature_2m_min[index]);
        const rain = weather.daily.precipitation_probability_max?.[index];
        return `<div class="weather-day"><b>${dayLabel(date, index)}</b><span class="weather-day-icon">${symbol}</span><span>${high}° <small>${low}°</small></span><small>${rain == null ? condition : `Hujan ${rain}%`}</small></div>`;
      }).join('') || '<p class="widget-muted">Ramalan belum tersedia.</p>';
      $('#weatherUpdated').textContent = `Sumber: Open-Meteo · ${new Date().toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      current.textContent = 'Cuaca tidak dapat dimuatkan sekarang.';
      forecast.innerHTML = '<p class="widget-muted">Semak sambungan internet dan cuba lagi kemudian.</p>';
    }
  }

  async function loadPrayerTimes() {
    const next = $('#nextPrayer'), times = $('#prayerTimes');
    try {
      const response = await fetch(prayerUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Waktu solat tidak tersedia.');
      const result = await response.json();
      const day = result.prayerTime?.[0] || result.data?.prayerTime?.[0] || result.data?.[0] || result;
      const prayers = [['Subuh', day.fajr], ['Zohor', day.dhuhr], ['Asar', day.asr], ['Maghrib', day.maghrib], ['Isyak', day.isha]];
      const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
      const [hourNow, minutePart] = clock.split(':').map(Number);
      const minuteNow = hourNow * 60 + minutePart;
      const upcoming = prayers.find(([, time]) => {
        const match = displayTime(time).match(/^(\d{1,2}):(\d{2})$/);
        return match && Number(match[1]) * 60 + Number(match[2]) > minuteNow;
      });
      const nextTime = upcoming || prayers[0];
      next.innerHTML = `Seterusnya: <b>${nextTime[0]} · ${displayTime(nextTime[1])}${upcoming ? '' : ' esok'}</b>`;
      times.innerHTML = prayers.map(([name, time]) => `<div><span>${name}</span><b>${displayTime(time)}</b></div>`).join('');
      $('#prayerUpdated').textContent = 'Jadual e-Solat · Zon SGR01';
    } catch {
      next.textContent = 'Waktu solat tidak dapat dimuatkan.';
      times.innerHTML = '<span class="widget-muted">Sila cuba lagi kemudian.</span>';
    }
  }

  window.refreshResidentFinanceSummary = async () => {
    if (window.COMMUNITY_SESSION?.profile.role !== 'resident') return;
    let data = null, error = null;
    try { ({ data, error } = await window.COMMUNITY_SUPABASE.rpc('get_resident_finance_summary')); } catch (caught) { error = caught; }
    const active = window.COMMUNITY_SESSION?.profile.role === 'resident';
    if (!active) return;
    window.COMMUNITY_DATA_FINANCE_SUMMARY = error ? null : data;
    const amount = Number(data?.balance);
    const target = $('#statBalance');
    if (target) target.textContent = !error && Number.isFinite(amount) ? `RM ${amount.toLocaleString('ms-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  };

  loadWeather();
  loadPrayerTimes();
})();
