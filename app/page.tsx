import {
  NEARSHORE_POINT,
  OFFSHORE_POINT
} from "@/lib/forecast-types";
import { ForecastTable } from "@/app/forecast-table";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="hero__inner">
          <div>
            <p className="eyebrow">Nicaragua Pacific</p>
            <h1>Ryan&apos;s Surf Report</h1>
            <p className="lede">
              A clean 16-day surf readout using offshore swell data and nearshore
              wind and tide signals.
            </p>
          </div>
          <div className="spot-meta" aria-label="Forecast points">
            <div>
              <span>Swell point</span>
              <strong>
                {OFFSHORE_POINT.latitude}, {OFFSHORE_POINT.longitude}
              </strong>
            </div>
            <div>
              <span>Wind/tide point</span>
              <strong>
                {NEARSHORE_POINT.latitude}, {NEARSHORE_POINT.longitude}
              </strong>
            </div>
            <div>
              <span>Data path</span>
              <strong>/api/forecast</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="forecast-shell" aria-label="16-day forecast">
        <div className="table-heading">
          <div>
            <p className="eyebrow">Hourly · 5AM–6PM</p>
            <h2>16-day forecast</h2>
          </div>
          <p>Server-fetched forecast data with cached API responses.</p>
        </div>

        <ForecastTable />
      </section>
    </main>
  );
}
