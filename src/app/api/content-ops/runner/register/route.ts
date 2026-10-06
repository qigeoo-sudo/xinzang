import { registerRunner } from '@/lib/content-ops/engine';
import { errorResponse } from '@/lib/content-ops/server-auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = await registerRunner({
      registrationToken: String(body.registrationToken ?? ''),
      machineKey: String(body.machineKey ?? ''),
      name: String(body.name ?? 'windows-runner'),
      version: String(body.version ?? '0.0.0'),
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
