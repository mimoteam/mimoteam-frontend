import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/PartnerProfile.css";

import { toAbsoluteUrl } from "../api/http";
import { getCurrentUser, saveStoredUser } from "../api/auth";
import { updateUser, uploadAvatar, deleteAvatar, getMe, getUserById } from "../api/users";

/* ================= Helpers ================= */
const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>" +
  "<rect width='64' height='64' rx='12' ry='12' fill='%23E2E8F0'/>" +
  "<circle cx='32' cy='24' r='12' fill='%2394A3B8'/>" +
  "<path d='M10 56a22 22 0 0144 0' fill='%2394A3B8'/></svg>";

const CURRENT_USER_KEY = "current_user_v1";

function toTitle(s) {
  const str = String(s || "");
  const lower = str.toLocaleLowerCase();
  return lower.replace(/(^|[\s\-\/\.])([\p{L}])/gu, (_, sep, chr) => sep + chr.toLocaleUpperCase());
}
function initialsFrom(name) {
  const n = String(name || "").trim();
  if (!n) return "U";
  const parts = n.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase()).join("");
}
function absolutize(u) {
  const abs = toAbsoluteUrl?.(u || "");
  return abs || "";
}

/** ---------- Datas (string-only, sem UTC) ---------- */
/** aceita ISO, YYYY-MM-DD ou MM/DD/YYYY e retorna YYYY-MM-DD */
function parseAnyToYMD(v) {
  if (!v) return "";
  const s = String(v).trim();

  // ISO-like: pega os 10 primeiros caracteres
  const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) return `${mIso[1]}-${mIso[2]}-${mIso[3]}`;

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, "0");
    const dd = mdy[2].padStart(2, "0");
    const yy = mdy[3];
    return `${yy}-${mm}-${dd}`;
  }

  // YYYYMMDD ou MMDDYYYY
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length === 8) {
    const asYMD = digits.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (asYMD) return `${asYMD[1]}-${asYMD[2]}-${asYMD[3]}`;
    const asMDY = digits.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (asMDY) return `${asMDY[3]}-${asMDY[1]}-${asMDY[2]}`;
  }

  // já está Y-M-D
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  return "";
}

/** YYYY-MM-DD -> MM/DD/YYYY */
function ymdToMDY(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd || "")) return "";
  const [y, m, d] = String(ymd).split("-");
  return `${m}/${d}/${y}`;
}

/** MM/DD/YYYY -> YYYY-MM-DD */
function mdyToYMD(mdy) {
  const m = String(mdy || "").match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return "";
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  const yy = m[3];
  return `${yy}-${mm}-${dd}`;
}

/** máscara leve para MM/DD/YYYY */
function maskMDY(input) {
  const digits = String(input || "").replace(/[^\d]/g, "").slice(0, 8);
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yy = digits.slice(4, 8);
  if (digits.length <= 2) return mm;
  if (digits.length <= 4) return `${mm}/${dd}`;
  return `${mm}/${dd}/${yy}`;
}

