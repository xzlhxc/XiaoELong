import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { UserAvatar } from "../atoms/UserAvatar";

export function SettingsProfileForm(): JSX.Element | null {
  const {
    currentUser: user,
    profileSaving: loading,
    profileError: error,
    profileSaved: saved,
    updateProfile: onSubmit
  } = useAuth();

  if (!user) {
    return null;
  }

  const [nickname, setNickname] = useState(user.nickname);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    setNickname(user.nickname);
    setAvatarFile(null);
  }, [user.id, user.nickname, user.avatarUrl]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [avatarFile]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit({
      nickname,
      avatarFile
    });
  }

  const hasChanges = nickname.trim() !== user.nickname || avatarFile !== null;
  const showSaved = saved && !error && !hasChanges;
  const saveLabel = loading ? "保存中" : showSaved ? "已保存" : "保存资料";

  return (
    <form className="settings-profile-form" onSubmit={handleSubmit}>
      <div className="settings-profile-main">
        <div className="settings-profile-preview">
          {avatarPreviewUrl ? (
            <img src={avatarPreviewUrl} alt="" draggable={false} />
          ) : (
            <UserAvatar
              user={user}
              className="settings-profile-avatar"
              fallbackClassName="settings-profile-avatar settings-profile-avatar-fallback"
            />
          )}
        </div>

        <label className="settings-profile-field">
          昵称
          <input
            type="text"
            value={nickname}
            maxLength={32}
            required
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
      </div>

      <label className="settings-avatar-picker">
        <input
          className="file-input"
          type="file"
          accept="image/*"
          onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
        />
        <span className="file-upload-control settings-file-control">
          <span className="file-upload-button">选择头像</span>
          <span className="file-upload-name">{avatarFile ? avatarFile.name : "沿用当前头像"}</span>
        </span>
      </label>

      {error ? <p className="error-text settings-profile-message">{error}</p> : null}
      <button type="submit" className="primary-soft-button settings-profile-save" disabled={loading || !hasChanges}>
        {saveLabel}
      </button>
    </form>
  );
}
