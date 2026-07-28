import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Comment } from '@/lib/types'

/**
 * Comments for the open pin (part of the §3 PinDetailModal decomposition): the
 * list, its realtime INSERT/DELETE channel, optimistic posting, and deletion.
 * Returned members keep the names the modal's JSX already uses, so this lifts the
 * comment LOGIC out of the ~1000-line component without touching its markup — the
 * comment UI spans two layout regions (in-body list + sticky-footer input), so a
 * hook separates concerns more safely than a single component would.
 */
export function usePinComments(pinId: string, user: User | null) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [commentBody, setCommentBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)

  const fetchComments = useCallback(async () => {
    const { data } = await supabase
      .from('comments')
      .select('*, profile:profiles(username, avatar_url)')
      .eq('pin_id', pinId)
      .order('created_at', { ascending: true })
    if (data) setComments(data as unknown as Comment[])
    setLoadingComments(false)
  }, [pinId])

  useEffect(() => {
    setComments([])
    setLoadingComments(true)
    fetchComments()

    const channel = supabase
      .channel(`comments:${pinId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'comments', filter: `pin_id=eq.${pinId}` },
        async (payload) => {
          // Fetch with the profile join — the raw payload doesn't include it.
          const { data } = await supabase
            .from('comments')
            .select('*, profile:profiles(username, avatar_url)')
            .eq('id', (payload.new as { id: string }).id)
            .single()
          if (data) {
            setComments((prev) => {
              // Avoid duplicates (optimistic insert + realtime).
              if (prev.some((c) => c.id === data.id)) return prev
              return [...prev, data as unknown as Comment]
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'comments', filter: `pin_id=eq.${pinId}` },
        (payload) => {
          setComments((prev) => prev.filter((c) => c.id !== (payload.old as { id: string }).id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [pinId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when new comments arrive.
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const handlePostComment = async () => {
    if (!commentBody.trim() || !user || posting) return
    setPosting(true)
    // Optimistic insert (realtime will deduplicate).
    const tempId = `temp-${Date.now()}`
    const optimistic: Comment = {
      id: tempId,
      pin_id: pinId,
      user_id: user.id,
      body: commentBody.trim(),
      created_at: new Date().toISOString(),
      profile: { username: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'You', avatar_url: user.user_metadata?.avatar_url ?? null },
    }
    setComments((prev) => [...prev, optimistic])
    setCommentBody('')
    const { error, data } = await supabase
      .from('comments')
      .insert({ pin_id: pinId, user_id: user.id, body: optimistic.body })
      .select('id')
      .single()
    if (error) {
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      setCommentBody(optimistic.body)
    } else if (data) {
      // Replace the temp id with the real one.
      setComments((prev) => prev.map((c) => (c.id === tempId ? { ...c, id: data.id } : c)))
    }
    setPosting(false)
  }

  const handleDeleteComment = async (commentId: string) => {
    setDeletingId(commentId)
    await supabase.from('comments').delete().eq('id', commentId)
    setComments((prev) => prev.filter((c) => c.id !== commentId))
    setDeletingId(null)
  }

  return {
    comments,
    loadingComments,
    commentBody,
    setCommentBody,
    posting,
    deletingId,
    commentsEndRef,
    handlePostComment,
    handleDeleteComment,
  }
}
