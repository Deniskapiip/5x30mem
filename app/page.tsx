'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { YandexMap } from '@/components/YandexMap';
import { createController, listControllers, subscribeToControllers } from '@/features/controllers/api';
import {
  controllerStatuses,
  controllerTypes,
  type Controller,
  type ControllerInsert,
  type ControllerStatus,
  type ControllerType
} from '@/types/controller';

type DraftState = {
  title: string;
  description: string;
  type: ControllerType;
  status: ControllerStatus;
  lat: string;
  lng: string;
};

const defaultDraft: DraftState = {
  title: '',
  description: '',
  type: 'camera',
  status: 'online',
  lat: '',
  lng: ''
};

export default function HomePage() {
  const [controllers, setControllers] = useState<Controller[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ControllerStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ControllerType>('all');
  const [draft, setDraft] = useState<DraftState>(defaultDraft);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const data = await listControllers();
    setControllers(data);
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        await loadData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить метки');
      } finally {
        setLoading(false);
      }
    };

    void init();

    const unsubscribe = subscribeToControllers(() => {
      void loadData();
    });

    return unsubscribe;
  }, [loadData]);

  const filtered = useMemo(() => {
    return controllers.filter((item) => {
      const bySearch =
        search.length === 0 ||
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        item.description.toLowerCase().includes(search.toLowerCase());
      const byStatus = statusFilter === 'all' || item.status === statusFilter;
      const byType = typeFilter === 'all' || item.type === typeFilter;

      return bySearch && byStatus && byType;
    });
  }, [controllers, search, statusFilter, typeFilter]);

  const handleMapClick = useCallback((coords: { lat: number; lng: number }) => {
    setDraft((prev) => ({
      ...prev,
      lat: coords.lat.toFixed(6),
      lng: coords.lng.toFixed(6)
    }));
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const payload: ControllerInsert = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        type: draft.type,
        status: draft.status,
        lat: Number(draft.lat),
        lng: Number(draft.lng)
      };

      if (!payload.title || !payload.description || Number.isNaN(payload.lat) || Number.isNaN(payload.lng)) {
        throw new Error('Заполните все поля и укажите координаты');
      }

      await createController(payload);
      setDraft(defaultDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить метку');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Controllers Map</h1>
          <p className="text-sm text-slate-400">Общая карта контроллеров с realtime обновлениями</p>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-3 md:w-auto">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или описанию"
            className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | ControllerStatus)}
            className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
          >
            <option value="all">Все статусы</option>
            {controllerStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | ControllerType)}
            className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
          >
            <option value="all">Все типы</option>
            {controllerTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl bg-slate-950/50 p-2">
          {loading ? (
            <div className="flex h-[55vh] min-h-[420px] items-center justify-center rounded-2xl border border-border text-slate-400">
              Загрузка карты...
            </div>
          ) : (
            <YandexMap controllers={filtered} onMapClick={handleMapClick} />
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-slate-950/50 p-4">
          <h2 className="mb-3 text-lg font-medium">Добавить контроллер</h2>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <input
              value={draft.title}
              onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Название"
              className="w-full rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
            />
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Описание"
              rows={3}
              className="w-full rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={draft.type}
                onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value as ControllerType }))}
                className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
              >
                {controllerTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <select
                value={draft.status}
                onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value as ControllerStatus }))}
                className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
              >
                {controllerStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                value={draft.lat}
                onChange={(e) => setDraft((prev) => ({ ...prev, lat: e.target.value }))}
                placeholder="Широта"
                className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
              />
              <input
                value={draft.lng}
                onChange={(e) => setDraft((prev) => ({ ...prev, lng: e.target.value }))}
                placeholder="Долгота"
                className="rounded-xl border border-border bg-slate-900/70 px-3 py-2 text-sm"
              />
            </div>
            <p className="text-xs text-slate-400">Нажмите на карту, чтобы заполнить координаты автоматически.</p>
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {submitting ? 'Сохранение...' : 'Добавить метку'}
            </button>
          </form>
        </aside>
      </section>
    </main>
  );
}
