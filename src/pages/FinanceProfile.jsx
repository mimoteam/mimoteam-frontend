// src/pages/FinanceProfile.jsx
import React, { useEffect, useMemo, useState } from 'react';
import '../styles/FinanceProfile.css';
import {
  getMe,
  getUserById,
  updateUser,
  uploadAvatar,
} from '../api/users';
import { API_URL } from '../api/http';

const USERS_KEY = 'users_store_v1';
const CURRENT_USER_KEY = 'current_user_v1';

function isMongoId(x) {
  return typeof x === 'string' && /^[a-f0-9]{24}$/.test(x);
}

/** Title Case com suporte a acentos e separadores */
function toTitleCase(input) {
  const s = String(input || '');
  const lower = s.toLocaleLowerCase();
  return lower.replace(/(^|[\s\-\/\.])([\p{L}])/gu, (_, sep, chr) => sep + chr.toLocaleUpperCase());
}

/* ===== Helpers de data (mm/dd/yyyy <-> ISO) ===== */
function isoToMdy(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear());
  return `${mm}/${dd}/${yy}`;
}
function mdyToIso(mdy) {
  if (!mdy) return null;
  const m = mdy.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day   = Number(m[2]);
  const year  = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).toISOString();
}

/** normaliza URL do avatar para absoluta */
function absolutize(url) {
  if (!url) return '';
  if (/^(data:|https?:\/\/)/i.test(url)) return url;
  const base = (API_URL || '').replace(/\/$/, '');
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${base}${path}`;
}

const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' ry='12' fill='%23E2E8F0'/><circle cx='32' cy='24' r='12' fill='%2394A3B8'/><path d='M10 56a22 22 0 0144 0' fill='%2394A3B8'/></svg>";

export default function FinanceProfile({ currentUser: currentUserProp, onUserUpdate }) {
  const [currentUser, setCurrentUser] = useState(() => {
    if (currentUserProp) return currentUserProp;
    try { return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || '{}'); } catch { return {}; }
  });
  useEffect(() => { if (currentUserProp) setCurrentUser(currentUserProp); }, [currentUserProp]);

  const [serverUser, setServerUser] = useState(null);
  const effectiveId =
    serverUser?._id ||
    (isMongoId(currentUser?._id) ? currentUser._id : undefined) ||
    (isMongoId(currentUser?.id)  ? currentUser.id  : undefined);

  const avatarKey = effectiveId ? `partner_avatar_${effectiveId}` : 'partner_avatar';

  const [loadingUser, setLoadingUser] = useState(!!effectiveId);
  const [loadError, setLoadError] = useState('');

  // avatar
  const [avatarUrl, setAvatarUrl] = useState('');         // URL do backend (absoluta)
  const [avatarDataUrl, setAvatarDataUrl] = useState(''); // preview local
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  // datas (UI mm/dd/yyyy)
  const [dobMDY, setDobMDY] = useState('');
  const [hireMDY, setHireMDY] = useState('');
  const [dobErr, setDobErr] = useState('');
  const [hireErr, setHireErr] = useState('');
  const [savingDob, setSavingDob] = useState(false);
  const [savingHire, setSavingHire] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // exibições
  const displayName       = useMemo(() => toTitleCase(serverUser?.fullName ?? currentUser?.fullName), [serverUser, currentUser]);
  const displayRole       = useMemo(() => toTitleCase(serverUser?.role     ?? currentUser?.role),     [serverUser, currentUser]);
  const displayDepartment = useMemo(() => toTitleCase(serverUser?.department ?? currentUser?.department), [serverUser, currentUser]);

  useEffect(() => {
    try { const saved = localStorage.getItem(avatarKey); if (saved) setAvatarDataUrl(saved); } catch {}
  }, [avatarKey]);

  function normalizeIdPatch(patchLike = {}) {
    const realId = patchLike._id || patchLike.id || effectiveId;
    if (!realId) return patchLike;
    return { ...patchLike, _id: realId, id: realId };
  }
  function mergeIntoLocalStores(patch) {
    try {
      const normalized = normalizeIdPatch(patch);
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      const updated = { ...obj, ...normalized };
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
      setCurrentUser(updated);
      const arrRaw = localStorage.getItem(USERS_KEY);
      const arr = arrRaw ? JSON.parse(arrRaw) : [];
      if (Array.isArray(arr)) {
        const rid = normalized._id || normalized.id;
        const idx = arr.findIndex(u => (u._id || u.id) === rid);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...normalized };
          localStorage.setItem(USERS_KEY, JSON.stringify(arr));
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (!effectiveId) return;
    (async () => {
      setLoadingUser(true);
      setLoadError('');
      try {
        const u = await getMe().catch(() => getUserById(effectiveId));
        const realId = u?._id || u?.id;
        const normalizedUser = realId ? { ...u, _id: realId, id: realId } : u;

        setServerUser(normalizedUser);
        setAvatarUrl(absolutize(normalizedUser?.avatarUrl || normalizedUser?.photoUrl || normalizedUser?.imageUrl || ''));
        setDobMDY(isoToMdy(normalizedUser?.birthday || normalizedUser?.dob || ''));
        setHireMDY(isoToMdy(normalizedUser?.hireDate || normalizedUser?.startDate || normalizedUser?.companyStartDate || ''));

        mergeIntoLocalStores(normalizedUser);
        if (typeof onUserUpdate === 'function') onUserUpdate(normalizedUser);
      } catch {
        setLoadError('Could not load your profile from the server. Showing local data.');
        setDobMDY(isoToMdy(currentUser?.birthday || currentUser?.dob || ''));
        setHireMDY(isoToMdy(currentUser?.hireDate || currentUser?.startDate || currentUser?.companyStartDate || ''));
      } finally { setLoadingUser(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveId]);

  /* ===== Avatar ===== */
  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !effectiveId) return;
    setUploadMsg('');
    setUploadingAvatar(true);
    try {
      const data = await uploadAvatar(effectiveId, file);
      const url = absolutize(data?.avatarUrl || data?.url || data?.location || data?.secure_url || '');
      if (url) setAvatarUrl(url);

      const reader = new FileReader();
      reader.onload = () => {
        try { localStorage.setItem(avatarKey, reader.result); } catch {}
        setAvatarDataUrl(String(reader.result));
      };
      reader.readAsDataURL(file);

      const merged = normalizeIdPatch({ ...(serverUser || {}), avatarUrl: url, _id: effectiveId, id: effectiveId });
      setServerUser(merged);
      mergeIntoLocalStores(merged);
      if (typeof onUserUpdate === 'function') onUserUpdate(merged);
      setUploadMsg('Profile photo updated.');
    } catch {
      setUploadMsg('Upload failed. Using local image as fallback.');
      const reader = new FileReader();
      reader.onload = () => { try { localStorage.setItem(avatarKey, reader.result); } catch {} setAvatarDataUrl(String(reader.result)); };
      reader.readAsDataURL(file);
    } finally {
      setUploadingAvatar(false);
      try { e.target.value = ''; } catch {}
    }
  };

  const removeAvatar = async () => {
    try { localStorage.removeItem(avatarKey); } catch {}
    setAvatarDataUrl('');
    setAvatarUrl('');
    setServerUser(prev => prev ? { ...prev, avatarUrl: '' } : prev);
    mergeIntoLocalStores({ _id: effectiveId, id: effectiveId, avatarUrl: '' });
    if (typeof onUserUpdate === 'function') onUserUpdate({ _id: effectiveId, id: effectiveId, avatarUrl: '' });
    try { await updateUser(effectiveId, { avatarUrl: '' }); } catch {}
  };

  const isCustomAvatar = useMemo(() => avatarDataUrl && avatarDataUrl.startsWith('data:image'), [avatarDataUrl]);
  const effectiveAvatar = (avatarUrl ? absolutize(avatarUrl) : '') || avatarDataUrl || DEFAULT_AVATAR_URL;

  /* ===== Datas (mm/dd/yyyy na UI) ===== */
  const onSaveDob = async () => {
    setSaveMsg(''); setDobErr('');
    if (!effectiveId) return;
    if (!dobMDY) {
      setSavingDob(true);
      try {
        const payload = normalizeIdPatch({ _id: effectiveId, birthday: '', dob: '' });
        const updated = await updateUser(effectiveId, payload);
        setServerUser(prev => ({ ...(prev || {}), ...updated }));
        mergeIntoLocalStores(payload);
        setSaveMsg('Birth date cleared.');
      } catch {
        mergeIntoLocalStores({ _id: effectiveId, birthday: '', dob: '' });
        setSaveMsg('Saved locally (offline).');
      } finally { setSavingDob(false); }
      return;
    }
    const iso = mdyToIso(dobMDY);
    if (!iso) { setDobErr('Use mm/dd/yyyy'); return; }

    setSavingDob(true);
    try {
      const payload = normalizeIdPatch({ _id: effectiveId, birthday: iso, dob: iso });
      const updated = await updateUser(effectiveId, payload);
      setServerUser(prev => ({ ...(prev || {}), ...updated }));
      mergeIntoLocalStores(payload);
      setSaveMsg('Birth date saved.');
    } catch {
      mergeIntoLocalStores({ _id: effectiveId, birthday: iso, dob: iso });
      setSaveMsg('Saved locally (offline).');
    } finally { setSavingDob(false); }
  };

  const [isEditingHire, setIsEditingHire] = useState(false);
  const onSaveHireDate = async () => {
    setSaveMsg(''); setHireErr('');
    if (!effectiveId) return;

    if (!hireMDY) {
      setSavingHire(true);
      try {
        const payload = normalizeIdPatch({ _id: effectiveId, hireDate: '', startDate: '', companyStartDate: '' });
        const updated = await updateUser(effectiveId, payload);
        setServerUser(prev => ({ ...(prev || {}), ...updated }));
        mergeIntoLocalStores(payload);
        setIsEditingHire(false);
        setSaveMsg('Start date cleared.');
      } catch {
        mergeIntoLocalStores({ _id: effectiveId, hireDate: '', startDate: '', companyStartDate: '' });
        setIsEditingHire(false);
        setSaveMsg('Saved locally (offline).');
      } finally { setSavingHire(false); }
      return;
    }

    const iso = mdyToIso(hireMDY);
    if (!iso) { setHireErr('Use mm/dd/yyyy'); return; }

    setSavingHire(true);
    try {
      const payload = normalizeIdPatch({ _id: effectiveId, hireDate: iso, startDate: iso, companyStartDate: iso });
      const updated = await updateUser(effectiveId, payload);
      setServerUser(prev => ({ ...(prev || {}), ...updated }));
      mergeIntoLocalStores(payload);
      setIsEditingHire(false);
      setSaveMsg('Start date saved.');
    } catch {
      mergeIntoLocalStores({ _id: effectiveId, hireDate: iso, startDate: iso, companyStartDate: iso });
      setIsEditingHire(false);
      setSaveMsg('Saved locally (offline).');
    } finally { setSavingHire(false); }
  };

  const Row = ({ label, children, value }) => (
    <div className="pc-row profile-row">
      <div className="pc-label" style={{ fontWeight: 600 }}>{label}</div>
      <div className="pc-value">{children ?? value ?? '—'}</div>
    </div>
  );

  const initials = useMemo(() => {
    const n = displayName || String(currentUser?.fullName || '').trim();
    if (!n) return 'U';
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase()).join('');
  }, [displayName, currentUser]);

  return (
    <div className="partner-page page-profile">
      <div className="p-card profile-card">

        {/* Header */}
        <div className="profile-header">
          <div className="profile-avatar">
            {effectiveAvatar ? (
              <img
                src={effectiveAvatar}
                alt="Avatar"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = avatarDataUrl || DEFAULT_AVATAR_URL;
                }}
              />
            ) : (
              <div className="profile-avatar-fallback">{initials}</div>
            )}
          </div>
          <div className="profile-avatar-actions">
            <label className="btn btn--outline btn--sm profile-upload">
              {uploadingAvatar ? 'Uploading…' : 'Change Avatar'}
              <input type="file" accept="image/*" onChange={onPickAvatar} disabled={uploadingAvatar} />
            </label>
            {isCustomAvatar && (
              <button className="btn btn--danger btn--sm" onClick={removeAvatar} disabled={uploadingAvatar}>Remove</button>
            )}
            {uploadMsg && <span className="profile-hint" style={{ marginLeft:8 }}>{uploadMsg}</span>}
          </div>
        </div>

        {loadingUser && <div className="profile-hint" style={{ marginTop:8 }}>Loading profile…</div>}
        {loadError && <div className="profile-hint" style={{ marginTop:8, color:'#B45309' }}>{loadError}</div>}

        {/* Campos */}
        <div className="profile-rows">
          <Row label="Name"       value={displayName} />
          <Row label="Email"      value={serverUser?.email ?? currentUser?.email} />
          <Row label="Role"       value={displayRole} />
          <Row label="Department" value={displayDepartment} />

          <div className="pc-row profile-row">
            <div className="pc-label" style={{ fontWeight: 600 }}>DOB</div>
            <div className="pc-value profile-edit">
              <input
                type="text"
                inputMode="numeric"
                placeholder="mm/dd/yyyy"
                value={dobMDY}
                onChange={(e)=>setDobMDY(e.target.value)}
                className="profile-input"
                disabled={savingDob}
              />
              <button className="btn btn--primary btn--sm" onClick={onSaveDob} disabled={savingDob}>
                {savingDob ? 'Saving…' : 'Save'}
              </button>
              <span className="profile-hint">
                {serverUser?.dob || serverUser?.birthday
                  ? `Current: ${isoToMdy(serverUser?.dob || serverUser?.birthday)}`
                  : (dobMDY ? `Current: ${dobMDY}` : 'No date set')}
              </span>
              {dobErr && <span className="profile-hint" style={{ color:'#B45309', marginLeft:8 }}>{dobErr}</span>}
            </div>
          </div>

          <div className="pc-row profile-row">
            <div className="pc-label" style={{ fontWeight: 600 }}>Company Start Date</div>
            <div className="pc-value profile-edit">
              {!isEditingHire ? (
                <>
                  <span className="profile-readonly">
                    {serverUser?.hireDate || serverUser?.startDate || serverUser?.companyStartDate
                      ? isoToMdy(serverUser?.hireDate || serverUser?.startDate || serverUser?.companyStartDate)
                      : (hireMDY || 'No date set')}
                  </span>
                  <button className="btn btn--outline btn--sm" onClick={()=>setIsEditingHire(true)} style={{ marginLeft:8 }}>Edit</button>
                </>
              ) : (
                <>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="mm/dd/yyyy"
                    value={hireMDY}
                    onChange={(e)=>setHireMDY(e.target.value)}
                    className="profile-input"
                    disabled={savingHire}
                  />
                  <button className="btn btn--primary btn--sm" onClick={onSaveHireDate} disabled={savingHire}>
                    {savingHire ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="btn btn--outline btn--sm"
                    onClick={()=>{ 
                      setHireMDY(isoToMdy(serverUser?.hireDate || serverUser?.startDate || serverUser?.companyStartDate || ''));
                      setIsEditingHire(false);
                    }}
                    disabled={savingHire}
                  >
                    Cancel
                  </button>
                  {hireErr && <span className="profile-hint" style={{ color:'#B45309', marginLeft:8 }}>{hireErr}</span>}
                </>
              )}
            </div>
          </div>

          {saveMsg && <div className="profile-hint" style={{ marginTop:4 }}>{saveMsg}</div>}
        </div>

      </div>
    </div>
  );
}
