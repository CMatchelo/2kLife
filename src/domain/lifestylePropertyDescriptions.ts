const descriptions: Record<string, readonly string[]> = {
  "downtown-personal-gym": [
    "A polished downtown apartment in {city}, featuring a private training studio designed for focused workouts between games.",
    "A modern city residence in {city} with a fully equipped personal gym and easy access to the center of the action.",
    "An athlete-ready apartment above downtown {city}, complete with a dedicated strength and recovery space.",
    "A sleek urban home in {city} where floor-to-ceiling views meet a private gym built for year-round conditioning.",
    "A refined downtown apartment in {city}, offering a professional-quality fitness room without leaving home.",
    "A contemporary high-rise residence in {city} centered around a private gym for disciplined daily training.",
  ],
  "downtown-penthouse": [
    "A statement penthouse above downtown {city}, pairing skyline views with a private suite made for an All-Star lifestyle.",
    "A premium apartment crowning the {city} skyline, with dramatic entertaining spaces and first-class finishes.",
    "An exclusive downtown {city} penthouse where panoramic views and refined interiors create an unmistakable presence.",
    "A top-floor residence in {city} with private elevator access, designer finishes, and a skyline-facing lounge.",
    "A sophisticated penthouse in the heart of {city}, built for privacy, comfort, and high-profile city living.",
    "A landmark apartment overlooking {city}, featuring an expansive penthouse suite and polished contemporary design.",
  ],
  "downtown-rooftop": [
    "A welcoming downtown apartment in {city}, featuring a shared rooftop designed for watch parties and community gatherings.",
    "A connected urban home in {city} with an open-air rooftop where supporters and neighbors can come together.",
    "A bright city apartment in {city}, highlighted by a community rooftop made for relaxed events above the streets.",
    "A downtown {city} residence with an inviting rooftop terrace that turns game nights into neighborhood occasions.",
    "A lively apartment in central {city}, offering a spacious rooftop for public celebrations and local gatherings.",
    "A modern urban residence in {city} with a social rooftop that keeps the player close to the community.",
  ],
  "suburban-half-court": [
    "A spacious suburban home in {city}, featuring a private backyard half-court for drills, runs, and teammate workouts.",
    "A comfortable {city} residence with a competition-grade half-court set into a quiet, landscaped backyard.",
    "An athlete-focused suburban property in {city}, built around a private outdoor court for daily practice.",
    "A relaxed family home outside central {city}, complete with a lighted half-court ready for evening sessions.",
    "A private suburban retreat in {city} where a custom backyard court makes extra practice effortless.",
    "A generous home in a peaceful {city} neighborhood, featuring a dedicated half-court for skill work and team runs.",
  ],
  "suburban-showroom": [
    "A striking suburban home in {city}, featuring a climate-controlled luxury garage designed to display a growing collection.",
    "A refined {city} residence with a glass-fronted automotive showroom and space for the league’s most distinctive rides.",
    "A private suburban property in {city}, anchored by a gallery-style garage worthy of a signature car collection.",
    "A modern home beyond downtown {city}, offering a secure luxury showroom with dramatic lighting and polished finishes.",
    "An impressive suburban residence in {city} where a custom garage turns every arrival into an event.",
    "A secluded {city} home featuring an exhibition-quality garage built for rare cars and memorable entrances.",
  ],
  "suburban-gathering": [
    "A warm suburban home in {city}, featuring a landscaped gathering space designed for neighbors, supporters, and community events.",
    "An inviting {city} residence with an open backyard pavilion that makes local celebrations feel personal.",
    "A community-minded suburban property in {city}, offering flexible indoor-outdoor space for gatherings and outreach.",
    "A welcoming home in a quiet {city} neighborhood, centered around a generous social space for fans and families.",
    "A relaxed suburban retreat in {city} with a covered gathering area suited to watch parties and neighborhood events.",
    "A spacious {city} home whose landscaped event space creates a natural meeting place for the local community.",
  ],
  "estate-full-court": [
    "A commanding luxury estate in {city}, featuring a private full-size basketball court built for professional-level preparation.",
    "An elite {city} compound with a regulation court, dedicated training areas, and complete privacy between games.",
    "A premier estate in {city} where a full indoor court supports serious workouts in every season.",
    "A secluded luxury property in {city}, anchored by a competition-grade court created for complete basketball development.",
    "An exceptional {city} residence with a full-size private court, viewing area, and space for offseason team runs.",
    "A performance-driven estate in {city}, offering a professional court complex steps from the main residence.",
  ],
  "estate-helipad": [
    "A landmark luxury estate in {city}, featuring a private helipad for discreet arrivals and effortless travel.",
    "An exclusive {city} compound where expansive grounds, commanding architecture, and a private helipad define star living.",
    "A prestigious estate overlooking {city}, designed around privacy, dramatic entertaining spaces, and direct air access.",
    "A showpiece residence in {city} with a private helipad that makes every arrival worthy of a franchise icon.",
    "A secluded luxury property in {city}, pairing resort-level amenities with a dedicated helipad for a demanding schedule.",
    "An unmistakable {city} estate whose private aviation access and bold design deliver true superstar presence.",
  ],
  "estate-pavilion": [
    "A grand luxury estate in {city}, featuring a dedicated event pavilion for charity programs and unforgettable community celebrations.",
    "A welcoming {city} compound with a private pavilion designed to host supporters, fundraisers, and youth events.",
    "An expansive estate in {city} where a landscaped public-event pavilion brings major community projects home.",
    "A distinguished {city} residence with a flexible gathering pavilion suited to camps, celebrations, and charitable occasions.",
    "A community-focused luxury property in {city}, offering a purpose-built event space with room for meaningful local programs.",
    "A remarkable estate in {city} whose open-air pavilion creates a memorable setting for fans and neighborhood initiatives.",
  ],
};

function stableIndex(value: string, length: number) {
  let hash = 0;
  for (const character of value)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % length;
}

export function lifestylePropertyDescription(
  propertyId: string,
  cityId: string,
  cityName: string,
) {
  const options = descriptions[propertyId];
  if (!options?.length)
    return (
      "A distinctive " + cityName + " residence prepared for life in the NBA."
    );
  return options[
    stableIndex(cityId + ":" + propertyId, options.length)
  ].replaceAll("{city}", cityName);
}

const allDescriptions = Object.values(descriptions).flat();
if (
  allDescriptions.length !== 54 ||
  new Set(allDescriptions).size !== allDescriptions.length
)
  throw new Error(
    "Lifestyle properties require exactly 54 unique descriptions.",
  );
