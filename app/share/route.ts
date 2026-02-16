import { NextResponse } from "next/server";

export function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = `?v=${Date.now()}`;
  return NextResponse.redirect(url, { status: 307 });
}
