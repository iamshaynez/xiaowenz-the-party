import { AVATARS } from '@party/protocol';
import type { ProfileInput } from '../services/types';

interface ProfileFormProps {
  value: ProfileInput;
  onChange: (value: ProfileInput) => void;
  idPrefix: string;
}

export function ProfileForm({ value, onChange, idPrefix }: ProfileFormProps) {
  return (
    <div className="profile-form">
      <label className="field-label" htmlFor={`${idPrefix}-nickname`}>你的昵称</label>
      <input
        id={`${idPrefix}-nickname`}
        className="text-input"
        value={value.nickname}
        onChange={(event) => onChange({ ...value, nickname: event.target.value })}
        placeholder="朋友会怎么称呼你？"
        maxLength={12}
        autoComplete="nickname"
        autoFocus
      />
      <fieldset className="avatar-fieldset">
        <legend className="field-label">挑一个你的派对分身</legend>
        <div className="avatar-picker">
          {AVATARS.map((avatar) => (
            <button
              key={avatar}
              type="button"
              className={`avatar-option ${value.avatar === avatar ? 'is-selected' : ''}`}
              onClick={() => onChange({ ...value, avatar })}
              aria-label={`选择 ${avatar}`}
              aria-pressed={value.avatar === avatar}
            >{avatar}</button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
