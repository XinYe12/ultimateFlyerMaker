const PREFIX = "ufm:draft";

export function draftKey(templateId: string, department: string) {
  return `${PREFIX}:${templateId}:${department}`;
}

export function saveDepartmentDraft(
  templateId: string,
  department: string,
  items: any[]
) {
  const payload = {
    department,
    items,
    updatedAt: Date.now(),
  };
  localStorage.setItem(draftKey(templateId, department), JSON.stringify(payload));
}

export function loadDepartmentDraft(
  templateId: string,
  department: string
): { department: string; items: any[]; updatedAt: number } | null {
  const raw = localStorage.getItem(draftKey(templateId, department));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearDepartmentDraft(
  templateId: string,
  department: string
) {
  localStorage.removeItem(draftKey(templateId, department));
}
