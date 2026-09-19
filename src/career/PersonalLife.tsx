import type { SocialMedia } from "../types/social-media";
export default function PersonalLife({
  socialMedia,
}: {
  socialMedia: SocialMedia;
}) {
  const latest = socialMedia.history.at(-1);
  const format = new Intl.NumberFormat("en-US");
  return (
    <section
      className="career-card dashboard-card space-y-3"
      aria-labelledby="personal-life-title"
    >
      <div>
        <h2 id="personal-life-title" className="section-title">
          Personal Life
        </h2>
      </div>
      <p className="supporting-detail">
        Combined followers across all social platforms
      </p>
      <div className="flex flex-wrap items-baseline gap-3" aria-live="polite">
        <span className="text-3xl font-black">
          {format.format(socialMedia.currentFollowers)}
        </span>
        {latest && (
          <span
            className={`font-semibold ${latest.change > 0 ? "text-court-blue" : latest.change < 0 ? "text-court-red" : "text-muted"}`}
          >
            {latest.change > 0 ? "+" : ""}
            {format.format(latest.change)} after the latest tracked activity
          </span>
        )}
      </div>
      {latest ? (
        <p className="text-sm text-muted">
          {latest.date} · {latest.reason}
        </p>
      ) : (
        <p className="text-sm text-muted">No follower changes yet.</p>
      )}
      {socialMedia.history.length > 1 && (
        <details className="nested-panel p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-gold">
            View follower history
          </summary>
          <ol className="mt-3 space-y-2 border-t border-divider pt-3">
            {[...socialMedia.history].reverse().map((entry, index) => (
              <li
                key={`${entry.date}-${entry.reason}-${index}`}
                className="flex justify-between gap-4"
              >
                <span className="text-muted">
                  {entry.date} · {entry.reason}
                </span>
                <strong
                  className={
                    entry.change >= 0 ? "text-court-blue" : "text-court-red"
                  }
                >
                  {entry.change > 0 ? "+" : ""}
                  {format.format(entry.change)}
                </strong>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
