import { NextRequest } from 'next/server';
import { createFirestorePort } from '@/lib/firestore-port';
import { runTurn } from '@/agent/turn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * One chat turn as a server-sent event stream. Events mirror the agent's
 * activity: tool presses, text deltas, then the final message.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as { sessionId?: string; message?: string };
  const sessionId = body.sessionId?.slice(0, 64);
  const message = body.message?.slice(0, 4000);
  if (!sessionId || !message?.trim()) {
    return Response.json({ error: 'sessionId and message are required' }, { status: 400 });
  }

  const port = createFirestorePort();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const event of runTurn({ port, sessionId, message })) {
          send(event);
        }
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'unexpected failure',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
