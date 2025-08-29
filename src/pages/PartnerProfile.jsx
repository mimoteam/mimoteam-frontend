// src/pages/PartnerProfile.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/PartnerProfile.css';
import { getMe, getUserById, updateUser, uploadAvatar, deleteAvatar } from '../api/users';
import { toAbsoluteUrl } from '../api/http';

const USERS_KEY = 'users_store_v1';

/* ========= Helpers ========= */
function toTitleCase(input) {
  const s = String(input || '');
  const lower = s.toLocaleLowerCase();
  return lower.replace(/(^|[\s\-\/\.])([\p{L}])/gu, (_, sep, chr) => sep + chr.toLocaleUpperCase());
}
function absolutize(url) {
  return toAbsoluteUrl(url);
}

/** Converte qualquer valor de data (ISO, Date, etc.) para YYYY-MM-DD */
function toYMD(v) {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
function ymdToISO(ymd) {
  if (!ymd) return '';
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]), mo = Number(m[2]), da = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, da, 0, 0, 0, 0));
  return dt.toISOString();
}
function formatDateNice(value) {
  const ymd = toYMD(value);
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' ry='12' fill='%23E2E8F0'/><circle cx='32' cy='24' r='12' fill='%2394A3B8'/><path d='M10 56a22 22 0 0144 0' fill='%2394A3B8'/></svg>";

export default function PartnerProfile({ currentUser, onUserUpdate }) {
  const userId = currentUser?.id || currentUser?._id;
  const avatarKey = userId ? `partner_avatar_${userId}` : 'partner_avatar';

  const [serverUser, setServerUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(!!userId);
  const [loadError, setLoadError] = useState('');

  // avatar
  const [avatar, setAvatar] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  // datas
  const [dob, setDob] = useState(toYMD(currentUser?.birthday || currentUser?.dob || ''));
  const [hireDate, setHireDate] = useState(
    toYMD(currentUser?.hireDate || currentUser?.startDate || currentUser?.companyStartDate || '')
  );
  const [savingDob, setSavingDob] = useState(false);
  const [savingHire, setSavingHire] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // passkey
  const faceKey = userId ? `faceid_enabled_${userId}` : 'faceid_enabled';
  const [faceEnabled, setFaceEnabled] = useState(false);
  const [faceSupport, setFaceSupport] = useState(null);

  const displayName       = useMemo(() => toTitleCase(serverUser?.fullName ?? currentUser?.fullName), [serverUser, currentUser]);
  const displayRole       = useMemo(() => toTitleCase(serverUser?.role     ?? currentUser?.role),     [serverUser, currentUser]);
  const displayDepartment = useMemo(() => toTitleCase(serverUser?.department ?? currentUser?.department), [serverUser, currentUser]);

  const onUserUpdateRef = useRef(onUserUpdate);
  useEffect(() => { onUserUpdateRef.current = onUserUpdate; }, [onUserUpdate]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(avatarKey);
      if (saved) setAvatar(saved);
    } catch {}
  }, [avatarKey]);

  useEffect(() => {
    (async () => {
      try {
        const supported = !!window.PublicKeyCredential &&
          (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.()) === true;
        setFaceSupport(supported);
      } catch { setFaceSupport(false); }
      try { setFaceEnabled(localStorage.getItem(faceKey) === '1'); } catch {}
    })();
  }, [faceKey]);

  // Evita loop: busca só quando userId muda
  const lastFetchedIdRef = useRef(null);
  useEffect(() => {
    if (!userId) return;
    if (lastFetchedIdRef.current === userId) return;
    lastFetchedIdRef.current = userId;

    let alive = true;
    (async () => {
      setLoadingUser(true);
      setLoadError('');
      try {
        const u = await getMe().catch(() => getUserById(userId));
        if (!alive) return;
        const normalized = { ...u, avatarUrl: absolutize(u?.avatarUrl || u?.photoUrl || u?.imageUrl || '') };
        setServerUser(normalized);
        setDob(toYMD(normalized?.birthday || normalized?.dob || ''));
        setHireDate(toYMD(normalized?.hireDate || normalized?.startDate || normalized?.companyStartDate || ''));
        setAvatarUrl(normalized?.avatarUrl || '');
        onUserUpdateRef.current?.(normalized);
      } catch {
        if (!alive) return;
        setLoadError('Could not load your profile from the server. Showing local data.');
      } finally {
        if (alive) setLoadingUser(false);
      }
    })();

    return () => { alive = false; };
  }, [userId]);

  const mergeIntoLocalStores = (patch) => {
    try {
      const raw = localStorage.getItem('current_user_v1');
      const obj = raw ? JSON.parse(raw) : {};
      const updated = { ...obj, ...patch };
      localStorage.setItem('current_user_v1', JSON.stringify(updated));
      const arr = JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
      const idx = Array.isArray(arr) ? arr.findIndex(u => (u.id || u._id) === (patch.id || updated.id)) : -1;
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...patch };
        localStorage.setItem(USERS_KEY, JSON.stringify(arr));
      }
    } catch {}
  };

  /* ===== Avatar ===== */
  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploadMsg('');
    setUploadingAvatar(true);
    try {
      const data = await uploadAvatar(userId, file); // { avatarUrl }
      const urlAbs = absolutize(data?.avatarUrl || '');
      if (urlAbs) setAvatarUrl(urlAbs);

      const reader = new FileReader();
      reader.onload = () => {
        try { localStorage.setItem(avatarKey, reader.result); } catch {}
        setAvatar(String(reader.result));
      };
      reader.readAsDataURL(file);

      const merged = { ...(serverUser || {}), avatarUrl: urlAbs };
      setServerUser(merged);

      // Patch mínimo pro pai (evita reavaliar rota/role)
      try { onUserUpdateRef.current?.({ id: userId, avatarUrl: urlAbs, _patch: true }); } catch {}

      setUploadMsg('Profile photo updated.');
    } catch {
      setUploadMsg('Upload failed. Using local image as fallback.');
      const reader = new FileReader();
      reader.onload = () => {
        try { localStorage.setItem(avatarKey, reader.result); } catch {}
        setAvatar(String(reader.result));
      };
      reader.readAsDataURL(file);
    } finally {
      setUploadingAvatar(false);
      try { e.target.value = ''; } catch {}
    }
  };

  const removeAvatar = async () => {
    if (!userId) return;
    setUploadMsg('');    

    // 1) tenta remover no backend usando a rota robusta
    let removedOnServer = false;
    try {
      const r = await deleteAvatar(userId);
      removedOnServer = !!r?.ok;
    } catch {
      removedOnServer = false;
    }

    // 2) se o backend não tiver rota, força limpar campos como fallback
    if (!removedOnServer) {
      try {
        await updateUser(userId, {
          avatarUrl: '',
          photoUrl: '',
          imageUrl: '',
          avatar: null,
          photo: null,
          image: null,
        });
      } catch { /* offline/sem rota: segue para limpeza local */ }
    }

    // 3) limpeza local (preview + caches)
    try { localStorage.removeItem(avatarKey); } catch {}
    setAvatar('');
    setAvatarUrl('');

    // 4) atualiza estados e storages
    setServerUser(prev => prev ? { ...prev, avatarUrl: '' } : prev);
    mergeIntoLocalStores({ id: userId, avatarUrl: '' });

    // 5) patch mínimo pro App (não derruba role/rota)
    try { onUserUpdateRef.current?.({ id: userId, avatarUrl: '', _patch: true }); } catch {}

    setUploadMsg('Avatar removed.');
  };

  // Mostrar "Remove" se houver avatar de qualquer origem
  const showRemove = useMemo(() => Boolean(avatarUrl || avatar), [avatarUrl, avatar]);

  const effectiveAvatar = (avatarUrl ? absolutize(avatarUrl) : '') || avatar || DEFAULT_AVATAR_URL;

  /* ===== Datas ===== */
  const [isEditingHire, setIsEditingHire] = useState(false);

  const onSaveDob = async () => {
    if (!userId) return;
    setSaveMsg('');
    setSavingDob(true);
    try {
      const payloadISO = dob ? ymdToISO(dob) : '';
      const payload = { birthday: payloadISO, dob: payloadISO };
      const updated = await updateUser(userId, payload);
      setServerUser(prev => ({ ...(prev || {}), ...updated }));
      mergeIntoLocalStores({ id: userId, ...payload });
      // patch mínimo no pai (sem forçar reavaliação de role/route)
      try { onUserUpdateRef.current?.({ id: userId, ...payload, _patch: true }); } catch {}
      setSaveMsg('Birth date saved.');
    } catch {
      const iso = dob ? ymdToISO(dob) : '';
      mergeIntoLocalStores({ id: userId, birthday: iso, dob: iso });
      setSaveMsg('Saved locally (offline).');
    } finally { setSavingDob(false); }
  };

  const onSaveHireDate = async () => {
    if (!userId || !hireDate) return;
    setSaveMsg('');
    setSavingHire(true);
    try {
      const iso = ymdToISO(hireDate);
      const payload = { hireDate: iso, startDate: iso, companyStartDate: iso };
      const updated = await updateUser(userId, payload);
      setServerUser(prev => ({ ...(prev || {}), ...updated }));
      mergeIntoLocalStores({ id: userId, ...payload });
      try { onUserUpdateRef.current?.({ id: userId, ...payload, _patch: true }); } catch {}
      setIsEditingHire(false);
      setSaveMsg('Start date saved.');
    } catch {
      const iso = ymdToISO(hireDate);
      mergeIntoLocalStores({ id: userId, hireDate: iso, startDate: iso, companyStartDate: iso });
      setIsEditingHire(false);
      setSaveMsg('Saved locally (offline).');
    } finally { setSavingHire(false); }
  };

  const enableFaceOnThisDevice  = () => { try { localStorage.setItem(faceKey, '1'); } catch {}; setFaceEnabled(true); };
  const disableFaceOnThisDevice = () => { try { localStorage.removeItem(faceKey); } catch {}; setFaceEnabled(false); };

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
                key={effectiveAvatar}
                src={effectiveAvatar}
                alt="Avatar"
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = avatar || DEFAULT_AVATAR_URL;
                }}
              />
            ) : (
              <div className="profile-avatar-fallback">{initials}</div>
            )}
          </div>
          <div className="profile-avatar-actions">
            <label
              className="btn btn--outline btn--sm profile-upload"
              onClick={(ev) => ev.stopPropagation()}
              onPointerDownCapture={(ev) => ev.stopPropagation()}
            >
              {uploadingAvatar ? 'Uploading…' : 'Change Avatar'}
              <input
                type="file"
                accept="image/*"
                onChange={onPickAvatar}
                disabled={uploadingAvatar}
                onClick={(ev) => ev.stopPropagation()}
                onPointerDownCapture={(ev) => ev.stopPropagation()}
              />
            </label>
            {showRemove && (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={removeAvatar}
                disabled={uploadingAvatar}
                onClickCapture={(ev) => ev.stopPropagation()}
              >
                Remove
              </button>
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
          <Row label="Role"       value={toTitleCase(serverUser?.role ?? currentUser?.role)} />
          <Row label="Department" value={toTitleCase(serverUser?.department ?? currentUser?.department)} />

          <div className="pc-row profile-row">
            <div className="pc-label" style={{ fontWeight: 600 }}>DOB</div>
            <div className="pc-value profile-edit">
              <input
                type="date"
                value={dob}
                onChange={(e)=>setDob(e.target.value)}
                className="profile-input"
                disabled={savingDob}
                onPointerDownCapture={(ev)=>ev.stopPropagation()}
              />
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={onSaveDob}
                disabled={savingDob}
              >
                {savingDob ? 'Saving…' : 'Save'}
              </button>
              <span className="profile-hint">{dob ? `Current: ${formatDateNice(dob)}` : 'No date set'}</span>
            </div>
          </div>

          <div className="pc-row profile-row">
            <div className="pc-label" style={{ fontWeight: 600 }}>Company Start Date</div>
            <div className="pc-value profile-edit">
              {hireDate && !isEditingHire ? (
                <>
                  <span className="profile-readonly">{formatDateNice(hireDate)}</span>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={()=>setIsEditingHire(true)}
                    style={{ marginLeft:8 }}
                  >
                    Edit
                  </button>
                </>
              ) : !isEditingHire ? (
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  onClick={()=>setIsEditingHire(true)}
                >
                  Add
                </button>
              ) : (
                <>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e)=>setHireDate(e.target.value)}
                    className="profile-input"
                    disabled={savingHire}
                    onPointerDownCapture={(ev)=>ev.stopPropagation()}
                  />
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={onSaveHireDate}
                    disabled={savingHire}
                  >
                    {savingHire ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={()=>{ 
                      setHireDate(toYMD(serverUser?.hireDate || serverUser?.startDate || serverUser?.companyStartDate || ''));
                      setIsEditingHire(false);
                    }}
                    disabled={savingHire}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>

          {saveMsg && <div className="profile-hint" style={{ marginTop:4 }}>{saveMsg}</div>}
        </div>

        {/* Passkey */}
        <div className="profile-section">
          <div className="section-title">Face ID / Passkey</div>
          <div className="profile-rows">
            <Row label="This Device">
              <div className="profile-edit" style={{ alignItems:'center' }}>
                {faceEnabled ? (
                  <>
                    <span className="profile-readonly">Enabled</span>
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={disableFaceOnThisDevice}
                    >
                      Disable
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={enableFaceOnThisDevice}
                      disabled={faceSupport === false}
                    >
                      Enable
                    </button>
                    <span className="profile-hint">
                      {faceSupport === false
                        ? 'Biometric/passkey not available on this browser.'
                        : 'Stores a quick-login preference on this device.'}
                    </span>
                  </>
                )}
              </div>
            </Row>
          </div>
        </div>

      </div>
    </div>
  );
}
