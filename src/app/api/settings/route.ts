import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { errorMessage } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ ok: true, settings: await getStore().getSettings() });
  } catch (error) {
    return NextResponse.json({ ok: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { automationEnabled?: boolean };
    const store = getStore();
    const current = await store.getSettings();
    const next = {
      ...current,
      automationEnabled:
        typeof body.automationEnabled === 'boolean'
          ? body.automationEnabled
          : current.automationEnabled,
      updatedAt: new Date().toISOString(),
    };
    await store.saveSettings(next);
    return NextResponse.json({ ok: true, settings: next });
  } catch (error) {
    return NextResponse.json({ ok: false, message: errorMessage(error) }, { status: 500 });
  }
}
