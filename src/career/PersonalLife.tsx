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
        <h2
          id="personal-life-title"
          className="text-2xl font-black uppercase tracking-wide"
        >
          Personal Life
        </h2>
        <span
          className="mt-3 block h-1 w-14 rounded-full bg-gold"
          aria-hidden="true"
        />
      </div>
      <p className="text-sm text-muted">
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
            {format.format(latest.change)} after the latest tracked match
          </span>
        )}
      </div>
      {latest ? (
        <p className="text-sm text-muted">
          {latest.date} · {latest.reason}
        </p>
      ) : (
        <p className="text-sm text-muted">
          No match-related follower changes yet.
        </p>
      )}
    </section>
  );
}
