import { NextResponse } from "next/server";
import {
  FORECAST_REVALIDATE_SECONDS,
  getForecast
} from "@/lib/forecast";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forecast = await getForecast({
    swellModel: searchParams.get("swellModel") ?? undefined
  });

  return NextResponse.json(forecast, {
    headers: {
      "Cache-Control": `public, s-maxage=${FORECAST_REVALIDATE_SECONDS}, stale-while-revalidate=300`
    }
  });
}
