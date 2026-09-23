// Local design-review fixtures only. They are never loaded as user content.
export type SavedItem = {
  id: string; source: string; type: "Video" | "Short" | "Reel" | "Post" | "Article";
  title: string; creator: string; image: string; alt: string; duration?: string;
  savedAt: string; collection: string; canonicalUrl: string; tags: string[];
};

export const savedItems: SavedItem[] = [
  { id: "s1", source: "YouTube", type: "Video", title: "A slower way to make things", creator: "Field Notes", image: "/preview-media/studio.svg", alt: "Sunlit creative studio with desk and plants", duration: "12:42", savedAt: "Sep 14", collection: "Creative practice", canonicalUrl: "https://example.com/sample/studio", tags: ["process", "design"] },
  { id: "s2", source: "Instagram", type: "Reel", title: "Small corners of the city", creator: "Maya Haddad", image: "/preview-media/city.svg", alt: "Warm-toned illustration of a city street and buildings", duration: "0:28", savedAt: "Sep 12", collection: "Places", canonicalUrl: "https://example.com/sample/city", tags: ["places"] },
  { id: "s3", source: "YouTube", type: "Short", title: "A recipe worth keeping", creator: "The Daily Table", image: "/preview-media/table.svg", alt: "Table set with a bowl, cup, and fruit", duration: "0:54", savedAt: "Sep 11", collection: "Recipes", canonicalUrl: "https://example.com/sample/table", tags: ["food"] },
  { id: "s4", source: "Web", type: "Article", title: "The case for spaces that let us think", creator: "The Quiet Edit", image: "/preview-media/reading.svg", alt: "Open book beside a window", savedAt: "Sep 9", collection: "Creative practice", canonicalUrl: "https://example.com/sample/reading", tags: ["reading", "design"] },
  { id: "s5", source: "Instagram", type: "Post", title: "Afternoon light in Beirut", creator: "Nour Saleh", image: "/preview-media/coast.svg", alt: "Sunlit Mediterranean coast with buildings", savedAt: "Sep 7", collection: "Places", canonicalUrl: "https://example.com/sample/coast", tags: ["places", "photography"] },
  { id: "s6", source: "YouTube", type: "Video", title: "A garden that grows with time", creator: "Common Ground", image: "/preview-media/garden.svg", alt: "Leafy garden path in warm evening light", duration: "8:16", savedAt: "Sep 4", collection: "Inspiration", canonicalUrl: "https://example.com/sample/garden", tags: ["garden"] },
];

export type Picture = { id: string; src: string; alt: string; date: string; album: string; favorite: boolean; caption: string; dimensions: string };
export const pictures: Picture[] = [
  { id: "p1", src: "/preview-media/coast.svg", alt: "Warm Mediterranean shoreline", date: "September 23", album: "Lebanon", favorite: true, caption: "Late light by the sea", dimensions: "3024 × 4032" },
  { id: "p2", src: "/preview-media/garden.svg", alt: "Leafy garden path", date: "September 23", album: "Little things", favorite: false, caption: "A path through the garden", dimensions: "4032 × 3024" },
  { id: "p3", src: "/preview-media/table.svg", alt: "Breakfast table with fruit", date: "September 23", album: "Little things", favorite: true, caption: "Sunday at home", dimensions: "3024 × 4032" },
  { id: "p7", src: "/preview-media/reading.svg", alt: "Open book at a window", date: "September 23", album: "Little things", favorite: false, caption: "Reading hour", dimensions: "4032 × 3024" },
  { id: "p8", src: "/preview-media/city.svg", alt: "Sunlit street with warm buildings", date: "September 23", album: "Lebanon", favorite: false, caption: "The way back", dimensions: "3024 × 4032" },
  { id: "p4", src: "/preview-media/studio.svg", alt: "Creative desk with plants", date: "September 20", album: "Little things", favorite: false, caption: "An afternoon to make", dimensions: "4032 × 3024" },
  { id: "p5", src: "/preview-media/city.svg", alt: "Quiet city street", date: "September 20", album: "Lebanon", favorite: false, caption: "Walking home", dimensions: "3024 × 4032" },
  { id: "p6", src: "/preview-media/reading.svg", alt: "Book beside a window", date: "September 20", album: "Little things", favorite: true, caption: "A little pause", dimensions: "4032 × 3024" },
  { id: "p9", src: "/preview-media/garden.svg", alt: "Garden path through leafy trees", date: "September 20", album: "Little things", favorite: true, caption: "In the garden", dimensions: "4032 × 3024" },
  { id: "p10", src: "/preview-media/coast.svg", alt: "Coastline in late afternoon light", date: "September 20", album: "Lebanon", favorite: false, caption: "Sea and sky", dimensions: "3024 × 4032" },
];
