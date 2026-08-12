/**
 * Atamura Group residential complexes (ЖК).
 * Leads carry `name` in the string field UF_CRM_COMPLEX (the field other lead
 * channels populate). `bitrixProjectId` is the enum item id of the DEAL field
 * UF_CRM_1758630528 («Проект - встреча») — that field does not exist on leads,
 * the id is kept for a future lead→deal flow.
 */
export interface Project {
  slug: string;
  name: string;
  bitrixProjectId?: string;
}

export const PROJECTS: ReadonlyArray<Project> = [
  { slug: "atmosfera", name: "Атмосфера", bitrixProjectId: "1962" },
  { slug: "keruen", name: "Керуен", bitrixProjectId: "1964" },
  { slug: "aqsai", name: "Аксай Резорт", bitrixProjectId: "1966" },
  { slug: "aura", name: "Аура", bitrixProjectId: "1968" },
  { slug: "arlan", name: "Арлан", bitrixProjectId: "3676" },
  { slug: "bravo", name: "Браво" },
  { slug: "monarch", name: "Монарх" },
  { slug: "discovery", name: "Дискавери" },
  { slug: "amaya", name: "Амайя" },
  { slug: "olimpik", name: "Олимпик" },
];

const BY_SLUG: ReadonlyMap<string, Project> = new Map(
  PROJECTS.map((p) => [p.slug, p]),
);

export function findProject(slug: unknown): Project | undefined {
  if (typeof slug !== "string" || !slug) return undefined;
  return BY_SLUG.get(slug.toLowerCase());
}
