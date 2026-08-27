'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PanelState {
  household?: { name: string; weeklyBudget: number };
  pantry?: {
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unit: string;
      location: 'fridge' | 'freezer' | 'pantry';
      expiresInDays?: number;
    }>;
  };
  plan?: {
    meals: Array<{ day: string; title: string; pinned: boolean; note?: string }>;
  } | null;
  groceryList?: {
    lines: Array<{
      name: string;
      quantity: number;
      unit: string;
      bestPrice?: { store: string; price: number };
    }>;
  } | null;
  error?: string;
}

interface ChatItem {
  role: 'user' | 'assistant';
  text: string;
  tools: string[];
  status?: string;
  pending?: boolean;
}

const LOCATIONS: Array<'fridge' | 'freezer' | 'pantry'> = ['fridge', 'freezer', 'pantry'];

export default function DemoPage() {
  const [sessionId] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `s-${Date.now()}`,
  );
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<PanelState>({});
  const feedRef = useRef<HTMLDivElement>(null);

  const refreshPanel = useCallback(async () => {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      setPanel((await response.json()) as PanelState);
    } catch {
      setPanel({ error: 'state unavailable' });
    }
  }, []);

  useEffect(() => {
    void refreshPanel();
  }, [refreshPanel]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [items]);

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput('');
    setBusy(true);
    setItems((previous) => [
      ...previous,
      { role: 'user', text: message, tools: [] },
      { role: 'assistant', text: '', tools: [], pending: true },
    ]);

    const patchLast = (patch: (item: ChatItem) => ChatItem) =>
      setItems((previous) => {
        const next = [...previous];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = patch(last);
        return next;
      });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message }),
      });
      if (!response.ok || !response.body) {
        throw new Error(`chat failed (${response.status})`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamed = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith('data:')) continue;
          const event = JSON.parse(line.slice(5)) as {
            type: string;
            name?: string;
            delta?: string;
            text?: string;
            label?: string;
            message?: string;
          };
          if (event.type === 'tool' && event.name) {
            patchLast((item) => ({ ...item, tools: [...item.tools, event.name as string] }));
          } else if (event.type === 'text' && event.delta) {
            streamed += event.delta;
            const text = streamed;
            patchLast((item) => ({ ...item, text }));
          } else if (event.type === 'status' && event.label) {
            patchLast((item) => ({ ...item, status: event.label }));
          } else if (event.type === 'final' && event.text) {
            const text = event.text;
            patchLast((item) => ({ ...item, text, status: undefined, pending: false }));
          } else if (event.type === 'error') {
            const text = `Something failed: ${event.message ?? 'unknown'}`;
            patchLast((item) => ({ ...item, text, pending: false }));
          }
        }
      }
    } catch (error) {
      const text =
        error instanceof Error ? `Something failed: ${error.message}` : 'Something failed.';
      patchLast((item) => ({ ...item, text, pending: false }));
    } finally {
      patchLast((item) => ({ ...item, pending: false }));
      setBusy(false);
      void refreshPanel();
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-6xl flex-col px-4 py-4">
      <header className="flex items-baseline justify-between border-b border-stone-200 pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-amber-900">Amalthea</h1>
          <p className="text-sm text-stone-500">interviews first, plans second</p>
        </div>
        {panel.household && (
          <p className="text-sm font-medium text-stone-600">
            {panel.household.name} · ${panel.household.weeklyBudget}/week
          </p>
        )}
      </header>

      <div className="flex min-h-0 flex-1 gap-4 pt-4">
        <section className="flex min-h-0 flex-[2] flex-col">
          <div ref={feedRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {items.length === 0 && (
              <div className="mt-16 text-center text-stone-400">
                <p className="text-lg">
                  Say hello and ask for a week of dinners. Amalthea asks before it plans.
                </p>
              </div>
            )}
            {items.map((item, index) => (
              <div
                key={index}
                className={item.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={
                    item.role === 'user'
                      ? 'max-w-[80%] rounded-2xl rounded-br-sm bg-amber-700 px-4 py-2.5 text-white'
                      : 'max-w-[85%] rounded-2xl rounded-bl-sm border border-stone-200 bg-white px-4 py-2.5 text-stone-800 shadow-sm'
                  }
                >
                  {item.tools.length > 0 && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {item.tools.map((tool, toolIndex) => (
                        <span
                          key={toolIndex}
                          className="rounded-full bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-600"
                        >
                          ⚙ {tool}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.text ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>
                  ) : item.pending ? (
                    <p className="animate-pulse text-stone-400">…</p>
                  ) : null}
                  {item.status && (
                    <p className="mt-1 text-xs italic text-stone-400">{item.status}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Plan my week, swap a meal, pin a favorite…"
              className="flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-800 outline-none focus:border-amber-600"
            />
            <button
              type="submit"
              disabled={busy || input.trim() === ''}
              className="rounded-xl bg-amber-700 px-5 py-3 font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </section>

        <aside className="hidden min-h-0 flex-1 flex-col gap-4 overflow-y-auto md:flex">
          <PanelCard title="Pantry">
            {panel.pantry ? (
              LOCATIONS.map((location) => {
                const rows = panel.pantry?.items.filter((item) => item.location === location) ?? [];
                if (rows.length === 0) return null;
                return (
                  <div key={location} className="mb-2">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                      {location}
                    </p>
                    <ul className="space-y-0.5">
                      {rows.map((item) => (
                        <li key={item.id} className="flex justify-between text-[13px]">
                          <span className="text-stone-700">{item.name}</span>
                          <span className="text-stone-400">
                            {item.quantity} {item.unit}
                            {item.expiresInDays !== undefined && item.expiresInDays <= 5 && (
                              <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                                {item.expiresInDays}d left
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-stone-400">{panel.error ?? 'loading…'}</p>
            )}
          </PanelCard>

          {panel.plan && (
            <PanelCard title="This week">
              <ul className="space-y-1">
                {panel.plan.meals.map((meal) => (
                  <li key={meal.day} className="text-[13px]">
                    <div className="flex justify-between gap-2">
                      <span className="w-9 shrink-0 uppercase text-stone-400">
                        {meal.day.slice(0, 3)}
                      </span>
                      <span className="flex-1 text-stone-700">
                        {meal.pinned ? '📌 ' : ''}
                        {meal.title}
                      </span>
                    </div>
                    {meal.note && (
                      <p className="pl-11 text-[11px] italic text-stone-400">{meal.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </PanelCard>
          )}

          {panel.groceryList && 'lines' in (panel.groceryList ?? {}) && (
            <PanelCard title="Grocery list · plan minus pantry">
              <ul className="space-y-0.5">
                {panel.groceryList.lines.map((line, lineIndex) => (
                  <li key={lineIndex} className="flex justify-between text-[13px]">
                    <span className="text-stone-700">
                      {line.name}
                      <span className="text-stone-400">
                        {' '}
                        · {line.quantity} {line.unit}
                      </span>
                    </span>
                    {line.bestPrice && (
                      <span className="text-emerald-700">
                        ${line.bestPrice.price.toFixed(2)} at {line.bestPrice.store}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </PanelCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function PanelCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-stone-700">{title}</h2>
      {children}
    </div>
  );
}
