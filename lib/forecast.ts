import "server-only";

import {
  FORECAST_REVALIDATE_SECONDS,
  NEARSHORE_POINT,
  OFFSHORE_POINT,
  type NullableNumber,
  type ForecastSourceDebug,
  type SurfForecast,
  type TideEvent
} from "@/lib/forecast-types";

export { FORECAST_REVALIDATE_SECONDS, NEARSHORE_POINT, OFFSHORE_POINT };

type MarineHourly = {
  time: string[];
  wave_height?: NullableNumber[];
  swell_wave_height?: NullableNumber[];
  swell_wave_direction?: NullableNumber[];
  swell_wave_period?: NullableNumber[];
  secondary_swell_wave_height?: NullableNumber[];
  secondary_swell_wave_period?: NullableNumber[];
  secondary_swell_wave_direction?: NullableNumber[];
  tertiary_swell_wave_height?: NullableNumber[];
  tertiary_swell_wave_period?: NullableNumber[];
  tertiary_swell_wave_direction?: NullableNumber[];
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
  meta?: {
    station?: {
      name?: string;
      distance?: number;
    };
  };
};

type OpenMeteoWeatherResponse = {
  hourly?: WeatherHourly;
};

const FORECAST_DAYS = 16;
const MARINE_ENDPOINT = "https://marine-api.open-meteo.com/v1/marine";
const WIND_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const STORMGLASS_TIDE_ENDPOINT =
  "https://api.stormglass.io/v2/tide/sea-level/point";
const STORMGLASS_TIDE_EXTREMES_ENDPOINT =
  "https://api.stormglass.io/v2/tide/extremes/point";
const SWELL_HOURLY =
  "wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_period,secondary_swell_wave_direction,tertiary_swell_wave_height,tertiary_swell_wave_period,tertiary_swell_wave_direction,swell_wave_peak_period";
const WIND_HOURLY = "wind_speed_10m,wind_direction_10m,wind_gusts_10m";
const TIDE_FORECAST_DAYS = 10;
const TIDE_REVALIDATE_SECONDS = 6 * 60 * 60;
const PRIMARY_SWELL_MODEL = "best_match";
const SECONDARY_SWELL_MODEL = "gfs_wave";
const SECONDARY_SWELL_API_MODEL = "ncep_gfswave025";

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
    station?: string;
    stationDistanceKm?: number;
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

type SwellComponent = {
  height: NullableNumber;
  period: NullableNumber;
  peakPeriod: NullableNumber;
  direction: NullableNumber;
};

function emptySwellComponent(): SwellComponent {
  return {
    height: null,
    period: null,
    peakPeriod: null,
    direction: null
  };
}

function rankSwellComponents(componentsToRank: SwellComponent[]) {
  const components = componentsToRank.map((component, index) => {
    const energy = energyScore(component.height, component.period);

    return {
      component,
      energyScore: energy ?? Number.NEGATIVE_INFINITY,
      index
    };
  });

  components.sort((a, b) => b.energyScore - a.energyScore || a.index - b.index);

  return {
    primarySwell: components[0]?.component ?? emptySwellComponent(),
    secondarySwell: components[1]?.component ?? emptySwellComponent(),
    tertiarySwell: components[2]?.component ?? emptySwellComponent()
  };
}

function buildSwellComponents(
  swellHourly: MarineHourly | undefined,
  swellIndex: number | undefined
) {
  if (typeof swellIndex !== "number" || !swellHourly) {
    return [emptySwellComponent(), emptySwellComponent(), emptySwellComponent()];
  }

  return [
    {
      height: byTime(swellHourly, swellIndex, "swell_wave_height"),
      period: byTime(swellHourly, swellIndex, "swell_wave_period"),
      peakPeriod: byTime(swellHourly, swellIndex, "swell_wave_peak_period"),
      direction: byTime(swellHourly, swellIndex, "swell_wave_direction")
    },
    {
      height: byTime(swellHourly, swellIndex, "secondary_swell_wave_height"),
      period: byTime(swellHourly, swellIndex, "secondary_swell_wave_period"),
      peakPeriod: null,
      direction: byTime(swellHourly, swellIndex, "secondary_swell_wave_direction")
    },
    {
      height: byTime(swellHourly, swellIndex, "tertiary_swell_wave_height"),
      period: byTime(swellHourly, swellIndex, "tertiary_swell_wave_period"),
      peakPeriod: null,
      direction: byTime(swellHourly, swellIndex, "tertiary_swell_wave_direction")
    }
  ];
}

