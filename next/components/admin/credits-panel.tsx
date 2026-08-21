"use client";

import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  getAdminCreditGroups,
  updateAdminCreditGroups,
} from "@/app/actions/admin-credits";
import {
  CREDIT_LIMITS,
  CREDIT_SOCIAL_PLATFORMS,
  type CreditGroup,
  type CreditSocialPlatform,
} from "@/lib/credits";

type DraftSocial = { platform: CreditSocialPlatform; url: string };
type DraftPerson = { name: string; description: string; socials: DraftSocial[] };
type DraftGroup = { title: string; people: DraftPerson[] };

const SOCIAL_LABELS: Record<CreditSocialPlatform, string> = {
  twitch: "Twitch",
  telegram: "Telegram",
  twitter: "Twitter / X",
  youtube: "YouTube",
};

const SOCIAL_PLACEHOLDERS: Record<CreditSocialPlatform, string> = {
  twitch: "https://twitch.tv/...",
  telegram: "https://t.me/...",
  twitter: "https://x.com/...",
  youtube: "https://youtube.com/@...",
};

function toDraft(groups: readonly CreditGroup[]): DraftGroup[] {
  return groups.map((group) => ({
    title: group.title,
    people: group.people.map((person) => ({
      name: person.name,
      description: person.description ?? "",
      socials: person.socials.map((social) => ({ ...social })),
    })),
  }));
}

