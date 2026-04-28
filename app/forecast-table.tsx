"use client";

import { Fragment, useEffect, useState } from "react";
import type { SurfForecast } from "@/lib/forecast-types";

function formatTime(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
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

function formatSwell(
  height: number | null,
  period: number | null,
  direction: number | null
) {
  return `${formatHeight(height)} @ ${formatPeriod(period)} ${cardinalFromDegrees(
    direction
  )} ${formatDirectionDegrees(direction)}`;
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
  return typeof value === "number"
    ? `${(value * 3.28084).toFixed(1)} ft`
    : "--";
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

  return (
    <>
      <div className="updated-pill">
        Updated {formatGeneratedAt(forecast.generatedAt)}
      </div>
      <div className="forecast-table-wrap">
        <table className="forecast-table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Primary Swell</th>
              <th scope="col">Secondary Swell</th>
              <th scope="col">Wind</th>
              <th scope="col">Tide</th>
            </tr>
          </thead>
          <tbody>
            {forecast.rows.map((row) => {
              const currentDay = dayKey(row.time);
              const showDay = currentDay !== previousDay;
              previousDay = currentDay;

              return (
                <Fragment key={row.time}>
                  {showDay ? (
                    <tr className="day-row" key={`${row.time}-day`}>
                      <th colSpan={5}>{formatDay(row.time)}</th>
                    </tr>
                  ) : null}
                  <tr>
                    <th scope="row">{formatTime(row.time)}</th>
                    <td>
                      <strong>
                        {formatSwell(
                          row.primarySwell.height,
                          row.primarySwell.period,
                          row.primarySwell.direction
                        )}
                      </strong>
                    </td>
                    <td>
                      <strong>
                        {formatSwell(
                          row.secondarySwell.height,
                          row.secondarySwell.period,
                          row.secondarySwell.direction
                        )}
                      </strong>
                    </td>
                    <td>
                      <strong>
                        {formatWind(
                          row.wind.speed,
                          row.wind.direction,
                          row.wind.gusts
                        )}
                      </strong>
                    </td>
                    <td>
                      <strong>{formatTide(row.tide.seaLevelMsl)}</strong>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
