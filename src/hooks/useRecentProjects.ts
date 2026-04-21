import { useState, useCallback } from 'react'

const STORAGE_KEY = 'feemo-recent-v1'
const MAX_RECENT = 10

export interface RecentProject {
  name: string
  filePath: string
  savedAt: number // timestamp ms
}

function load(): RecentProject[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(list: RecentProject[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function useRecentProjects() {
  const [recents, setRecents] = useState<RecentProject[]>(load)

  const addRecent = useCallback((filePath: string) => {
    const name = filePath.split('/').pop() ?? filePath
    setRecents(prev => {
      const filtered = prev.filter(r => r.filePath !== filePath)
      const next = [{ name, filePath, savedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT)
      save(next)
      return next
    })
  }, [])

  const removeRecent = useCallback((filePath: string) => {
    setRecents(prev => {
      const next = prev.filter(r => r.filePath !== filePath)
      save(next)
      return next
    })
  }, [])

  return { recents, addRecent, removeRecent }
}
