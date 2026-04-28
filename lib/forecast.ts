import "server-only";

import {
  FORECAST_REVALIDATE_SECONDS,
  NEARSHORE_POINT,
  OFFSHORE_POINT,
  type NullableNumber,
  type SurfForecast
} from "@/lib/forecast-types";

export { FORECAST_REVALIDATE_SECONDS, NEARSHORE_POINT, OFFSHORE_POINT };

type MarineHourly = {
  time: string[];
  swell_wave_height?: NullableNumber[];
  swell_wave_direction?: NullableNumber[];
  swell_wave_period?: NullableNumber[];
  secondary_swell_wave_height?: NullableNumber[];
  secondary_swell_wave_period?: NullableNumber[];
  secondary_swell_wave_direction?: NullableNumber[];
  swell_wave_peak_period?: NullableNumber[];
};

type MarineCurrent = {
  time?: string;
  sea_level_height_msl?: NullableNumber;
};

type WeatherHourly = {
  time: string[];
  wind_speed_10m?: NullableNumber[];
  wind_direction_10m?: NullableNumber[];
  wind_gusts_10m?: NullableNumber[];
};

type OpenMeteoMarineResponse = {
  hourly?: MarineHourly;
  current?: MarineCurrent;
};

type OpenMeteoWeatherResponse = {
  hourly: WeatherHourly;
};

const THREE_HOUR_STEP = 3;

function buildUrl(baseUrl: string, params: Record<string, string | number>) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: FORECAST_REVALIDATE_SECONDS }
  });

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function byTime<T extends { time: string[] }>(
  hourly: T,
  index: number,
  field: keyof T
): NullableNumber {
  const values = hourly[field];

  if (!Array.isArray(values)) {
    return null;
  }

  const value = values[index];
  return typeof value === "number" ? value : null;
}

function weatherIndexByTime(hourly: WeatherHourly | MarineHourly) {
  return new Map(hourly.time.map((time, index) => [time, index]));
}

export async function getForecast(): Promise<SurfForecast> {
  const swellUrl = buildUrl(
    "https://marine-api.open-meteo.com/v1/marine",
    {
      latitude: OFFSHORE_POINT.latitude,
      longitude: OFFSHORE_POINT.longitude,
      hourly:
        "swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,swell_wave_peak_period",
      timezone: "auto",
      past_days: 0,
      forecast_days: 16,
      length_unit: "imperial",
      wind_speed_unit: "kn"
    }
  );

  const windUrl = buildUrl(
    "https://api.open-meteo.com/v1/forecast",
    {
      latitude: NEARSHORE_POINT.latitude,
      longitude: NEARSHORE_POINT.longitude,
      hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
      past_days: 0,
      forecast_days: 16,
      wind_speed_unit: "kn"
    }
  );

  const tideUrl = buildUrl(
    "https://marine-api.open-meteo.com/v1/marine",
    {
      latitude: NEARSHORE_POINT.latitude,
      longitude: NEARSHORE_POINT.longitude,
      current: "sea_level_height_msl",
      timezone: "auto",
      past_days: 0,
      forecast_days: 16,
    }
  );

  const [swell, wind, tide] = await Promise.all([
    fetchJson<OpenMeteoMarineResponse>(swellUrl),
    fetchJson<OpenMeteoWeatherResponse>(windUrl),
    fetchJson<OpenMeteoMarineResponse>(tideUrl)
  ]);

  if (!swell.hourly) {
    throw new Error("Open-Meteo swell response did not include hourly data");
  }

  const swellHourly = swell.hourly;
  const windByTime = weatherIndexByTime(wind.hourly);

  const rows = swellHourly.time
    .map((time, index) => ({ time, index }))
    .filter((_, rowIndex) => rowIndex % THREE_HOUR_STEP === 0)
    .map(({ time, index }) => {
      const windIndex = windByTime.get(time);

      return {
        time,
        primarySwell: {
          height: byTime(swellHourly, index, "swell_wave_height"),
          period: byTime(swellHourly, index, "swell_wave_period"),
          peakPeriod: byTime(swellHourly, index, "swell_wave_peak_period"),
          direction: byTime(swellHourly, index, "swell_wave_direction")
        },
        secondarySwell: {
          height: byTime(
            swellHourly,
            index,
            "secondary_swell_wave_height"
          ),
          period: byTime(
            swellHourly,
            index,
            "secondary_swell_wave_period"
          ),
          direction: byTime(
            swellHourly,
            index,
            "secondary_swell_wave_direction"
          )
        },
        wind: {
          speed:
            typeof windIndex === "number"
              ? byTime(wind.hourly, windIndex, "wind_speed_10m")
              : null,
          gusts:
            typeof windIndex === "number"
              ? byTime(wind.hourly, windIndex, "wind_gusts_10m")
              : null,
          direction:
            typeof windIndex === "number"
              ? byTime(wind.hourly, windIndex, "wind_direction_10m")
              : null
        }
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    currentTide: {
      seaLevelMsl:
        typeof tide.current?.sea_level_height_msl === "number"
          ? tide.current.sea_level_height_msl * 3.28084
          : null,
      unit: "ft"
    },
    rows
  };
}
