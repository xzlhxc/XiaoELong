import type { ReleaseAnnouncement } from "../../data/release-announcements";

interface ReleaseAnnouncementDialogProps {
  announcements: ReleaseAnnouncement[];
  heading: string;
  onClose: () => void;
}

export function ReleaseAnnouncementDialog({
  announcements,
  heading,
  onClose
}: ReleaseAnnouncementDialogProps): JSX.Element {
  return (
    <div className="release-announcement-layer" role="dialog" aria-modal="true" aria-label={heading}>
      <section className="release-announcement-card">
        <header className="release-announcement-head">
          <div>
            <small>小鳄龙之家</small>
            <h2>{heading}</h2>
          </div>
          <button
            type="button"
            className="settings-appearance-close"
            aria-label={`关闭${heading}`}
            onClick={onClose}
          />
        </header>
        <div className="release-announcement-list">
          {announcements.map((announcement, index) => (
            <article className="release-announcement-version" key={announcement.version}>
              <header>
                <span className="release-announcement-version-number">v{announcement.version}</span>
                {index === 0 && announcements.length > 1 ? <span className="release-announcement-latest">最新</span> : null}
                <time dateTime={announcement.date}>{announcement.date}</time>
              </header>
              <h3>{announcement.title}</h3>
              {announcement.sections.map((section) => (
                <section className="release-announcement-section" key={section.title}>
                  <h4>{section.title}</h4>
                  <ul>
                    {section.items.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </section>
              ))}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
