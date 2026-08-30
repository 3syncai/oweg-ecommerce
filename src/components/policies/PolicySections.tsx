import Link from "next/link";
import type { PolicyDocument, PolicySection, PolicySubsection } from "@/content/policies/types";

const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

function renderText(text: string) {
  const parts: (string | { label: string; href: string })[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ label: match[1], href: match[2] });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 1 && typeof parts[0] === "string") {
    return parts[0];
  }

  return parts.map((part, index) =>
    typeof part === "string" ? (
      <span key={index}>{part}</span>
    ) : (
      <Link key={index} href={part.href} className="font-medium text-[var(--oweg-green-dark)] hover:underline">
        {part.label}
      </Link>
    )
  );
}

function Paragraphs({ paragraphs }: { paragraphs?: string[] }) {
  if (!paragraphs?.length) return null;

  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{renderText(paragraph)}</p>
      ))}
    </>
  );
}

function BulletList({ bullets }: { bullets?: string[] }) {
  if (!bullets?.length) return null;

  return (
    <ul className="ml-4 list-outside list-disc space-y-1.5 pl-1">
      {bullets.map((bullet, index) => (
        <li key={index}>{renderText(bullet)}</li>
      ))}
    </ul>
  );
}

function Subsections({ subsections }: { subsections?: PolicySubsection[] }) {
  if (!subsections?.length) return null;

  return (
    <div className="space-y-4">
      {subsections.map((subsection, index) => (
        <div key={index} className="space-y-2">
          {subsection.title ? (
            <h3 className="font-semibold text-[var(--oweg-ink)]">{subsection.title}</h3>
          ) : null}
          <Paragraphs paragraphs={subsection.paragraphs} />
          <BulletList bullets={subsection.bullets} />
        </div>
      ))}
    </div>
  );
}

function SectionBlock({ section }: { section: PolicySection }) {
  return (
    <section className="oweg-surface-card space-y-4 p-5 text-sm leading-relaxed text-[var(--oweg-ink-soft)] sm:p-6">
      <h2 className="text-base font-semibold text-[var(--oweg-ink)] sm:text-lg">{section.title}</h2>
      <Paragraphs paragraphs={section.paragraphs} />
      <BulletList bullets={section.bullets} />
      <Subsections subsections={section.subsections} />
    </section>
  );
}

type PolicySectionsProps = {
  document: PolicyDocument;
};

export function PolicySections({ document }: PolicySectionsProps) {
  return (
    <>
      {document.intro?.length ? (
        <section className="oweg-surface-card space-y-4 p-5 text-sm leading-relaxed text-[var(--oweg-ink-soft)] sm:p-6">
          {document.intro.map((paragraph, index) => (
            <p key={index}>{renderText(paragraph)}</p>
          ))}
        </section>
      ) : null}

      {document.sections.map((section) => (
        <SectionBlock key={section.title} section={section} />
      ))}

      {document.footer ? (
        <div className="rounded-[var(--oweg-radius-lg)] border border-[var(--oweg-border)] bg-[var(--oweg-surface-tint)] p-4 text-center">
          <p className="text-sm font-semibold text-[var(--oweg-green-dark)]">{document.footer}</p>
        </div>
      ) : null}
    </>
  );
}
