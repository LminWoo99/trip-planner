import {
  Bed, Bus, Camera, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Coffee,
  Footprints, Plane, ShoppingBag, Sparkles, Sun, UtensilsCrossed, type LucideIcon,
} from "lucide-react";
import type { Category } from "../domain/types";

export const CATEGORY_ICON: Readonly<Record<Category, LucideIcon>> = {
  flight: Plane, move: Bus, stay: Bed, food: UtensilsCrossed, cafe: Coffee,
  sight: Camera, trek: Footprints, shop: ShoppingBag, etc: Sparkles,
};

export const WEATHER_ICON: Readonly<Record<string, LucideIcon>> = {
  sun: Sun, "cloud-sun": CloudSun, cloud: Cloud, "cloud-fog": CloudFog, "cloud-drizzle": CloudDrizzle,
  "cloud-rain": CloudRain, "cloud-snow": CloudSnow, "cloud-lightning": CloudLightning,
};
