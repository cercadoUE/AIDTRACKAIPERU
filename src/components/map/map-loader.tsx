"use client";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui";

/** Leaflet usa `window`: se carga solo en el navegador. */
export const ShelterMap = dynamic(() => import("./shelter-map"), { ssr: false, loading: () => <Skeleton className="h-[60vh] w-full" /> });
