export type PolicySubsection = {
  title?: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type PolicySection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  subsections?: PolicySubsection[];
};

export type PolicyDocument = {
  badge: string;
  title: string;
  description?: string;
  intro?: string[];
  sections: PolicySection[];
  footer?: string;
};
