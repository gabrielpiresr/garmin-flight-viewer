import type { ReactNode } from "react";
import type { WindyOverlayId } from "./windyEmbed";

function IconShell({ children, className = "h-3.5 w-3.5" }: { children: ReactNode; className?: string }) {
  return (
    <svg className={`${className} shrink-0`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

export function WindyOverlayIcon({
  id,
  className = "h-3.5 w-3.5",
}: {
  id: WindyOverlayId;
  className?: string;
}) {
  const shell = (children: ReactNode) => <IconShell className={className}>{children}</IconShell>;

  switch (id) {
    case "clouds":
      return shell(<path d="M6.5 15.5h8a3.5 3.5 0 00.4-6.98A4.5 4.5 0 008.2 6.1 3.5 3.5 0 006.5 15.5z" />);
    case "satellite":
      return shell(
        <path d="M12.8 3.2a1.1 1.1 0 011.55 1.55l-.7.7 1.6 1.6a1 1 0 11-1.4 1.4l-1.6-1.6-.7.7A1.1 1.1 0 019.6 5.9l.7-.7-3.8 3.8a2.2 2.2 0 000 3.1l.35.35-2.6 2.6a1 1 0 101.4 1.4l2.6-2.6.35.35a2.2 2.2 0 003.1 0l3.8-3.8-.7.7z" />,
      );
    case "rain":
      return shell(
        <>
          <path d="M6.2 10.2a3.3 3.3 0 01.2-6.55A4.2 4.2 0 0113.9 5a3 3 0 011.1 5.8H6.2z" />
          <path
            d="M7.2 12.2l-.7 2.2M10 12.4l-.7 2.2M12.8 12.2l-.7 2.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            fill="none"
          />
        </>,
      );
    case "rainAccu":
      return shell(<path d="M10 3.2c2.4 3.1 4.3 5.5 4.3 7.6a4.3 4.3 0 11-8.6 0c0-2.1 1.9-4.5 4.3-7.6z" />);
    case "radar":
      return shell(
        <path
          fillRule="evenodd"
          d="M10 2.5a7.5 7.5 0 015.4 12.7l-1.2-1.2A5.8 5.8 0 0010 4.2a5.8 5.8 0 00-4.2 9.8l-1.2 1.2A7.5 7.5 0 0110 2.5zm0 3.5a4 4 0 012.9 6.8l-1.2-1.2A2.4 2.4 0 0010 7.6a2.4 2.4 0 00-1.7 4l-1.2 1.2A4 4 0 0110 6zm0 3.5a1 1 0 011 1v5.5a1 1 0 11-2 0V10.5a1 1 0 011-1z"
          clipRule="evenodd"
        />,
      );
    case "thunder":
      return shell(<path d="M11.2 2.5L5.5 11h3.2l-.9 6.5L14.5 9h-3.1l.8-6.5z" />);
    case "wind":
      return shell(
        <path
          d="M3.5 7.5h9.2a2.2 2.2 0 100-4.4M3.5 10.5h11a2.4 2.4 0 110 4.8M3.5 13.5h6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />,
      );
    case "gust":
      return shell(
        <>
          <path
            d="M3 6.5h10a2 2 0 100-4M3 10h12.5a2.3 2.3 0 110 4.6M3 13.5h7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M14.5 14.2l2 1.6-2.4.4 1.2 2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>,
      );
    case "temp":
      return shell(
        <>
          <path d="M8.4 11.2V4.8a1.6 1.6 0 113.2 0v6.4a2.8 2.8 0 11-3.2 0z" />
          <circle cx="10" cy="14.2" r="1.5" fill="rgb(15 23 42)" />
        </>,
      );
    case "dewpoint":
      return shell(
        <>
          <path d="M10 3.5c2.1 2.7 3.7 4.8 3.7 6.6a3.7 3.7 0 11-7.4 0c0-1.8 1.6-3.9 3.7-6.6z" />
          <path d="M8.4 12.2h3.2" stroke="rgb(15 23 42)" strokeWidth="1.3" strokeLinecap="round" />
        </>,
      );
    case "rh":
      return shell(
        <path d="M7.2 4.2c1.5 1.9 2.6 3.4 2.6 4.6a2.6 2.6 0 11-5.2 0c0-1.2 1.1-2.7 2.6-4.6zM14.2 8.2c1.2 1.5 2.1 2.7 2.1 3.7a2.1 2.1 0 11-4.2 0c0-1 .9-2.2 2.1-3.7z" />,
      );
    case "visibility":
      return shell(
        <path
          fillRule="evenodd"
          d="M10 4.2c3.7 0 6.7 2.4 7.8 5.8-1.1 3.4-4.1 5.8-7.8 5.8S3.3 13.4 2.2 10C3.3 6.6 6.3 4.2 10 4.2zm0 2.3a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm0 1.6a1.9 1.9 0 110 3.8 1.9 1.9 0 010-3.8z"
          clipRule="evenodd"
        />,
      );
    case "fog":
      return shell(
        <>
          <path
            d="M3.5 8.2h13M4.5 11h11M5.5 13.8h9"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M6.5 6.2a3 3 0 015.5-1.1A2.6 2.6 0 0115 7.8H6.6a2 2 0 01-.1-1.6z" opacity="0.85" />
        </>,
      );
    case "cape":
      return shell(<path d="M10.8 2.8L4.8 12h3.4L7.4 17.5 15.2 8.8H11.6l.6-6z" />);
    case "pressure":
      return shell(
        <>
          <path
            d="M4 14.5c2.2-4 4.4-6 6-6s3.8 2 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path d="M10 4.2v4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="10" cy="14.5" r="1.4" />
        </>,
      );
    default:
      return null;
  }
}

export function WindyIsobarsIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <IconShell className={className}>
      <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10" cy="10" r="1.1" />
    </IconShell>
  );
}
