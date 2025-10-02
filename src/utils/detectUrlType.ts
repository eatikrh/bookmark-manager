export type UrlType =
  | 'Google Doc'
  | 'Google Sheet'
  | 'Miro Board'
  | 'GitHub'
  | 'ServiceNow'
  | 'Red Hat Source'
  | 'Generic'; // A fallback

interface DetectionRule {
  name: UrlType;
  matches: (url: URL) => boolean;
}

const rules: DetectionRule[] = [
  {
    name: 'Google Doc',
    matches: (url) =>
      url.hostname === 'docs.google.com' && url.pathname.startsWith('/document/'),
  },
  {
    name: 'Google Sheet',
    matches: (url) =>
      url.hostname === 'docs.google.com' && url.pathname.startsWith('/spreadsheets/'),
  },
  {
    name: 'Miro Board',
    matches: (url) =>
      url.hostname.endsWith('miro.com') && url.pathname.startsWith('/app/board/'),
  },
  {
    name: 'GitHub',
    matches: (url) => url.hostname === 'github.com',
  },
  {
    name: 'ServiceNow',
    matches: (url) => url.hostname.endsWith('.service-now.com'),
  },
  {
    name: 'Red Hat Source',
    matches: (url) => url.hostname === 'source.redhat.com',
  },
];

export function detectUrlType(urlString: string): UrlType {
  try {
    const url = new URL(urlString);
    const foundRule = rules.find((rule) => rule.matches(url));
    return foundRule ? foundRule.name : 'Generic';
  } catch {
    return 'Generic';
  }
}
