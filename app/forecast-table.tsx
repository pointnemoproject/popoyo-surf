"use client";

import { Fragment, useEffect, useState } from "react";
import type { SurfForecast } from "@/lib/forecast-types";

const SWELL_MODELS = [
  { label: "Best match", value: "best_match" },
  { label: "ECMWF WAM", value: "ecmwf_wam" },
  { label: "GFS Wave", value: "gfs_wave" },
  { label: "MeteoFrance MFWAM", value: "meteofrance_mfwam" }
] as const;

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

function formatSwell(
  height: number | null,
  period: number | null,
  direction: number | null
) {
  return `${formatHeight(height)} @ ${formatPeriod(period)} ${cardinalFromDegrees(
    direction
  )} ${formatDirectionDegrees(direction)}`;
}

function formatEnergy(value: number | null | undefined) {
  return typeof value === "number" ? `Energy ${Math.round(value)}` : null;
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
  const [swellModel, setSwellModel] = useState("best_match");

  useEffect(() => {
    let ignore = false;

    async function loadForecast() {
      try {
        const params = new URLSearchParams({ swellModel });
        const response = await fetch(`/api/forecast?${params.toString()}`);

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
  }, [swellModel]);

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
        <label className="model-selector">
          Swell model
          <select
            value={swellModel}
            onChange={(event) => setSwellModel(event.target.value)}
          >
            {SWELL_MODELS.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="forecast-debug">
        Active swell model: {forecast.activeSwellModel}
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
            {displayRows.map((row) => {
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
                      {formatEnergy(row.primarySwell.energy) ? (
                        <span>{formatEnergy(row.primarySwell.energy)}</span>
                      ) : null}
                    </td>
                    <td>
                      <strong>
                        {formatSwell(
                          row.secondarySwell.height,
                          row.secondarySwell.period,
                          row.secondarySwell.direction
                        )}
                      </strong>
                      {formatEnergy(row.secondarySwell.energy) ? (
                        <span>{formatEnergy(row.secondarySwell.energy)}</span>
                      ) : null}
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
                      <strong>{formatTide(row.tide?.seaLevelMsl)}</strong>
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
