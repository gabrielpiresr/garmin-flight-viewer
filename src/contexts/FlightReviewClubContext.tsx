import { createContext, useContext, type ReactNode } from "react";

export type FlightReviewClubContextValue = {
  enabled: boolean;
  isClubMember: boolean;
  lpUrl: string;
  ctaSubscriptionUrl: string;
  trialFlightCount: number;
  benefits: string[];
};

const FlightReviewClubContext = createContext<FlightReviewClubContextValue>({
  enabled: false,
  isClubMember: false,
  lpUrl: "/flight-review-club",
  ctaSubscriptionUrl: "",
  trialFlightCount: 0,
  benefits: [],
});

export function FlightReviewClubProvider({
  value,
  children,
}: {
  value: FlightReviewClubContextValue;
  children: ReactNode;
}) {
  return <FlightReviewClubContext.Provider value={value}>{children}</FlightReviewClubContext.Provider>;
}

export function useFlightReviewClub(): FlightReviewClubContextValue {
  return useContext(FlightReviewClubContext);
}
