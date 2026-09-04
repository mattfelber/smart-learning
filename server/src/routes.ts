import { Router } from 'express';
import type { Request, Response } from 'express';
import { Tutor } from './tutor/orchestrator.js';
import { Store } from './persistence/store.js';

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    });
  };
}

export function createRoutes(tutor: Tutor, store: Store, configured: boolean, configError?: string) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, configured });
  });

  router.post(
    '/new-topic',
    asyncHandler(async (req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const { goal } = req.body;
      if (!goal || typeof goal !== 'string') {
        res.status(400).json({ error: 'goal is required' });
        return;
      }
      const result = await tutor.startTopic(goal);
      res.json(result);
    })
  );

  router.post(
    '/chat',
    asyncHandler(async (req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const { sessionId, message } = req.body;
      if (!sessionId || typeof message !== 'string') {
        res.status(400).json({ error: 'sessionId and message are required' });
        return;
      }
      const result = await tutor.continueSession(sessionId, message);
      res.json(result);
    })
  );

  router.get(
    '/resume',
    asyncHandler(async (_req, res) => {
      const sessions = store.listSessions();
      const unfinished = sessions
        .filter((s) => s.mode !== 'DONE')
        .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

      if (!unfinished.length) {
        res.json({ available: false });
        return;
      }

      const session = store.loadSession(unfinished[0].id);
      res.json({ available: true, session });
    })
  );

  router.post(
    '/resume',
    asyncHandler(async (_req, res) => {
      if (!configured) {
        res.json({
          message: configError ?? 'Gemini is not configured.',
          needsConfig: true
        });
        return;
      }
      const result = await tutor.resume();
      res.json(result ? { ...result, available: true } : { available: false });
    })
  );

  router.post(
    '/end',
    asyncHandler(async (req, res) => {
      const { sessionId } = req.body;
      if (!sessionId) {
        res.status(400).json({ error: 'sessionId is required' });
        return;
      }
      const note = await tutor.endSession(sessionId);
      res.json({ note });
    })
  );

  router.get(
    '/sessions',
    asyncHandler(async (_req, res) => {
      res.json(store.listSessions());
    })
  );

  return router;
}
