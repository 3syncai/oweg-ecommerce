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
      <Link key={index} href={part.href} className="text-emerald-600 hover:underline">
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
    <ul className="list-disc list-inside space-y-1 ml-4">
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
            <h3 className="font-medium text-gray-900">{subsection.title}</h3>
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
    <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
      <h2 className="font-semibold text-lg text-gray-900">{section.title}</h2>
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
        <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700 leading-relaxed">
          {document.intro.map((paragraph, index) => (
            <p key={index}>{renderText(paragraph)}</p>
          ))}
        </section>
      ) : null}

      {document.sections.map((section) => (
        <SectionBlock key={section.title} section={section} />
      ))}

      {document.footer ? (
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
          <p className="font-semibold text-emerald-800 text-sm">{document.footer}</p>
        </div>
      ) : null}
    </>
  );
}