/** valida MM/DD/YYYY (com checagem de calendário) */
function isValidMDY(mdy) {
  const m = String(mdy || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return false;
  const mm = +m[1], dd = +m[2], yy = +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const monthLengths = [31, (yy % 4 === 0 && (yy % 100 !== 0 || yy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dd <= monthLengths[mm - 1];
}

/* ================ Componente ================= */
export default function PartnerProfile({ currentUser: propUser, onUserUpdate }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const userId = user?._id || user?.id || propUser?._id || propUser?.id || "";

  // avatar
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");

  // datas (MM/DD/YYYY)
  const [dob, setDob] = useState("");
  const [hire, setHire] = useState("");
  const [initialDob, setInitialDob] = useState("");
  const [initialHire, setInitialHire] = useState("");

  const stopBubble = (e) => e.stopPropagation();

  // ======== Boot de dados ========
  useEffect(() => {
    let alive = true;

    async function boot() {
      try {
        // base: propUser -> /auth/me -> localStorage
        let base = propUser || (await getCurrentUser().catch(() => null));
        if (!base) {
          try { base = JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null"); } catch {}
        }

        const normalized = {
          ...(base || {}),
          avatarUrl: absolutize(base?.avatarUrl || base?.photoUrl || base?.imageUrl || ""),
        };
        if (!alive) return;

        setUser(normalized || {});
        setAvatarUrl(normalized?.avatarUrl || "");

        // derivar datas
        let ymdDOB =
          normalized?.birthdayYMD ||
          parseAnyToYMD(normalized?.birthday || normalized?.dob || "");
        let ymdHIRE =
          normalized?.hireDateYMD ||
          normalized?.startDateYMD ||
          normalized?.companyStartDateYMD ||
          parseAnyToYMD(
            normalized?.hireDate || normalized?.startDate || normalized?.companyStartDate || ""
          );

        // fetch completo se faltar algo
        if ((!ymdDOB || !ymdHIRE) && (normalized?._id || normalized?.id)) {
          try {
            const fresh =
              (await getMe().catch(() => null)) ||
              (await getUserById(normalized._id || normalized.id).catch(() => null));
            if (fresh) {
              const merged = { ...normalized, ...fresh };
              if (alive) setUser(merged);

              ymdDOB =
                merged?.birthdayYMD ||
                parseAnyToYMD(merged?.birthday || merged?.dob || ymdDOB || "");
              ymdHIRE =
                merged?.hireDateYMD ||
                merged?.startDateYMD ||
                merged?.companyStartDateYMD ||
                parseAnyToYMD(
                  merged?.hireDate || merged?.startDate || merged?.companyStartDate || ymdHIRE || ""
                );
            }
          } catch { /* noop */ }
        }

        const mdyDob = ymdToMDY(ymdDOB) || "";
        const mdyHire = ymdToMDY(ymdHIRE) || "";

        if (!alive) return;
        setDob(mdyDob); setHire(mdyHire);
        setInitialDob(mdyDob); setInitialHire(mdyHire);
      } finally {
        if (alive) setLoading(false);
      }
    }

    boot();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-clear mensagem
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  function patchStoredUser(patch) {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      const base = raw ? JSON.parse(raw) : {};
      const merged = { ...base, ...patch };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(merged));
      saveStoredUser?.(merged);
    } catch {}
  }

  // avatar: upload
  async function onPickAvatar(ev) {
    const file = ev.target.files?.[0];
    try { ev.target.value = ""; } catch {}
    if (!file || !userId) return;

    setUploading(true);
    setMsg("");
    try {
      const { avatarUrl: url } = await uploadAvatar(userId, file);
      const abs = absolutize(url);
      setAvatarUrl(abs || "");
      setUser((u) => ({ ...(u || {}), avatarUrl: abs }));
      patchStoredUser({ avatarUrl: abs });

      try {
        const updated = await updateUser(userId, { avatarUrl: abs });
        setUser((u) => ({ ...(u || {}), ...(updated || {}) }));
        patchStoredUser({ avatarUrl: updated?.avatarUrl || abs });
        onUserUpdate?.({ id: userId, avatarUrl: updated?.avatarUrl || abs, _patch: true });
      } catch {}

      setMsg("Profile photo updated.");
    } catch {
      setMsg("Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  // avatar: remover
  async function onRemoveAvatar() {
    if (!userId) return;
    setUploading(true);
    setMsg("");
    try {
      await deleteAvatar(userId);
      setAvatarUrl("");
      setUser((u) => ({ ...(u || {}), avatarUrl: "" }));
      patchStoredUser({ avatarUrl: "" });
      onUserUpdate?.({ id: userId, avatarUrl: "", _patch: true });
      try {
        await updateUser(userId, {
          avatarUrl: "", photoUrl: "", imageUrl: "",
          avatar: null, photo: null, image: null,
        });
      } catch {}
      setMsg("Avatar removed.");
    } catch {
      setMsg("Could not remove avatar, but local preview was cleared.");
    } finally {
      setUploading(false);
    }
  }

  // salvar DOB
  async function onSaveDob() {
    if (!userId) return;
    const mdy = dob.trim();
    if (!isValidMDY(mdy)) { setMsg("Use MM/DD/YYYY for DOB."); return; }
    if (dob === initialDob) { setMsg("No changes to save."); return; }

    const ymd = mdyToYMD(mdy);
    setMsg("");
    try {
      const updated = await updateUser(userId, {
        birthday: ymd, dob: ymd, birthdayYMD: ymd, dobYMD: ymd,
      });

      const newYMD = updated?.birthdayYMD || parseAnyToYMD(updated?.birthday) || ymd;
      const newMDY = ymdToMDY(newYMD) || mdy;

      setDob(newMDY);
      setInitialDob(newMDY);
      setUser((u) => ({ ...(u || {}), ...(updated || {}), birthday: newYMD, birthdayYMD: newYMD }));
      patchStoredUser({ birthday: newYMD, birthdayYMD: newYMD, dob: newYMD, dobYMD: newYMD });
      onUserUpdate?.({ id: userId, birthday: newYMD, _patch: true });

      setMsg("Birth date saved.");
    } catch {
      patchStoredUser({ birthday: ymd, birthdayYMD: ymd, dob: ymd, dobYMD: ymd });
      setInitialDob(mdy);
      setMsg("Saved locally (offline).");
    }
  }

  // salvar Company Start
  async function onSaveHire() {
    if (!userId) return;
    const mdy = hire.trim();
    if (!isValidMDY(mdy)) { setMsg("Use MM/DD/YYYY for Company Start."); return; }
    if (hire === initialHire) { setMsg("No changes to save."); return; }

    const ymd = mdyToYMD(mdy);
    setMsg("");
    try {
      const updated = await updateUser(userId, {
        hireDate: ymd, startDate: ymd, companyStartDate: ymd,
        hireDateYMD: ymd, startDateYMD: ymd, companyStartDateYMD: ymd,
      });

      const newYMD =
        updated?.hireDateYMD ||
        updated?.startDateYMD ||
        updated?.companyStartDateYMD ||
        parseAnyToYMD(updated?.hireDate || updated?.startDate || updated?.companyStartDate) ||
        ymd;

      const newMDY = ymdToMDY(newYMD) || mdy;

      setHire(newMDY);
      setInitialHire(newMDY);
      setUser((u) => ({
        ...(u || {}),
        ...(updated || {}),
        hireDate: newYMD,
        startDate: newYMD,
        companyStartDate: newYMD,
        hireDateYMD: newYMD,
        startDateYMD: newYMD,
        companyStartDateYMD: newYMD,
      }));
      patchStoredUser({
        hireDate: newYMD, startDate: newYMD, companyStartDate: newYMD,
        hireDateYMD: newYMD, startDateYMD: newYMD, companyStartDateYMD: newYMD,
      });
      onUserUpdate?.({ id: userId, hireDate: newYMD, startDate: newYMD, companyStartDate: newYMD, _patch: true });

      setMsg("Company start date saved.");
    } catch {
      patchStoredUser({ hireDate: ymd, startDate: ymd, companyStartDate: ymd });
      setInitialHire(mdy);
      setMsg("Saved locally (offline).");
    }
  }

  const name  = toTitle(user?.fullName || propUser?.fullName || "");
  const email = user?.email || propUser?.email || "";
  const role  = toTitle(user?.role || propUser?.role || "");
  const dept  = toTitle(user?.department || propUser?.department || "");
  const initials = useMemo(() => initialsFrom(name), [name]);

  const showRemove = Boolean(avatarUrl);
  const dobDirty   = dob   !== initialDob;
  const hireDirty  = hire  !== initialHire;

  return (
    <div className="partner-page" /* mobile-first & escopado */>
      <div
        className="profile-card"
        onMouseDownCapture={stopBubble}
        onTouchStartCapture={stopBubble}
      >
        {/* Header / Avatar */}
        <div className="profile-header">
          <div className="profile-avatar">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = DEFAULT_AVATAR;
                }}
              />
            ) : (
              <div className="profile-avatar-fallback" aria-hidden>{initials}</div>
            )}
          </div>

          <div className="profile-avatar-actions">
            <label className="btn btn--outline btn--sm profile-upload">
              {uploading ? "Working…" : "Change Avatar"}
              <input
                type="file"
                accept="image/*"
                onChange={onPickAvatar}
                disabled={uploading}
              />
            </label>

            {showRemove && (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={onRemoveAvatar}
                disabled={uploading}
              >
                Remove
              </button>
            )}

            {msg && (
              <span className="profile-hint" role="status" aria-live="polite" style={{ marginLeft: 8 }}>
                {msg}
              </span>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="profile-rows">
          <div className="profile-row">
            <div className="pc-label">Name</div>
            <div className="pc-value">{name || "—"}</div>
          </div>

          <div className="profile-row">
            <div className="pc-label">Email</div>
            <div className="pc-value">{email || "—"}</div>
          </div>

          <div className="profile-row">
            <div className="pc-label">Role</div>
            <div className="pc-value">{role || "—"}</div>
          </div>

          <div className="profile-row">
            <div className="pc-label">Department</div>
            <div className="pc-value">{dept || "—"}</div>
          </div>

          {/* DOB */}
          <div className="profile-row">
            <div className="pc-label">DOB</div>
            <div className="pc-value">
              <div className="profile-edit">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="MM/DD/YYYY"
                  className="profile-input"
                  value={dob}
                  onChange={(e) => setDob(maskMDY(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter" && dobDirty && !uploading && !loading) onSaveDob(); }}
                  maxLength={10}
                  autoComplete="bday"
                />
                <button
                  className="btn btn--primary btn--sm"
                  onClick={onSaveDob}
                  disabled={uploading || loading || !dobDirty}
                  title={dobDirty ? "Save DOB" : "No changes"}
                >
                  {uploading ? "Saving…" : "Save"}
                </button>
                <span className="profile-hint">Current: {dob || "—"}</span>
              </div>
            </div>
          </div>

          {/* Company Start */}
          <div className="profile-row">
            <div className="pc-label">Company Start Date</div>
            <div className="pc-value">
              <div className="profile-edit">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="MM/DD/YYYY"
                  className="profile-input"
                  value={hire}
                  onChange={(e) => setHire(maskMDY(e.target.value))}
                  onKeyDown={(e) => { if (e.key === "Enter" && hireDirty && !uploading && !loading) onSaveHire(); }}
                  maxLength={10}
                  autoComplete="off"
                />
                <button
                  className="btn btn--primary btn--sm"
                  onClick={onSaveHire}
                  disabled={uploading || loading || !hireDirty}
                  title={hireDirty ? "Save Company Start Date" : "No changes"}
                >
                  {uploading ? "Saving…" : "Save"}
                </button>
                <span className="profile-hint">Current: {hire || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        {loading && (
          <div className="profile-hint" role="status" aria-live="polite">
            Loading profile…
          </div>
        )}
      </div>
    </div>
  );
}
