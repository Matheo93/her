import { NextResponse } from 'next/server';

const DITTO_API = 'http://localhost:8005';

export async function GET() {
  try {
    const response = await fetch(`${DITTO_API}/health`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: 'error', sdk_ready: false }, { status: 503 });
  }
}
