import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/training")({
 head: () => ({ meta: [{ title: "Safety Progress — Pinky Promise" }, { name: "description", content: "Your scam call progress now lives in Progress." }, { property: "og:title", content: "Safety Progress — Pinky Promise" }, { property: "og:description", content: "Track your scam call performance." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
 component: () => <Navigate to="/progress" />,
});
