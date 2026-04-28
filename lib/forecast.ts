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
  sea_level_height_msl?: NullableNumber[];
};

type WeatherHourly = {
  time: string[];
  wind_speed_10m?: NullableNumber[];
  wind_direction_10m?: NullableNumber[];
  wind_gusts_10m?: NullableNumber[];
};

type OpenMeteoMarineResponse = {
  hourly?: MarineHourly;
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

function energyScore(height: NullableNumber, period: NullableNumber) {
  return typeof height === "number" && typeof period === "number"
    ? height * period
    : Number.NEGATIVE_INFINITY;
}

function rankSwellComponents(
  primary: {
    height: NullableNumber;
    period: NullableNumber;
    peakPeriod: NullableNumber;
    direction: NullableNumber;
  },
  secondary: {
    height: NullableNumber;
    period: NullableNumber;
    peakPeriod: NullableNumber;
    direction: NullableNumber;
  }
) {
  const components = [primary, secondary].map((component, index) => ({
    component,
    energyScore: energyScore(component.height, component.period),
    index
  }));

  components.sort((a, b) => b.energyScore - a.energyScore || a.index - b.index);

  return {
    primarySwell: components[0].component,
    secondarySwell: components[1].component
  };
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
      timezone: "auto",
      wind_speed_unit: "kn"
    }
  );

  const tideUrl = buildUrl(
    "https://marine-api.open-meteo.com/v1/marine",
    {
      latitude: NEARSHORE_POINT.latitude,
      longitude: NEARSHORE_POINT.longitude,
      hourly: "sea_level_height_msl",
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

  if (!tide.hourly) {
    throw new Error("Open-Meteo tide response did not include hourly data");
  }

  const swellHourly = swell.hourly;
  const windByTime = weatherIndexByTime(wind.hourly);
  const tideByTime = weatherIndexByTime(tide.hourly);

  const rows = swellHourly.time
    .map((time, index) => ({ time, index }))
    .filter((_, rowIndex) => rowIndex % THREE_HOUR_STEP === 0)
    .map(({ time, index }) => {
      const windIndex = windByTime.get(time);
      const tideIndex = tideByTime.get(time);
      const rankedSwell = rankSwellComponents(
        {
          height: byTime(swellHourly, index, "swell_wave_height"),
          period: byTime(swellHourly, index, "swell_wave_period"),
          peakPeriod: byTime(swellHourly, index, "swell_wave_peak_period"),
          direction: byTime(swellHourly, index, "swell_wave_direction")
        },
        {
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
          peakPeriod: null,
          direction: byTime(
            swellHourly,
            index,
            "secondary_swell_wave_direction"
          )
        }
      );

      return {
        time,
        primarySwell: rankedSwell.primarySwell,
        secondarySwell: rankedSwell.secondarySwell,
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
        },
        tide: {
          seaLevelMsl:
            typeof tideIndex === "number"
              ? byTime(tide.hourly!, tideIndex, "sea_level_height_msl")
              : null
        }
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    rows
  };
}
