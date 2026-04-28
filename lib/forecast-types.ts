export const FORECAST_REVALIDATE_SECONDS = 60 * 60;

export const OFFSHORE_POINT = {
  latitude: 11.363528,
  longitude: -86.161333
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
  };
  secondarySwell: {
    height: NullableNumber;
    period: NullableNumber;
    direction: NullableNumber;
  };
  wind: {
    speed: NullableNumber;
    gusts: NullableNumber;
    direction: NullableNumber;
  };
};

export type SurfForecast = {
  generatedAt: string;
  currentTide: {
    seaLevelMsl: NullableNumber;
    unit: "ft";
  };
  rows: ForecastRow[];
};
