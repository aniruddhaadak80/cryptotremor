import { Github } from "lucide-react";
import { SITE } from "@/lib/config/site";

/**
 * The one place a GitHub link is rendered. Every surface — desktop nav, mobile
 * menu, landing CTA, footer — uses this component so the repository URL is
 * always the configured one and always opens safely in a new tab.
 */
export function GitHubLink({
  variant = "ghost",
  label = "View source",
  className = "",
}: {
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
  className?: string;
}) {
  const base =
    variant === "primary"
      ? "btn btn-primary"
      : variant === "secondary"
        ? "btn btn-secondary"
        : "btn btn-ghost";
  return (
    <a
      href={SITE.repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} ${className}`.trim()}
      aria-label={`${label}: ${SITE.repoUrl}`}
    >
      <Github className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}