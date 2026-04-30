"use client";

import { Fragment, useEffect, useState, type CSSProperties } from "react";
import type { SurfForecast } from "@/lib/forecast-types";

const DISPLAY_START_HOUR = 5;
const DISPLAY_END_HOUR = 18;

function localParts(value: string) {
  const [date, time = "00:00"] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return { year, month, day, hour, minute };
}

function formatTime(value: string) {
  const { hour, minute } = localParts(value);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDay(value: string) {
  const { year, month, day } = localParts(value);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(new Date(year, month - 1, day));
}

function dayKey(value: string) {
  return value.slice(0, 10);
}

function isSurfHour(value: string) {
  const { hour } = localParts(value);

  return hour >= DISPLAY_START_HOUR && hour <= DISPLAY_END_HOUR;
}

function formatHeight(value: number | null | undefined) {
  return typeof value === "number" ? `${value.toFixed(1)}ft` : "--";
}

function formatPeriod(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)}s` : "--";
}

function cardinalFromDegrees(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "--";
  }

  const labels = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW"
  ];
  const index = Math.round(((value % 360) / 22.5)) % 16;

  return labels[index];
}

function formatDirectionDegrees(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)}°` : "--";
}

function formatWaveEnergy(value: number | null | undefined) {
  return typeof value === "number" ? Math.round(value).toString() : "--";
}

function formatWindSpeed(value: number | null | undefined) {
  return typeof value === "number" ? `${Math.round(value)}kt` : "--";
}

function formatWind(
  speed: number | null,
  direction: number | null,
  gusts: number | null
) {
  const wind = `${cardinalFromDegrees(direction)} ${formatWindSpeed(speed)}`;

  return typeof gusts === "number" ? `${wind} gust ${Math.round(gusts)}` : wind;
}

function formatTide(value: number | null | undefined) {
  return typeof value === "number" && value >= 0
    ? `${(value * 3.28084).toFixed(1)} ft`
    : "—";
}

function formatTideEvent(value: SurfForecast["rows"][number]["tide"]) {
  if (!value?.event) {
    return formatTide(value?.seaLevelMsl);
  }

  const label = value.event.type === "high" ? "High" : "Low";

  return `${label} ${formatTime(value.event.time)} ${formatTide(value.event.height)}`;
}

function formatGeneratedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Managua"
  }).format(new Date(value));
}

