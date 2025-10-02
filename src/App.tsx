import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { seedBookmarks, type Bookmark } from './data/bookmarks'
import { detectUrlType } from './utils/detectUrlType'

const APPS_SCRIPT_URL = 'https://script.google.com/a/macros/redhat.com/s/AKfycbxVd66ZRyaNza1dW2hIj32OMozp_WpgJiuOydxxVuPvCLEDOG-L0fqUvtLfIoKNjyLrCA/exec';

type Filters = {
  search: string
  tag: string
}

type StatusTone = 'idle' | 'success' | 'error'

type FormFields = {
  title: string
  url: string
  tags: string
  note: string
}

const STORAGE_KEY = 'til-bookmarks'
const DRAFT_KEY = `${STORAGE_KEY}-draft`

const defaultFormFields: FormFields = {
  title: '',
  url: '',
  tags: '',
  note: '',
}

const formatDate = (isoDate: string) => {
  const formatter = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return formatter.format(new Date(isoDate))
}

const getHostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch (error) {
    console.warn('Invalid bookmark URL encountered:', url, error)
    return url
  }
}

const loadUserBookmarks = (): Bookmark[] => {
  const raw = localStorage.getItem(STORAGE_KEY)

  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter((item): item is Partial<Bookmark> & Record<string, unknown> => {
        return typeof item === 'object' && item !== null && 'title' in item && 'url' in item
      })
      .map((item) => {
        const tags = Array.isArray(item.tags)
          ? item.tags.filter((tag: unknown): tag is string =>
              typeof tag === 'string' && tag.trim().length > 0,
            )
          : []

        const note = typeof item.note === 'string' ? item.note : ''

        const savedAt =
          typeof item.savedAt === 'string' && !Number.isNaN(Date.parse(item.savedAt))
            ? item.savedAt
            : new Date().toISOString()

        return {
          id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
          title: String(item.title).trim() || 'Untitled',
          url: String(item.url).trim(),
          urlType: item.urlType ?? detectUrlType(String(item.url).trim()), // Backfill missing urlType
          tags,
          note,
          savedAt,
        }
      })
      .filter((item) => {
        try {
          new URL(item.url)
          return true
        } catch {
          return false
        }
      })
  } catch (error) {
    console.warn('Failed to parse stored bookmarks', error)
    return []
  }
}

const dedupeById = (bookmarks: Bookmark[]) => {
  const seen = new Set<string>()
  const deduped: Bookmark[] = []

  for (const bookmark of bookmarks) {
    if (seen.has(bookmark.id)) {
      continue
    }

    seen.add(bookmark.id)
    deduped.push(bookmark)
  }

  return deduped
}

