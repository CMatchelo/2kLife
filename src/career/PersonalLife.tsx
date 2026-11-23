import type { SocialMedia } from "../types/social-media";
export default function PersonalLife({
  socialMedia,
}: {
  socialMedia: SocialMedia;
}) {
  const latest = socialMedia.history.at(-1);
  const format = new Intl.NumberFormat("en-US");
  return (
    <section aria-labelledby="followers-title" className="space-y-3">
      <h3 id="followers-title" className="season-heading border-b-2">Followers</h3>
      <div className="flex flex-wrap items-baseline gap-3" aria-live="polite">
        <span className="text-3xl font-black">
          {format.format(socialMedia.currentFollowers)}
        </span>
        {latest && (
          <span
            className={`font-semibold ${latest.change > 0 ? "text-emerald-300" : latest.change < 0 ? "text-red-300" : "text-muted"}`}
          >
            {latest.change > 0 ? "+" : ""}
            {format.format(latest.change)}
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
      {socialMedia.history.length > 0 && (
        <details className="text-sm">
          <summary className="season-details">
            View follower history
          </summary>
          <ol className="mt-3 divide-y divide-divider border-t border-divider">
            {[...socialMedia.history].reverse().map((entry, index) => (
              <li
                key={`${entry.date}-${entry.reason}-${index}`}
                className="flex justify-between gap-4 py-2"
              >
                <span className="text-muted">
                  {entry.date} · {entry.reason}
                </span>
                <strong
                  className={
                    entry.change >= 0 ? "text-emerald-300" : "text-red-300"
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