function formatTidePanelTime(value: string) {
  const { hour, minute } = localParts(value);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}${minute ? `:${String(minute).padStart(2, "0")}` : ""}${suffix}`;
}

function DirectionArrow({
  degrees,
  tone = "swell"
}: {
  degrees: number | null | undefined;
  tone?: "swell" | "wind";
}) {
  if (typeof degrees !== "number") {
    return <span className="direction-arrow direction-arrow--empty">-</span>;
  }

  const headingDegrees = tone === "swell" ? (degrees + 180) % 360 : degrees;

  return (
    <span
      className={`direction-arrow direction-arrow--${tone}`}
      style={{ "--direction": `${headingDegrees - 90}deg` } as CSSProperties}
      aria-hidden="true"
    >
      →
    </span>
  );
}

function SwellCell({
  height,
  period,
  direction
}: {
  height: number | null;
  period: number | null;
  direction: number | null;
}) {
  return (
    <>
      <div className="metric-line">
        <DirectionArrow degrees={direction} />
        <strong>
          {formatHeight(height)} @ {formatPeriod(period)}
        </strong>
      </div>
      <span>
        {cardinalFromDegrees(direction)} {formatDirectionDegrees(direction)}
      </span>
    </>
  );
}

function WindCell({
  speed,
  direction,
  gusts
}: {
  speed: number | null;
  direction: number | null;
  gusts: number | null;
}) {
  return (
    <div className="metric-line">
      <DirectionArrow degrees={direction} tone="wind" />
      <strong>{formatWind(speed, direction, gusts)}</strong>
    </div>
  );
}

function tideEventFeet(event: SurfForecast["tideEvents"][number]) {
  return typeof event.height === "number" && event.height >= 0
    ? event.height * 3.28084
    : null;
}

function tideEventTimeValue(event: SurfForecast["tideEvents"][number]) {
  return new Date(`${event.time}:00-06:00`).getTime();
}

function buildTideCurve(events: SurfForecast["tideEvents"]) {
  const plotted = events
    .map((event) => ({
      event,
      feet: tideEventFeet(event),
      time: tideEventTimeValue(event)
    }))
    .filter(
      (point): point is {
        event: SurfForecast["tideEvents"][number];
        feet: number;
        time: number;
      } => typeof point.feet === "number" && Number.isFinite(point.time)
    )
    .sort((a, b) => a.time - b.time)
    .slice(0, 12);

  if (plotted.length < 2) {
    return null;
  }

  const width = 300;
  const height = 150;
  const padX = 14;
  const padY = 18;
  const minTime = plotted[0].time;
  const maxTime = plotted.at(-1)?.time ?? minTime + 1;
  const minFeet = Math.min(...plotted.map((point) => point.feet));
  const maxFeet = Math.max(...plotted.map((point) => point.feet));
  const feetRange = Math.max(maxFeet - minFeet, 1);
  const timeRange = Math.max(maxTime - minTime, 1);
  const points = plotted.map((point) => {
    const x = padX + ((point.time - minTime) / timeRange) * (width - padX * 2);
    const y =
      height - padY - ((point.feet - minFeet) / feetRange) * (height - padY * 2);

    return { ...point, x, y };
  });
  const linePath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    }

    const previous = points[index - 1];
    const midX = (previous.x + point.x) / 2;

    return `${path} C ${midX.toFixed(1)} ${previous.y.toFixed(1)}, ${midX.toFixed(
      1
    )} ${point.y.toFixed(1)}, ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }, "");
  const first = points[0];
  const last = points.at(-1) ?? first;
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${(
    height - padY
  ).toFixed(1)} L ${first.x.toFixed(1)} ${(height - padY).toFixed(1)} Z`;

  return {
    areaPath,
    linePath,
    maxFeet,
    minFeet,
    points,
    viewBox: `0 0 ${width} ${height}`
  };
}

function TidePanel({ forecast }: { forecast: SurfForecast }) {
  const curve = buildTideCurve(forecast.tideEvents);

  return (
    <aside className="tide-panel" aria-label="Tide graph">
      <div className="tide-panel__header">
        <span>Tide curve</span>
        <strong>{curve ? "Next extremes" : "Unavailable"}</strong>
      </div>
      {curve ? (
        <>
          <svg
            className="tide-curve"
            viewBox={curve.viewBox}
            role="img"
            aria-label="Upcoming tide highs and lows"
          >
            <defs>
              <linearGradient id="tide-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(8, 145, 178, 0.3)" />
                <stop offset="100%" stopColor="rgba(8, 145, 178, 0.03)" />
              </linearGradient>
            </defs>
            <path d={curve.areaPath} fill="url(#tide-fill)" />
            <path d={curve.linePath} className="tide-curve__line" />
            {curve.points.map((point) => (
              <g key={`${point.event.type}-${point.event.time}`}>
                <circle cx={point.x} cy={point.y} r="3.5" />
              </g>
            ))}
          </svg>
          <div className="tide-panel__range">
            <span>{curve.minFeet.toFixed(1)} ft</span>
            <span>{curve.maxFeet.toFixed(1)} ft</span>
          </div>
          <div className="tide-events">
            {curve.points.slice(0, 6).map((point) => (
              <div key={`${point.event.type}-label-${point.event.time}`}>
                <span>{point.event.type === "high" ? "High" : "Low"}</span>
                <strong>
                  {formatTidePanelTime(point.event.time)} · {point.feet.toFixed(1)} ft
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p>Tide extremes are unavailable right now.</p>
      )}
    </aside>
  );
}

export function ForecastTable() {
  const [forecast, setForecast] = useState<SurfForecast | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadForecast() {
      try {
        const response = await fetch("/api/forecast");

        if (!response.ok) {
          throw new Error("Forecast request failed");
        }

        const data = (await response.json()) as SurfForecast;

        if (!ignore) {
          setForecast(data);
        }
      } catch {
        if (!ignore) {
          setError("Forecast data is unavailable right now.");
        }
      }
    }

    loadForecast();

    return () => {
      ignore = true;
    };
  }, []);

  if (error) {
    return <div className="forecast-state">{error}</div>;
  }

  if (!forecast) {
    return <div className="forecast-state">Loading forecast...</div>;
  }

  let previousDay = "";
  const displayRows = forecast.rows.filter((row) => isSurfHour(row.time));

  return (
    <>
      <div className="updated-pill">
        Updated {formatGeneratedAt(forecast.generatedAt)}
        {forecast.currentTide ? (
          <span>Current tide: {formatTide(forecast.currentTide.seaLevelMsl)}</span>
        ) : null}
      </div>
      <div className="forecast-debug">
        Primary: best match · Secondary: GFS Wave
      </div>
      <div className="forecast-layout">
        <div className="forecast-table-wrap">
          <table className="forecast-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Wave Height</th>
                <th scope="col">Primary Swell</th>
                <th scope="col">Secondary Swell</th>
                <th scope="col">Tertiary Swell</th>
                <th scope="col">Wind</th>
                <th scope="col">Energy</th>
                <th scope="col">Tide</th>
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => {
                const currentDay = dayKey(row.time);
                const showDay = currentDay !== previousDay;
                previousDay = currentDay;

                return (
                  <Fragment key={row.time}>
                    {showDay ? (
                      <tr className="day-row" key={`${row.time}-day`}>
                        <th colSpan={8}>{formatDay(row.time)}</th>
                      </tr>
                    ) : null}
                    <tr>
                      <th scope="row">{formatTime(row.time)}</th>
                      <td>
                        <strong>{formatHeight(row.waveHeight)}</strong>
                      </td>
                      <td>
                        <SwellCell
                          height={row.primarySwell.height}
                          period={row.primarySwell.period}
                          direction={row.primarySwell.direction}
                        />
                      </td>
                      <td>
                        <SwellCell
                          height={row.secondarySwell.height}
                          period={row.secondarySwell.period}
                          direction={row.secondarySwell.direction}
                        />
                      </td>
                      <td>
                        <SwellCell
                          height={row.tertiarySwell.height}
                          period={row.tertiarySwell.period}
                          direction={row.tertiarySwell.direction}
                        />
                      </td>
                      <td>
                        <WindCell
                          speed={row.wind.speed}
                          direction={row.wind.direction}
                          gusts={row.wind.gusts}
                        />
                      </td>
                      <td>
                        <strong>{formatWaveEnergy(row.waveEnergy)}</strong>
                      </td>
                      <td>
                        <strong>{formatTideEvent(row.tide)}</strong>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <TidePanel forecast={forecast} />
      </div>
    </>
  );
}
