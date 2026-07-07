import { FormEvent, useState } from "react";

interface JoinFormProps {
  loading: boolean;
  error: string | null;
  onSubmit: (payload: { inviteCode: string; nickname: string; avatarFile: File | null }) => Promise<void>;
}

export function JoinForm(props: JoinFormProps): JSX.Element {
  const [inviteCode, setInviteCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await props.onSubmit({
      inviteCode,
      nickname,
      avatarFile
    });
  }

  return (
    <div className="join-card">
      <h1>XiaoELong</h1>
      <p className="subtext">输入邀请码后加入小鳄龙之家。</p>

      <form onSubmit={handleSubmit} className="join-form">
        <label>
          邀请码
          <input
            type="text"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="请输入邀请码"
            required
          />
        </label>

        <label>
          昵称
          <input
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            maxLength={32}
            placeholder="请输入昵称"
            required
          />
        </label>

        <label>
          头像（可选）
          <input
            className="file-input"
            type="file"
            accept="image/*"
            onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
          />
          <span className="file-upload-control">
            <span className="file-upload-button">选择图片</span>
            <span className="file-upload-name">{avatarFile ? avatarFile.name : "未选择图片"}</span>
          </span>
        </label>

        {props.error ? <p className="error-text">{props.error}</p> : null}

        <button type="submit" disabled={props.loading}>
          {props.loading ? "加入中..." : "加入小鳄龙"}
        </button>
      </form>
    </div>
  );
}