const App = () => {
  const [filters, setFilters] = useState<Filters>({ search: '', tag: '' })
  const [userBookmarks, setUserBookmarks] = useState<Bookmark[]>(() => loadUserBookmarks())
  const [formFields, setFormFields] = useState<FormFields>(defaultFormFields)
  const [isFormVisible, setIsFormVisible] = useState(false)
  const [isAutofilling, setIsAutofilling] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: StatusTone }>({
    message: '',
    tone: 'idle',
  })

  const statusTimeoutRef = useRef<number>()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  const setStatusMessage = useCallback(
    (message: string, tone: StatusTone = 'idle') => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current)
      }

      setStatus({ message, tone })

      if (tone !== 'idle' && message) {
        const timeout = tone === 'error' ? 4000 : 2500
        statusTimeoutRef.current = window.setTimeout(() => {
          setStatus({ message: '', tone: 'idle' })
        }, timeout)
      }
    },
    [setStatus],
  )

  const toggleForm = useCallback(
    (nextVisible?: boolean) => {
      setIsFormVisible((previous) => {
        const next = typeof nextVisible === 'boolean' ? nextVisible : !previous

        if (!next) {
          setFormFields(defaultFormFields)
          setStatusMessage('')
        }

        return next
      })
    },
    [setStatusMessage],
  )

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        window.clearTimeout(statusTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userBookmarks))
  }, [userBookmarks])

  useEffect(() => {
    if (!isFormVisible) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [isFormVisible])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isFormVisible) {
          toggleForm(false)
          return
        }

        if (filters.search) {
          setFilters((previous) => ({ ...previous, search: '' }))
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filters.search, isFormVisible, toggleForm])

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY)

    if (!raw) {
      return
    }

    try {
      const parsed = JSON.parse(raw) as Partial<FormFields>
      setFormFields((previous) => ({
        title: typeof parsed.title === 'string' ? parsed.title : previous.title,
        url: typeof parsed.url === 'string' ? parsed.url : previous.url,
        tags: typeof parsed.tags === 'string' ? parsed.tags : previous.tags,
        note: typeof parsed.note === 'string' ? parsed.note : previous.note,
      }))
      setStatusMessage('Draft restored from cache.', 'success')
    } catch (error) {
      console.error('Failed to parse bookmark draft', error)
    }
  }, [setStatusMessage])

  const combinedBookmarks = useMemo(() => {
    const seedIds = new Set(seedBookmarks.map((bookmark) => bookmark.id))
    const filteredUser = userBookmarks.filter((bookmark) => !seedIds.has(bookmark.id))
    const merged = dedupeById([...seedBookmarks, ...filteredUser])

    return merged.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
  }, [userBookmarks])

  const availableTags = useMemo(() => {
    const tags = new Set<string>()

    combinedBookmarks.forEach((bookmark) => {
      bookmark.tags.forEach((tag) => tags.add(tag))
    })

    return Array.from(tags).sort((a, b) => a.localeCompare(b))
  }, [combinedBookmarks])

  const filteredBookmarks = useMemo(() => {
    const search = filters.search.trim().toLowerCase()
    const tag = filters.tag

    return combinedBookmarks.filter((bookmark) => {
      const matchesTag = !tag || bookmark.tags.includes(tag)

      if (!search) {
        return matchesTag
      }

      const haystack = [
        bookmark.title,
        bookmark.note,
        bookmark.tags.join(' '),
        getHostname(bookmark.url),
      ]
        .join(' ')
        .toLowerCase()

      return matchesTag && haystack.includes(search)
    })
  }, [combinedBookmarks, filters])

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFilters((previous) => ({ ...previous, search: event.target.value }))
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && filters.search) {
      event.preventDefault()
      setFilters((previous) => ({ ...previous, search: '' }))
    }
  }

  const handleTagChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setFilters((previous) => ({ ...previous, tag: event.target.value }))
  }

  const handleClearFilters = () => {
    setFilters({ search: '', tag: '' })
  }

  const handleFieldChange = (
    field: keyof FormFields,
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = event.target.value
    setFormFields((previous) => ({ ...previous, [field]: value }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const title = formFields.title.trim()
    let url = formFields.url.trim()
    const tags = formFields.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
    const note = formFields.note.trim()

    if (!title) {
      setStatusMessage('Please provide a title.', 'error')
      titleInputRef.current?.focus()
      return
    }

    if (!url) {
      setStatusMessage('Please provide a URL.', 'error')
      return
    }

    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }

    try {
      new URL(url)
    } catch {
      setStatusMessage('That URL looks invalid. Double-check and try again.', 'error')
      return
    }

    const newBookmark: Bookmark = {
      id: crypto.randomUUID(),
      title,
      url,
      urlType: detectUrlType(url), // Detect type on creation
      tags,
      note,
      savedAt: new Date().toISOString(),
    }

    setUserBookmarks((previous) => [newBookmark, ...previous])
    localStorage.removeItem(DRAFT_KEY)
    setFormFields(defaultFormFields)
    setStatusMessage('Bookmark saved!', 'success')
    toggleForm(false)
  }

  const handleSaveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formFields))
    setStatusMessage('Draft saved locally.', 'success')
  }

  const handleRestoreDraft = () => {
    const raw = localStorage.getItem(DRAFT_KEY)

    if (!raw) {
      setStatusMessage('No draft saved yet.', 'error')
      return
    }

    try {
      const parsed = JSON.parse(raw) as FormFields
      setFormFields(parsed)
      setStatusMessage('Draft restored.', 'success')
    } catch (error) {
      console.error('Failed to restore draft', error)
      setStatusMessage('Draft was corrupted; please save again.', 'error')
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      if (!Array.isArray(parsed)) {
        setStatusMessage('Import failed: expected an array of bookmarks.', 'error')
        return
      }

      const imported: Bookmark[] = []

      parsed.forEach((entry) => {
        if (typeof entry !== 'object' || entry === null) {
          return
        }

        const title = typeof entry.title === 'string' ? entry.title.trim() : ''
        const url = typeof entry.url === 'string' ? entry.url.trim() : ''
        const note = typeof entry.note === 'string' ? entry.note.trim() : ''
        const tags = Array.isArray(entry.tags)
          ? entry.tags.filter((tag: unknown): tag is string =>
              typeof tag === 'string' && tag.trim().length > 0,
            )
          : []
        const savedAt =
          typeof entry.savedAt === 'string' && !Number.isNaN(Date.parse(entry.savedAt))
            ? entry.savedAt
            : new Date().toISOString()

        if (!title || !url) {
          return
        }

        try {
          new URL(url)
        } catch {
          return
        }

        imported.push({
          id: typeof entry.id === 'string' ? entry.id : crypto.randomUUID(),
          title,
          url,
          urlType: detectUrlType(url), // Detect type on import
          tags,
          note,
          savedAt,
        })
      })

      if (imported.length === 0) {
        setStatusMessage('Import completed, but no valid bookmarks were found.', 'error')
        return
      }

      setUserBookmarks((previous) => {
        const merged = dedupeById([...imported, ...previous])
        return merged.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
      })
      setStatusMessage(`Imported ${imported.length} bookmark(s).`, 'success')
    } catch (error) {
      console.error('Failed to import bookmarks', error)
      setStatusMessage('Import failed. Ensure the JSON is valid.', 'error')
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleExport = () => {
    if (userBookmarks.length === 0) {
      setStatusMessage('No personal bookmarks to export yet.', 'error')
      return
    }

    const data = JSON.stringify(userBookmarks, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const downloadLink = document.createElement('a')
    downloadLink.href = url
    downloadLink.download = `til-bookmarks-${new Date().toISOString().slice(0, 10)}.json`

    document.body.append(downloadLink)
    downloadLink.click()
    downloadLink.remove()

    URL.revokeObjectURL(url)
    setStatusMessage('Export ready! Check your downloads.', 'success')
  }

  const handleAutofill = async () => {
    const url = formFields.url.trim();
    if (!url) {
      setStatusMessage('Please provide a URL to auto-fill from.', 'error');
      return;
    }

    setIsAutofilling(true);
    setStatusMessage('Fetching details...', 'idle');

    try {
      const fetchUrl = `${APPS_SCRIPT_URL}?url=${encodeURIComponent(url)}`;
      const response = await fetch(fetchUrl);
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'The script returned an error.');
      }

      setFormFields(prev => ({
        ...prev,
        title: data.summary || prev.title, // Use summary as title
        tags: data.tags || prev.tags,
        note: `"${data.summary}"` || prev.note // Prepend summary to note
      }));

      setStatusMessage('Content auto-filled successfully!', 'success');

    } catch (error) {
      console.error('Auto-fill failed:', error);
      setStatusMessage(`Auto-fill failed: ${error.message}`, 'error');
    } finally {
      setIsAutofilling(false);
    }
  };

  const resultsCount = filteredBookmarks.length
  const countLabel = resultsCount === 1 ? 'bookmark' : 'bookmarks'

  return (
    <main className="layout">
      <header className="layout__hero">
        <div>
          <h1>Today I Bookmarked</h1>
          <p className="layout__subtitle">
            A living collection of things worth revisiting—docs, tools, and small lessons.
          </p>
        </div>

        <section className="filters" aria-label="Bookmark filters">
          <div className="filters__fields">
            <label className="filters__field">
              <span>Search</span>
              <input
                type="search"
                name="search"
                placeholder="Search title, tags, or notes…"
                autoComplete="off"
                value={filters.search}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
              />
            </label>

            <label className="filters__field">
              <span>Filter by tag</span>
              <select name="tag" value={filters.tag} onChange={handleTagChange}>
                <option value="">All tags</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="filters__actions">
            <span className="filters__count">
              {resultsCount} {countLabel}
            </span>

            <button
              type="button"
              className="button button--ghost filters__import-button"
              onClick={handleImportClick}
            >
              Import JSON
            </button>
            <button
              type="button"
              className="button button--ghost filters__export-button"
              onClick={handleExport}
            >
              Export JSON
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              hidden
              onChange={handleImport}
            />

            <button
              type="button"
              className={`button filters__add-button ${
                isFormVisible ? 'button--secondary' : 'button--primary'
              }`}
              onClick={() => toggleForm()}
            >
              {isFormVisible ? 'Close form' : 'Add bookmark'}
            </button>
          </div>
        </section>
      </header>

      <section className="bookmark-form" data-visible={isFormVisible} aria-hidden={!isFormVisible}>
        <h2>Save a new bookmark</h2>
        <p className="bookmark-form__hint">
          Fill in the details below. Tags can be comma separated, like “css, vite”.
        </p>

        <form className="bookmark-form__body" onSubmit={handleSubmit} noValidate>
          <div className="bookmark-form__fields">
            <label className="bookmark-form__field">
              <span>Title</span>
              <input
                ref={titleInputRef}
                name="title"
                type="text"
                placeholder="Awesome article"
                required
                value={formFields.title}
                onChange={(event) => handleFieldChange('title', event)}
              />
            </label>

            <label className="bookmark-form__field">
              <span>URL</span>
              <div className="input-with-button">
                <input
                  name="url"
                  type="url"
                  placeholder="https://example.com"
                  required
                  value={formFields.url}
                  onChange={(event) => handleFieldChange('url', event)}
                />
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleAutofill}
                  disabled={isAutofilling}
                >
                  {isAutofilling ? 'Fetching...' : 'Auto-fill'}
                </button>
              </div>
            </label>

            <label className="bookmark-form__field">
              <span>Tags</span>
              <input
                name="tags"
                type="text"
                placeholder="design, vite, docs"
                value={formFields.tags}
                onChange={(event) => handleFieldChange('tags', event)}
              />
            </label>

            <label className="bookmark-form__field bookmark-form__field--wide">
              <span>Note</span>
              <textarea
                name="note"
                placeholder="Why did this matter? What should future you remember?"
                value={formFields.note}
                onChange={(event) => handleFieldChange('note', event)}
              />
            </label>
          </div>

          <div className="bookmark-form__actions">
            <button type="submit" className="button button--primary">
              Save bookmark
            </button>
            <button
              type="button"
              className="button button--secondary bookmark-form__cancel"
              onClick={() => toggleForm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button button--ghost bookmark-form__cache"
              onClick={handleSaveDraft}
            >
              Save draft
            </button>
            <button
              type="button"
              className="button button--ghost bookmark-form__restore"
              onClick={handleRestoreDraft}
            >
              Restore draft
            </button>
          </div>

          <p
            className={`bookmark-form__status ${
              status.tone === 'error'
                ? 'is-error'
                : status.tone === 'success'
                  ? 'is-success'
                  : ''
            }`}
            role="status"
            aria-live="polite"
          >
            {status.message}
          </p>
        </form>
      </section>

      <section className="bookmark-grid" aria-live="polite">
        {filteredBookmarks.length === 0 ? (
          <div className="bookmark-empty">
            <p>No bookmarks match right now.</p>
            <button
              type="button"
              className="button button--secondary bookmark-empty__reset"
              onClick={handleClearFilters}
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredBookmarks.map((bookmark) => (
            <article key={bookmark.id} className="bookmark-card" data-bookmark-id={bookmark.id}>
              <header className="bookmark-card__header">
                <h2 className="bookmark-card__title">
                  <a href={bookmark.url} target="_blank" rel="noreferrer noopener">
                    {bookmark.title}
                  </a>
                </h2>
                <span className="bookmark-card__host">{getHostname(bookmark.url)}</span>
              </header>

              <div className="bookmark-card__meta">
                <span className={`bookmark-card__type type--${bookmark.urlType.toLowerCase().replace(' ', '-')}`}>
                  {bookmark.urlType}
                </span>
              </div>

              <p
                className={`bookmark-card__note ${
                  bookmark.note.trim() ? '' : 'bookmark-card__note--muted'
                }`}
              >
                {bookmark.note.trim() ? bookmark.note : 'No notes yet.'}
              </p>

              <footer className="bookmark-card__footer">
                <time dateTime={bookmark.savedAt}>Saved {formatDate(bookmark.savedAt)}</time>
                <div className="bookmark-card__tags">
                  {(bookmark.tags.length > 0 ? bookmark.tags : ['untagged']).map((tag) => (
                    <span
                      key={`${bookmark.id}-${tag}`}
                      className={`bookmark-tag ${bookmark.tags.length === 0 ? 'bookmark-tag--empty' : ''}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </footer>
            </article>
          ))
        )}
      </section>
    </main>
  )
}

export default App
