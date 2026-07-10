import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const SAMARA_LAT = 53.2001;
const SAMARA_LON = 50.15;

export const getWeather = createTool({
  id: 'get-weather',
  description:
    'Fetches weather forecast for Samara (Самара) for the next 7 days from Open-Meteo API. Returns daily temperature, precipitation, and wind speed.',
  inputSchema: z.object({
    days: z.number().min(1).max(16).default(7).describe('Number of forecast days (1-16, default 7)')
  }),
  outputSchema: z.object({
    forecast: z.string().describe('Human-readable weather forecast')
  }),
  execute: async ({ days }) => {
    const params = new URLSearchParams({
      latitude: String(SAMARA_LAT),
      longitude: String(SAMARA_LON),
      daily:
        'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code',
      timezone: 'Europe/Moscow',
      forecast_days: String(days)
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    console.log('--- WEATHER API CALL ---');
    console.log('URL:', url);

    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`Weather API error ${resp.status}: ${text}`);
    }

    const data = await resp.json();

    if (!data.daily) {
      throw new Error('Unexpected weather API response format');
    }

    const dates: string[] = data.daily.time || [];
    const tMax: number[] = data.daily.temperature_2m_max || [];
    const tMin: number[] = data.daily.temperature_2m_min || [];
    const precip: (number | null)[] = data.daily.precipitation_sum || [];
    const precipProb: (number | null)[] = data.daily.precipitation_probability_max || [];
    const weatherCodes: number[] = data.daily.weather_code || [];

    const wmoDescriptions: Record<number, string> = {
      0: 'Ясно',
      1: 'Преимущественно ясно',
      2: 'Переменная облачность',
      3: 'Пасмурно',
      45: 'Туман',
      48: 'Изморозь',
      51: 'Морось слабая',
      53: 'Морось умеренная',
      55: 'Морось сильная',
      61: 'Дождь слабый',
      63: 'Дождь умеренный',
      65: 'Дождь сильный',
      71: 'Снег слабый',
      73: 'Снег умеренный',
      75: 'Снег сильный',
      80: 'Ливень слабый',
      81: 'Ливень умеренный',
      82: 'Ливень сильный',
      95: 'Гроза',
      96: 'Гроза с градом',
      99: 'Гроза с сильным градом'
    };

    const lines: string[] = [
      `🌤 Прогноз погоды — Самара на ${days} дн.`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`
    ];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      const maxT = tMax[i] != null ? `${tMax[i]}°C` : '—';
      const minT = tMin[i] != null ? `${tMin[i]}°C` : '—';
      const p = precip[i] != null ? `${precip[i]} мм` : '—';
      const pp = precipProb[i] != null ? `${precipProb[i]}%` : '—';
      const wmo =
        weatherCodes[i] != null
          ? (wmoDescriptions[weatherCodes[i]] ?? `Код ${weatherCodes[i]}`)
          : '—';

      lines.push(`📅 ${date}: ${wmo}`);
      lines.push(`   ${maxT} / ${minT}, осадки: ${p} (вероятность ${pp})`);
    }

    console.log('--- WEATHER API END ---');
    return { forecast: lines.join('\n') };
  }
});
