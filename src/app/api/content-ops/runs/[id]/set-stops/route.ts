import { CONFIGURABLE_STOPS, setStops, type ConfigurableStop } from '@/lib/content-ops/engine';
import { errorResponse, requireContentOpsAdmin } from '@/lib/content-ops/server-auth';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { userId } = await requireContentOpsAdmin();
    const body = (await req.json().catch(() => ({}))) as Partial<Record<ConfigurableStop, boolean>>;
    const input: Partial<Record<ConfigurableStop, boolean>> = {};
    for (const code of CONFIGURABLE_STOPS) {
      if (typeof body[code] === 'boolean') input[code] = body[code];
    }
    return Response.json(await setStops(userId, params.id, input));
  } catch (e) {
    return errorResponse(e);
  }
}
