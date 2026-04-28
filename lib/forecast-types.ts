export const FORECAST_REVALIDATE_SECONDS = 60 * 60;

export const OFFSHORE_POINT = {
  latitude: 11.199031,
  longitude: -86.30816
} as const;

export const NEARSHORE_POINT = {
  latitude: 11.4206,
  longitude: -86.114187
} as const;

export type NullableNumber = number | null;

export type ForecastRow = {
  time: string;
  primarySwell: {
    height: NullableNumber;
    period: NullableNumber;
    peakPeriod: NullableNumber;
    direction: NullableNumber;
    energy: NullableNumber;
  };
  secondarySwell: {
    height: NullableNumber;
    period: NullableNumber;
    peakPeriod: NullableNumber;
    direction: NullableNumber;
    energy: NullableNumber;
  };
  wind: {
    speed: NullableNumber;
    gusts: NullableNumber;
    direction: NullableNumber;
  };
  tide: {
    seaLevelMsl: NullableNumber;
  };
};

export type SurfForecast = {
  generatedAt: string;
  rows: ForecastRow[];
};
