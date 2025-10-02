import { type UrlType } from '../utils/detectUrlType';

export type Bookmark = {
  id: string
  title: string
  url: string
  urlType: UrlType
  tags: string[]
  note: string
  savedAt: string
}

export const seedBookmarks: Bookmark[] = [
  {
    id: 'til-vite-aliases',
    title: 'Speed up your Vite projects with path aliases',
    url: 'https://vite.dev/guide/features.html#path-aliases',
    urlType: 'Generic',
    tags: ['vite', 'frontend', 'productivity'],
    note: 'Quick reference for setting up @ alias in Vite config.',
    savedAt: '2024-07-02T10:15:00.000Z',
  },
  {
    id: 'article-css-clamp',
    title: 'Responsive typography with clamp()',
    url: 'https://web.dev/min-max-clamp/',
    urlType: 'Generic',
    tags: ['css', 'design'],
    note: 'Explains how to use clamp() for type scales that adapt to viewport.',
    savedAt: '2024-08-15T08:02:00.000Z',
  },
  {
    id: 'doc-aria-patterns',
    title: 'ARIA Authoring Practices Guide',
    url: 'https://www.w3.org/WAI/ARIA/apg/',
    urlType: 'Generic',
    tags: ['accessibility', 'reference'],
    note: 'Great resource for common widget patterns; check combobox behavior.',
    savedAt: '2024-05-28T21:30:00.000Z',
  },
  {
    id: 'repo-zustand',
    title: 'Zustand State Management',
    url: 'https://github.com/pmndrs/zustand',
    urlType: 'GitHub',
    tags: ['state', 'react'],
    note: 'Simple global store—consider for future state sharing if app grows.',
    savedAt: '2024-09-04T14:45:00.000Z',
  },
  {
    id: 'blog-dark-mode-css',
    title: 'Prefers-color-scheme: Dark Mode in CSS',
    url: 'https://css-tricks.com/dark-mode/',
    urlType: 'Generic',
    tags: ['css', 'ui'],
    note: 'Covers toggles and system preference detection; useful for theme switch.',
    savedAt: '2024-06-11T12:10:00.000Z',
  },
]
