// © 2026 P&P Group. Proprietary & Confidential.
// HR-Modul — gemeinsame Helfer der Submodule (Rollen, Session-Zugriff).

// ALTBESTAND (16.08.2026): Guards laufen über die Rechte-Matrix (manage_hr /
// view_hr_reports). Nicht für neue Routen verwenden.
export const WRITE_ROLES   = ["admin", "manager", "makler"];
export const APPROVE_ROLES = ["admin", "manager"];

export function cid(req: any): number { const id = req.session?.companyId; if (!id) throw Object.assign(new Error("Nicht angemeldet"), { status: 401 }); return id; }
export function uid(req: any): number { return req.session?.userId ?? 0; }
