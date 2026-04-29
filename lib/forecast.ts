import "server-only";

import {
  FORECAST_REVALIDATE_SECONDS,
  NEARSHORE_POINT,
  OFFSHORE_POINT,
  type NullableNumber,
  type ForecastSourceDebug,
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

type StormglassSeaLevelPoint = {
  time: string;
  height?: NullableNumber;
  sg?: NullableNumber;
  noaa?: NullableNumber;
  meteo?: NullableNumber;
  dwd?: NullableNumber;
  meto?: NullableNumber;
  fcoo?: NullableNumber;
  fmi?: NullableNumber;
  yr?: NullableNumber;
  smhi?: NullableNumber;
};

type StormglassExtremePoint = {
  time: string;
  height?: NullableNumber;
  type?: "high" | "low" | string;
};

type StormglassTideResponse = {
  data?: StormglassSeaLevelPoint[];
};

type StormglassExtremesResponse = {
  data?: StormglassExtremePoint[];
};

type OpenMeteoWeatherResponse = {
  hourly?: WeatherHourly;
};

export const SWELL_MODELS = [
  "best_match",
  "ecmwf_wam",
  "gfs_wave",
  "meteofrance_mfwam"
] as const;

export type SwellModel = (typeof SWELL_MODELS)[number];

const FORECAST_DAYS = 16;
const MARINE_ENDPOINT = "https://marine-api.open-meteo.com/v1/marine";
const WIND_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const STORMGLASS_TIDE_ENDPOINT =
  "https://api.stormglass.io/v2/tide/sea-level/point";
const STORMGLASS_TIDE_EXTREMES_ENDPOINT =
  "https://api.stormglass.io/v2/tide/extremes/point";
const SWELL_HOURLY =
  "swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,swell_wave_peak_period";
const WIND_HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m";
const TIDE_FORECAST_DAYS = 10;
const TIDE_REVALIDATE_SECONDS = 6 * 60 * 60;

const SWELL_MODEL_API_VALUES: Record<SwellModel, string | null> = {
  best_match: null,
  ecmwf_wam: "ecmwf_wam",
  gfs_wave: "ncep_gfswave025",
  meteofrance_mfwam: "meteofrance_wave"
};

function buildUrl(baseUrl: string, params: Record<string, string | number>) {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function fetchJson<T>(
  url: string,
  options: {
    headers?: HeadersInit;
    revalidate?: number;
  } = {}
): Promise<T> {
  const response = await fetch(url, {
    headers: options.headers,
    next: { revalidate: options.revalidate ?? FORECAST_REVALIDATE_SECONDS }
  });

  if (!response.ok) {
    throw new Error(`Forecast request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function normalizeSwellModel(value: string | null | undefined): SwellModel {
  return SWELL_MODELS.includes(value as SwellModel)
    ? (value as SwellModel)
    : "best_match";
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

function localForecastKeyFromDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Managua",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    hour12: false
  }).formatToParts(date);
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = getPart("hour") === "24" ? "00" : getPart("hour");

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${hour}:00`;
}

function stormglassLocalDateWindow() {
  const [date] = localForecastKeyFromDate(new Date()).split("T");
  const start = new Date(`${date}T06:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + TIDE_FORECAST_DAYS);

  return { start, end };
}

function stormglassSeaLevel(point: StormglassSeaLevelPoint) {
  return [
    point.height,
    point.sg,
    point.noaa,
    point.meteo,
    point.dwd,
    point.meto,
    point.fcoo,
    point.fmi,
    point.yr,
    point.smhi
  ].find((value): value is number => typeof value === "number") ?? null;
}

function stormglassPointsToHourly(points: StormglassSeaLevelPoint[] = []) {
  const tideByTime = new Map<string, NullableNumber>();

  for (const point of points) {
    const time = localForecastKeyFromDate(new Date(point.time));
    tideByTime.set(time, stormglassSeaLevel(point));
  }

  return tideByTime;
}

function sourceDebug(
  source: string,
  endpoint: string,
  coordinates: { latitude: number; longitude: number },
  hourly: { time: string[] } | null | undefined,
  options: {
    requestedForecastDays?: number;
    model?: string;
    apiModel?: string;
    datum?: string;
    extremesReturned?: number;
    error?: string;
  } = {}
): ForecastSourceDebug {
  const timestamps = hourly?.time ?? [];

  return {
    source,
    endpoint,
    coordinates,
    requestedForecastDays: FORECAST_DAYS,
    hourlyTimestampsReturned: timestamps.length,
    firstTimestamp: timestamps[0] ?? null,
    lastTimestamp: timestamps.at(-1) ?? null,
    ...options
  };
}

function energyScore(height: NullableNumber, period: NullableNumber) {
  return typeof height === "number" && typeof period === "number"
    ? height ** 2 * period
    : null;
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
  const components = [primary, secondary].map((component, index) => {
    const energy = energyScore(component.height, component.period);

    return {
      component: {
        ...component,
        energy
      },
      energyScore: energy ?? Number.NEGATIVE_INFINITY,
      index
    };
  });

  components.sort((a, b) => b.energyScore - a.energyScore || a.index - b.index);

  return {
    primarySwell: components[0].component,
    secondarySwell: components[1].component
  };
}

async function fetchSource<T>(
  url: string,
  debugFactory: (data: T | null, error?: string) => ForecastSourceDebug
) {
  try {
    const data = await fetchJson<T>(url);

    return {
      data,
      debug: debugFactory(data)
    };
  } catch (error) {
    return {
      data: null,
      debug: debugFactory(
        null,
        error instanceof Error ? error.message : "Unknown fetch error"
      )
    };
  }
}

async function fetchTideForecast() {
  const apiKey = process.env.STORMGLASS_API_KEY;
  const { start, end } = stormglassLocalDateWindow();
  const baseParams = {
    lat: NEARSHORE_POINT.latitude,
    lng: NEARSHORE_POINT.longitude,
    start: start.toISOString(),
    end: end.toISOString(),
    datum: "MLLW"
  };
  const seaLevelUrl = buildUrl(STORMGLASS_TIDE_ENDPOINT, baseParams);

  if (!apiKey) {
    return {
      tideByTime: new Map<string, NullableNumber>(),
      currentTide: null,
      debug: sourceDebug("tide", STORMGLASS_TIDE_ENDPOINT, NEARSHORE_POINT, null, {
        datum: "MLLW",
        error: "STORMGLASS_API_KEY is not configured"
      })
    };
  }

  try {
    const seaLevel = await fetchJson<StormglassTideResponse>(seaLevelUrl, {
      headers: { Authorization: apiKey },
      revalidate: TIDE_REVALIDATE_SECONDS
    });
    const points = seaLevel.data ?? [];
    const timestamps = points.map((point) =>
      localForecastKeyFromDate(new Date(point.time))
    );

    return {
      tideByTime: stormglassPointsToHourly(points),
      currentTide: null,
      debug: {
        source: "tide",
        endpoint: STORMGLASS_TIDE_ENDPOINT,
        coordinates: NEARSHORE_POINT,
        requestedForecastDays: TIDE_FORECAST_DAYS,
        hourlyTimestampsReturned: timestamps.length,
        firstTimestamp: timestamps[0] ?? null,
        lastTimestamp: timestamps.at(-1) ?? null,
        datum: "MLLW"
      }
    };
  } catch (seaLevelError) {
    const extremesUrl = buildUrl(
      STORMGLASS_TIDE_EXTREMES_ENDPOINT,
      baseParams
    );

    try {
      const extremes = await fetchJson<StormglassExtremesResponse>(
        extremesUrl,
        {
          headers: { Authorization: apiKey },
          revalidate: TIDE_REVALIDATE_SECONDS
        }
      );
      const points = extremes.data ?? [];

      return {
        tideByTime: new Map<string, NullableNumber>(),
        currentTide: null,
        debug: sourceDebug("tide", STORMGLASS_TIDE_EXTREMES_ENDPOINT, NEARSHORE_POINT, null, {
          datum: "MLLW",
          extremesReturned: points.length,
          requestedForecastDays: TIDE_FORECAST_DAYS,
          error:
            seaLevelError instanceof Error
              ? `Sea-level unavailable; using extremes metadata only. ${seaLevelError.message}`
              : "Sea-level unavailable; using extremes metadata only."
        })
      };
    } catch (extremesError) {
      return {
        tideByTime: new Map<string, NullableNumber>(),
        currentTide: null,
        debug: sourceDebug("tide", STORMGLASS_TIDE_ENDPOINT, NEARSHORE_POINT, null, {
          datum: "MLLW",
          requestedForecastDays: TIDE_FORECAST_DAYS,
          error:
            extremesError instanceof Error
              ? extremesError.message
              : "Stormglass tide request failed"
        })
      };
    }
  }
}

function tideValueForTime(
  tideByTime: Map<string, NullableNumber>,
  time: string
) {
  const tideValue = tideByTime.get(time);

  return typeof tideValue === "number" ? tideValue : null;
}

function sourceRows(
  swellHourly: MarineHourly | undefined,
  windHourly: WeatherHourly | undefined,
  tideByTime: Map<string, NullableNumber>
) {
  return Array.from(
    new Set([
      ...(swellHourly?.time ?? []),
      ...(windHourly?.time ?? []),
      ...tideByTime.keys()
    ])
  )
    .sort()
    .slice(0, FORECAST_DAYS * 24);
}

function shouldUseTideValue(value: NullableNumber) {
  return typeof value === "number" && value >= 0;
}

function tideRow(value: NullableNumber) {
  return shouldUseTideValue(value) ? { seaLevelMsl: value } : null;
}

function windRow(
  windHourly: WeatherHourly | undefined,
  windIndex: number | undefined
) {
  return {
    speed:
      typeof windIndex === "number" && windHourly
        ? byTime(windHourly, windIndex, "wind_speed_10m")
        : null,
    gusts:
      typeof windIndex === "number" && windHourly
        ? byTime(windHourly, windIndex, "wind_gusts_10m")
        : null,
    direction:
      typeof windIndex === "number" && windHourly
        ? byTime(windHourly, windIndex, "wind_direction_10m")
        : null
  };
}

function rankedSwellRow(
  swellHourly: MarineHourly | undefined,
  swellIndex: number | undefined
) {
  return rankSwellComponents(
    {
      height:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "swell_wave_height")
          : null,
      period:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "swell_wave_period")
          : null,
      peakPeriod:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "swell_wave_peak_period")
          : null,
      direction:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "swell_wave_direction")
          : null
    },
    {
      height:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "secondary_swell_wave_height")
          : null,
      period:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "secondary_swell_wave_period")
          : null,
      peakPeriod: null,
      direction:
        typeof swellIndex === "number" && swellHourly
          ? byTime(swellHourly, swellIndex, "secondary_swell_wave_direction")
          : null
    }
  );
}

export async function getForecast(
  options: { swellModel?: string } = {}
): Promise<SurfForecast> {
  const activeSwellModel = normalizeSwellModel(options.swellModel);
  const apiSwellModel = SWELL_MODEL_API_VALUES[activeSwellModel];
  const swellUrl = buildUrl(
    MARINE_ENDPOINT,
    {
      latitude: OFFSHORE_POINT.latitude,
      longitude: OFFSHORE_POINT.longitude,
      hourly: SWELL_HOURLY,
      timezone: "auto",
      past_days: 0,
      forecast_days: FORECAST_DAYS,
      length_unit: "imperial",
      wind_speed_unit: "kn",
      ...(apiSwellModel ? { models: apiSwellModel } : {})
    }
  );

  const windUrl = buildUrl(
    WIND_ENDPOINT,
    {
      latitude: NEARSHORE_POINT.latitude,
      longitude: NEARSHORE_POINT.longitude,
      hourly: WIND_HOURLY,
      past_days: 0,
      forecast_days: FORECAST_DAYS,
      timezone: "auto",
      wind_speed_unit: "kn"
    }
  );

  const [swell, wind, tide] = await Promise.all([
    fetchSource<OpenMeteoMarineResponse>(swellUrl, (data, error) =>
      sourceDebug("swell", MARINE_ENDPOINT, OFFSHORE_POINT, data?.hourly, {
        model: activeSwellModel,
        apiModel: apiSwellModel ?? "best_match",
        error
      })
    ),
    fetchSource<OpenMeteoWeatherResponse>(windUrl, (data, error) =>
      sourceDebug("wind", WIND_ENDPOINT, NEARSHORE_POINT, data?.hourly, {
        error
      })
    ),
    fetchTideForecast()
  ]);

  const swellHourly = swell.data?.hourly;
  const windHourly = wind.data?.hourly;
  const swellByTime = swellHourly ? weatherIndexByTime(swellHourly) : new Map<string, number>();
  const windByTime = windHourly ? weatherIndexByTime(windHourly) : new Map<string, number>();
  const times = sourceRows(swellHourly, windHourly, tide.tideByTime);

  const rows = times
    .map((time) => {
      const swellIndex = swellByTime.get(time);
      const windIndex = windByTime.get(time);
      const tideValue = tideValueForTime(tide.tideByTime, time);
      const rankedSwell = rankedSwellRow(swellHourly, swellIndex);

      return {
        time,
        primarySwell: rankedSwell.primarySwell,
        secondarySwell: rankedSwell.secondarySwell,
        wind: windRow(windHourly, windIndex),
        tide: tideRow(tideValue)
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    activeSwellModel,
    currentTide: tide.currentTide,
    debug: {
      sources: [swell.debug, wind.debug, tide.debug]
    },
    rows
  };
}
