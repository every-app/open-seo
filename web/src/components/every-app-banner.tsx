const EVERY_APP_REPO_URL = "https://github.com/every-app/every-app";

function StarIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

export function EveryAppBanner() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-white/10 bg-[#1b1d1d] px-4 py-2.5 text-center text-sm text-neutral-300">
      <span>Support our new OSS project, EveryApp.</span>
      <a
        href={EVERY_APP_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-1.5 font-medium text-neutral-100 transition-colors hover:text-white"
      >
        <StarIcon />
        <span className="underline decoration-neutral-500 underline-offset-4 transition-colors group-hover:decoration-white">
          Give it a star
        </span>
        <span aria-hidden="true">&rarr;</span>
      </a>
    </div>
  );
}
