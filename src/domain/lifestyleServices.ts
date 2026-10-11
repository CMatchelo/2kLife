import type { IdentityType } from "../types/identity.ts";

export type LifestyleServiceCatalogEntry = {
  id: string;
  name: string;
  identityStyle: IdentityType;
};

export const lifestyleServiceCatalog: LifestyleServiceCatalogEntry[] = [
  { id: "personal-trainer", name: "Personal Trainer", identityStyle: "team" },
  { id: "personal-chef", name: "Personal Chef", identityStyle: "team" },
  { id: "security", name: "Security", identityStyle: "star" },
  { id: "financial-advisor", name: "Financial Advisor", identityStyle: "star" },
  {
    id: "personal-assistant",
    name: "Personal Assistant",
    identityStyle: "fan",
  },
  {
    id: "social-media-manager",
    name: "Social Media Manager",
    identityStyle: "fan",
  },
];