function rankedSwellRow(
  swellHourly: MarineHourly | undefined,
  swellIndex: number | undefined
) {
  return rankSwellComponents(buildSwellComponents(swellHourly, swellIndex));
}

function aggregateWaveEnergy(...swells: SwellComponent[]) {
  const energies = swells
    .map((swell) => energyScore(swell.height, swell.period))
    .filter((value): value is number => typeof value === "number");

  return energies.length
    ? energies.reduce((total, value) => total + value, 0)
    : null;
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

function displayHourKeyForEvent(time: string) {
  const eventDate = new Date(time);
  const roundedDate = new Date(eventDate);

  if (roundedDate.getUTCMinutes() >= 30) {
    roundedDate.setUTCHours(roundedDate.getUTCHours() + 1);
  }

  roundedDate.setUTCMinutes(0, 0, 0);

  return localForecastKeyFromDate(roundedDate);
}

function stormglassExtremesToEvents(points: StormglassExtremePoint[] = []) {
  const tideEventsByTime = new Map<string, TideEvent>();

  for (const point of points) {
    const event = stormglassPointToEvent(point);

    if (!event) {
      continue;
    }

    tideEventsByTime.set(displayHourKeyForEvent(point.time), event);
  }

  return tideEventsByTime;
}

function stormglassPointToEvent(point: StormglassExtremePoint): TideEvent | null {
  if (typeof point.height !== "number" || !point.type) {
    return null;
  }

  return {
    type: point.type,
    time: localForecastKeyFromDate(new Date(point.time)),
    height: point.height
  };
}

function stormglassExtremesToEventList(points: StormglassExtremePoint[] = []) {
  return points
    .map(stormglassPointToEvent)
    .filter((event): event is TideEvent => Boolean(event))
    .sort((a, b) => a.time.localeCompare(b.time));
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
  const extremesUrl = buildUrl(
    STORMGLASS_TIDE_EXTREMES_ENDPOINT,
    baseParams
  );

  if (!apiKey) {
    return {
      tideByTime: new Map<string, NullableNumber>(),
      tideEventsByTime: new Map<string, TideEvent>(),
      tideEvents: [],
      currentTide: null,
      debug: sourceDebug("tide", STORMGLASS_TIDE_EXTREMES_ENDPOINT, NEARSHORE_POINT, null, {
        datum: "MLLW",
        requestedForecastDays: TIDE_FORECAST_DAYS,
        error: "STORMGLASS_API_KEY is not configured"
      })
    };
  }

  try {
    const extremes = await fetchJson<StormglassExtremesResponse>(
      extremesUrl,
      {
        headers: { Authorization: apiKey },
        revalidate: TIDE_REVALIDATE_SECONDS
      }
    );
    const points = extremes.data ?? [];
    const tideEvents = stormglassExtremesToEventList(points);
    const timestamps = points.map((point) =>
      localForecastKeyFromDate(new Date(point.time))
    );
    const station = extremes.meta?.station;

    return {
      tideByTime: new Map<string, NullableNumber>(),
      tideEventsByTime: stormglassExtremesToEvents(points),
      tideEvents,
      currentTide: null,
      debug: {
        source: "tide",
        endpoint: STORMGLASS_TIDE_EXTREMES_ENDPOINT,
        coordinates: NEARSHORE_POINT,
        requestedForecastDays: TIDE_FORECAST_DAYS,
        hourlyTimestampsReturned: 0,
        firstTimestamp: timestamps[0] ?? null,
        lastTimestamp: timestamps.at(-1) ?? null,
        datum: "MLLW",
        extremesReturned: points.length,
        station: station?.name,
        stationDistanceKm: station?.distance
      }
    };
  } catch (extremesError) {
    return {
      tideByTime: new Map<string, NullableNumber>(),
      tideEventsByTime: new Map<string, TideEvent>(),
      tideEvents: [],
      currentTide: null,
      debug: sourceDebug("tide", STORMGLASS_TIDE_EXTREMES_ENDPOINT, NEARSHORE_POINT, null, {
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

function tideValueForTime(
  tideByTime: Map<string, NullableNumber>,
  time: string
) {
  const tideValue = tideByTime.get(time);

  return typeof tideValue === "number" ? tideValue : null;
}

function sourceRows(
  primarySwellHourly: MarineHourly | undefined,
  secondarySwellHourly: MarineHourly | undefined,
  windHourly: WeatherHourly | undefined,
  tideByTime: Map<string, NullableNumber>,
  tideEventsByTime: Map<string, TideEvent>
) {
  return Array.from(
    new Set([
      ...(primarySwellHourly?.time ?? []),
      ...(secondarySwellHourly?.time ?? []),
      ...(windHourly?.time ?? []),
      ...tideByTime.keys(),
      ...tideEventsByTime.keys()
    ])
  )
    .sort()
    .slice(0, FORECAST_DAYS * 24);
}

function shouldUseTideValue(value: NullableNumber) {
  return typeof value === "number" && value >= 0;
}

function tideRow(value: NullableNumber, event?: TideEvent) {
  if (event) {
    return {
      seaLevelMsl: event.height,
      event
    };
  }

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

function waveHeightRow(
  swellHourly: MarineHourly | undefined,
  swellIndex: number | undefined
) {
  return typeof swellIndex === "number" && swellHourly
    ? byTime(swellHourly, swellIndex, "wave_height")
    : null;
}

export async function getForecast(): Promise<SurfForecast> {
  const primarySwellUrl = buildUrl(
    MARINE_ENDPOINT,
    {
      latitude: OFFSHORE_POINT.latitude,
      longitude: OFFSHORE_POINT.longitude,
      hourly: SWELL_HOURLY,
      timezone: "auto",
      past_days: 0,
      forecast_days: FORECAST_DAYS,
      length_unit: "imperial",
      wind_speed_unit: "kn"
    }
  );

  const secondarySwellUrl = buildUrl(
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
      models: SECONDARY_SWELL_API_MODEL
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

  const [primarySwell, secondarySwell, wind, tide] = await Promise.all([
    fetchSource<OpenMeteoMarineResponse>(primarySwellUrl, (data, error) =>
      sourceDebug("primary_swell", MARINE_ENDPOINT, OFFSHORE_POINT, data?.hourly, {
        model: PRIMARY_SWELL_MODEL,
        apiModel: PRIMARY_SWELL_MODEL,
        error
      })
    ),
    fetchSource<OpenMeteoMarineResponse>(secondarySwellUrl, (data, error) =>
      sourceDebug("secondary_swell", MARINE_ENDPOINT, OFFSHORE_POINT, data?.hourly, {
        model: SECONDARY_SWELL_MODEL,
        apiModel: SECONDARY_SWELL_API_MODEL,
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

  const primarySwellHourly = primarySwell.data?.hourly;
  const secondarySwellHourly = secondarySwell.data?.hourly;
  const windHourly = wind.data?.hourly;
  const primarySwellByTime = primarySwellHourly
    ? weatherIndexByTime(primarySwellHourly)
    : new Map<string, number>();
  const secondarySwellByTime = secondarySwellHourly
    ? weatherIndexByTime(secondarySwellHourly)
    : new Map<string, number>();
  const windByTime = windHourly ? weatherIndexByTime(windHourly) : new Map<string, number>();
  const times = sourceRows(
    primarySwellHourly,
    secondarySwellHourly,
    windHourly,
    tide.tideByTime,
    tide.tideEventsByTime
  );

  const rows = times
    .map((time) => {
      const primarySwellIndex = primarySwellByTime.get(time);
      const secondarySwellIndex = secondarySwellByTime.get(time);
      const windIndex = windByTime.get(time);
      const tideValue = tideValueForTime(tide.tideByTime, time);
      const tideEvent = tide.tideEventsByTime.get(time);
      const rankedPrimarySwell = rankedSwellRow(
        primarySwellHourly,
        primarySwellIndex
      );
      const rankedSecondarySwell = rankedSwellRow(
        secondarySwellHourly,
        secondarySwellIndex
      );

      return {
        time,
        waveHeight: waveHeightRow(primarySwellHourly, primarySwellIndex),
        waveEnergy: aggregateWaveEnergy(
          rankedPrimarySwell.primarySwell,
          rankedSecondarySwell.primarySwell,
          rankedPrimarySwell.tertiarySwell
        ),
        primarySwell: rankedPrimarySwell.primarySwell,
        secondarySwell: rankedSecondarySwell.primarySwell,
        tertiarySwell: rankedPrimarySwell.tertiarySwell,
        wind: windRow(windHourly, windIndex),
        tide: tideRow(tideValue, tideEvent)
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    activeSwellModel: `${PRIMARY_SWELL_MODEL} primary / ${SECONDARY_SWELL_MODEL} secondary`,
    currentTide: tide.currentTide,
    tideEvents: tide.tideEvents,
    debug: {
      sources: [primarySwell.debug, secondarySwell.debug, wind.debug, tide.debug]
    },
    rows
  };
}
