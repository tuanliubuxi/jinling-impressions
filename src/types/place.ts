export type SourceRef = { title: string; url: string };

export type Place = {
  id: string;
  name: string;
  category: "历史遗迹" | "山水风景" | "街巷人文" | "城市地标";
  image: string;
  description: string;
  region: string;
  themes: string[];
  history: string[];
  highlights: { title: string; detail: string }[];
  walk: string[];
  practical: {
    durationMinutes: [number, number];
    effort: "轻松" | "适中" | "较高";
    bestTime: string;
    arrival: string;
    ticket: string;
    reminder: string;
  };
  foodNote: string;
  nearbyIds: string[];
  sources: SourceRef[];
};
