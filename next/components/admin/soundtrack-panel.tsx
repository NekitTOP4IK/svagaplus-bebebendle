"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAdminSoundtrackMetadata,
  updateAdminSoundtrackMetadata,
} from "@/app/actions/admin-soundtrack";
import {
  SOUNDTRACK_FIELD_MAX_LENGTH,
  SOUNDTRACK_SLOTS,
  type SoundtrackMetadata,
  type SoundtrackSlotId,
} from "@/lib/audio/soundtrack-metadata";

export function SoundtrackPanel(): React.ReactElement {
  const router = useRouter();
  const [saved, setSaved] = useState<SoundtrackMetadata | null>(null);
  const [draft, setDraft] = useState<SoundtrackMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const applyLoaded = useCallback((result: Awaited<ReturnType<typeof getAdminSoundtrackMetadata>>): void => {
    if (result.ok) {
      setSaved(result.data);
      setDraft(result.data);
      setError("");
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, []);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    const result = await getAdminSoundtrackMetadata();
    applyLoaded(result);
  }, [applyLoaded]);

  useEffect(() => {
    let active = true;
    void getAdminSoundtrackMetadata().then((result) => {
      if (active) applyLoaded(result);
    });
    return () => {
      active = false;
    };
  }, [applyLoaded]);

  const dirty = useMemo(
    () => saved !== null && draft !== null && JSON.stringify(saved) !== JSON.stringify(draft),
    [draft, saved],
  );

  const updateField = (
    id: SoundtrackSlotId,
    field: "title" | "artist",
    value: string,
  ): void => {
    setDraft((current) => current ? {
      ...current,
      [id]: { ...current[id], [field]: value },
    } : current);
  };

  const save = async (): Promise<void> => {
    if (!draft || !dirty) return;
    setSaving(true);
    const result = await updateAdminSoundtrackMetadata(draft);
    if (result.ok) {
      setSaved(result.data);
      setDraft(result.data);
      toast.success("Метаданные саундтрека сохранены");
      router.refresh();
    } else {
      toast.error(result.message);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="pixel-text py-8 text-center text-white">Загрузка саундтрека...</div>;
  }

  if (error || !draft) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-red-400">{error || "Не удалось загрузить метаданные."}</p>
        <button type="button" className="pixel-btn px-4 py-2" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pixel-text text-xl font-bold text-white">Саундтрек</h2>
        <p className="mt-1 text-sm text-white/65">
          Названия и авторы отображаются в плеере. Аудиофайлы и назначение сцен здесь не меняются.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {SOUNDTRACK_SLOTS.map(({ id, label, fileName }) => (
          <section key={id} className="border-2 border-black bg-zinc-800 p-4 shadow-[3px_3px_0_#000]">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="pixel-text font-bold text-yellow-300">{label}</h3>
              <span className="font-mono text-xs text-white/45">{fileName}.ogg / .mp3</span>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase text-white/70">Название</span>
              <input
                className="pixel-input w-full"
                value={draft[id].title}
                maxLength={SOUNDTRACK_FIELD_MAX_LENGTH}
                onChange={(event) => updateField(id, "title", event.target.value)}
                placeholder="Название трека"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-bold uppercase text-white/70">Автор</span>
              <input
                className="pixel-input w-full"
                value={draft[id].artist}
                maxLength={SOUNDTRACK_FIELD_MAX_LENGTH}
                onChange={(event) => updateField(id, "artist", event.target.value)}
                placeholder="Можно добавить позже"
              />
            </label>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-black pt-4">
        {dirty && (
          <button
            type="button"
            className="pixel-btn pixel-btn-danger px-4 py-2"
            disabled={saving}
            onClick={() => setDraft(saved)}
          >
            Отменить
          </button>
        )}
        <button
          type="button"
          className="pixel-btn pixel-btn-ok px-4 py-2"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Сохраняю..." : "Сохранить"}
        </button>
      </div>
    </div>
  );
}