export function CreditsPanel(): ReactElement {
  const router = useRouter();
  const [saved, setSaved] = useState<DraftGroup[] | null>(null);
  const [draft, setDraft] = useState<DraftGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const applyLoaded = useCallback(
    (result: Awaited<ReturnType<typeof getAdminCreditGroups>>): void => {
      if (result.ok) {
        const loaded = toDraft(result.data);
        setSaved(loaded);
        setDraft(loaded);
        setError("");
      } else {
        setError(result.message);
      }
      setLoading(false);
    },
    [],
  );

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    applyLoaded(await getAdminCreditGroups());
  }, [applyLoaded]);

  useEffect(() => {
    let active = true;
    void getAdminCreditGroups().then((result) => {
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

  const updateGroup = (groupIndex: number, patch: Partial<DraftGroup>): void => {
    setDraft((current) => current?.map((group, index) =>
      index === groupIndex ? { ...group, ...patch } : group,
    ) ?? current);
  };

  const updatePerson = (
    groupIndex: number,
    personIndex: number,
    patch: Partial<DraftPerson>,
  ): void => {
    setDraft((current) => current?.map((group, index) => index === groupIndex ? {
      ...group,
      people: group.people.map((person, innerIndex) =>
        innerIndex === personIndex ? { ...person, ...patch } : person,
      ),
    } : group) ?? current);
  };

  const updateSocial = (
    groupIndex: number,
    personIndex: number,
    platform: CreditSocialPlatform,
    url: string,
  ): void => {
    const group = draft?.[groupIndex];
    const person = group?.people[personIndex];
    if (!person) return;
    const existing = person.socials.find((social) => social.platform === platform);
    const socials = existing
      ? person.socials.map((social) => social.platform === platform ? { ...social, url } : social)
      : [...person.socials, { platform, url }];
    updatePerson(groupIndex, personIndex, { socials });
  };

  const addGroup = (): void => {
    setDraft((current) => current && current.length < CREDIT_LIMITS.groups
      ? [...current, { title: "Новая группа", people: [] }]
      : current);
  };

  const removeGroup = (groupIndex: number): void => {
    setDraft((current) => current?.filter((_, index) => index !== groupIndex) ?? current);
  };

  const addPerson = (groupIndex: number): void => {
    const group = draft?.[groupIndex];
    if (!group || group.people.length >= CREDIT_LIMITS.peoplePerGroup) return;
    updateGroup(groupIndex, {
      people: [...group.people, { name: "", description: "", socials: [] }],
    });
  };

  const removePerson = (groupIndex: number, personIndex: number): void => {
    const group = draft?.[groupIndex];
    if (!group) return;
    updateGroup(groupIndex, {
      people: group.people.filter((_, index) => index !== personIndex),
    });
  };

  const save = async (): Promise<void> => {
    if (!draft || !dirty) return;
    setSaving(true);
    const payload = draft.map((group) => ({
      title: group.title,
      people: group.people.map((person) => ({
        name: person.name,
        description: person.description,
        socials: person.socials.filter((social) => social.url.trim()),
      })),
    }));
    const result = await updateAdminCreditGroups(payload);
    if (result.ok) {
      const next = toDraft(result.data);
      setSaved(next);
      setDraft(next);
      toast.success("Авторы сохранены");
      router.refresh();
    } else {
      toast.error(result.message);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="pixel-text py-8 text-center text-white">Загрузка авторов...</div>;
  }

  if (error || !draft) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-red-400">{error || "Не удалось загрузить авторов."}</p>
        <button type="button" className="pixel-btn px-4 py-2" onClick={() => void reload()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="pixel-text text-xl font-bold text-white">Авторы</h2>
          <p className="mt-1 text-sm text-white/65">
            Группы и карточки из этого списка появляются в окне «Авторы» на главной.
          </p>
        </div>
        <button
          type="button"
          className="pixel-btn pixel-btn-info px-4 py-2"
          disabled={draft.length >= CREDIT_LIMITS.groups}
          onClick={addGroup}
        >
          + Группа
        </button>
      </div>

      {draft.length === 0 ? (
        <div className="border-2 border-dashed border-white/25 px-4 py-10 text-center text-sm text-white/55">
          Пока пусто. Создай первую группу — например, «Разработка» или «Музыка».
        </div>
      ) : (
        <div className="grid gap-5">
          {draft.map((group, groupIndex) => (
            <section key={groupIndex} className="border-2 border-black bg-zinc-800 p-4 shadow-[3px_3px_0_#000]">
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <label className="min-w-[14rem] flex-1">
                  <span className="mb-1 block text-xs font-bold uppercase text-white/70">Название группы</span>
                  <input
                    className="pixel-input w-full"
                    value={group.title}
                    maxLength={CREDIT_LIMITS.titleLength}
                    onChange={(event) => updateGroup(groupIndex, { title: event.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="pixel-btn pixel-btn-danger px-3 py-2 text-xs"
                  onClick={() => removeGroup(groupIndex)}
                >
                  Удалить группу
                </button>
              </div>

              <div className="grid gap-4">
                {group.people.map((person, personIndex) => (
                  <article key={personIndex} className="border-2 border-black bg-zinc-900/75 p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
                      <label>
                        <span className="mb-1 block text-xs font-bold uppercase text-white/70">Имя</span>
                        <input
                          className="pixel-input w-full"
                          value={person.name}
                          maxLength={CREDIT_LIMITS.nameLength}
                          placeholder="Ник или имя"
                          onChange={(event) => updatePerson(groupIndex, personIndex, { name: event.target.value })}
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-xs font-bold uppercase text-white/70">Роль / описание</span>
                        <input
                          className="pixel-input w-full"
                          value={person.description}
                          maxLength={CREDIT_LIMITS.descriptionLength}
                          placeholder="Разработчик, композитор…"
                          onChange={(event) => updatePerson(groupIndex, personIndex, { description: event.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="pixel-btn pixel-btn-danger self-end px-3 py-2 text-xs"
                        aria-label={`Удалить ${person.name || "автора"}`}
                        onClick={() => removePerson(groupIndex, personIndex)}
                      >
                        Удалить
                      </button>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {CREDIT_SOCIAL_PLATFORMS.map((platform) => (
                        <label key={platform}>
                          <span className="mb-1 block text-xs text-white/60">{SOCIAL_LABELS[platform]}</span>
                          <input
                            type="url"
                            className="pixel-input w-full"
                            value={person.socials.find((social) => social.platform === platform)?.url ?? ""}
                            maxLength={CREDIT_LIMITS.urlLength}
                            placeholder={SOCIAL_PLACEHOLDERS[platform]}
                            onChange={(event) => updateSocial(groupIndex, personIndex, platform, event.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
              </div>

              <button
                type="button"
                className="pixel-btn mt-4 px-4 py-2 text-xs"
                disabled={group.people.length >= CREDIT_LIMITS.peoplePerGroup}
                onClick={() => addPerson(groupIndex)}
              >
                + Автор
              </button>
            </section>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-black pt-4">
        {dirty ? (
          <button
            type="button"
            className="pixel-btn pixel-btn-danger px-4 py-2"
            disabled={saving}
            onClick={() => setDraft(saved ? toDraft(saved) : [])}
          >
            Отменить
          </button>
        ) : null}
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
