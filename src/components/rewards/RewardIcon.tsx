import type { RewardVisual } from "../../types/rewards";
import { DEFAULT_REWARD_ICON_ID, rewardIconExists } from "../../lib/rewardIcons";

type Props = {
  visual?: RewardVisual | null;
  achieved?: boolean;
  schoolColor?: string;
  className?: string;
};

function IconSvg({ id }: { id: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (id) {
    case "flight":
      return <path {...common} d="M3 11.5l18-7-6.5 15-3.2-6.2L3 11.5zm8.3 1.8L21 4.5" />;
    case "solo":
      return <path {...common} d="M12 3v18m-5-4l5 4 5-4M6 8l6-5 6 5M8 12h8" />;
    case "moon":
      return <path {...common} d="M20 15.2A8.5 8.5 0 118.8 4a7 7 0 0011.2 11.2z" />;
    case "instruments":
      return (
        <>
          <circle {...common} cx="12" cy="12" r="8" />
          <path {...common} d="M12 12l4-3m-4 3l-2 5M8 8h.01M16 16h.01M12 6v1" />
        </>
      );
    case "compass":
      return (
        <>
          <circle {...common} cx="12" cy="12" r="8" />
          <path {...common} d="M15.5 8.5l-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2z" />
        </>
      );
    case "landing":
      return <path {...common} d="M4 18h16M5 8l8 6h5.5a1.5 1.5 0 00.7-2.8L7 5.5 5 8zm3.5 2.6l-2 3" />;
    case "takeoff":
      return <path {...common} d="M4 18h16M5 14l12.2-5.7a1.5 1.5 0 011.9.8 1.5 1.5 0 01-.8 1.9L13 13 5 14zm3.5-.8l-2-3" />;
    case "clock":
      return (
        <>
          <circle {...common} cx="12" cy="12" r="8" />
          <path {...common} d="M12 7v5l3 2" />
        </>
      );
    case "streak":
      return <path {...common} d="M12 21c4-2.5 6-5.3 6-8.4 0-2.8-1.5-5-4-6.6-.2 2-1 3.3-2.2 4C11.5 7.7 10.2 5.6 8 4c.3 3.2-.7 4.9-2 6.7C3.8 13.8 5.5 18.4 12 21z" />;
    case "route":
      return <path {...common} d="M5 6a2 2 0 104 0 2 2 0 00-4 0zm10 12a2 2 0 104 0 2 2 0 00-4 0zM7 8c0 5 10 1 10 8" />;
    case "mission":
      return <path {...common} d="M8 5h8M8 12h8M8 19h5M5 5h.01M5 12h.01M5 19h.01" />;
    case "stage":
      return <path {...common} d="M4 17h16M6 17V7l6-3 6 3v10M9 17v-5h6v5" />;
    case "star":
    default:
      return <path {...common} d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" />;
  }
}

export function RewardIcon({ visual, achieved = true, schoolColor = "#10b981", className = "h-10 w-10" }: Props) {
  if (visual?.type === "uploadedImage" && visual.imageUrl) {
    return (
      <img
        src={visual.imageUrl}
        alt=""
        className={`${className} rounded-full object-cover ${achieved ? "" : "grayscale opacity-50"}`}
      />
    );
  }

  const color = visual?.type === "libraryIcon" && visual.colorMode === "custom" && visual.color ? visual.color : schoolColor;
  const iconId = visual?.type === "libraryIcon" && rewardIconExists(visual.iconId) ? visual.iconId : DEFAULT_REWARD_ICON_ID;
  return (
    <svg viewBox="0 0 24 24" className={className} style={{ color: achieved ? color : "#64748b" }} aria-hidden="true">
      <IconSvg id={iconId} />
    </svg>
  );
}
