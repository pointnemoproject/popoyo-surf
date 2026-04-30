import { NextResponse } from "next/server";
import {
  FORECAST_REVALIDATE_SECONDS,
  getForecast
} from "@/lib/forecast";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET() {
  const forecast = await getForecast();

  return NextResponse.json(forecast, {
    headers: {
      "Cache-Control": `public, s-maxage=${FORECAST_REVALIDATE_SECONDS}, stale-while-revalidate=300`
    }
  });
}
