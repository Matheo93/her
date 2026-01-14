import { NextRequest, NextResponse } from 'next/server';

const DITTO_API = 'http://localhost:8005';

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');

  try {
    const response = await fetch(`${DITTO_API}/${targetPath}`);
    const data = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = path.join('/');

  try {
    const formData = await request.formData();

    const response = await fetch(`${DITTO_API}/${targetPath}`, {
      method: 'POST',
      body: formData,
    });

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('video')) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        headers: { 'Content-Type': 'video/mp4' },
      });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 503 });
  }
}
