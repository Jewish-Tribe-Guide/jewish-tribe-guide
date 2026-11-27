// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AdminApi } from '@/lib/adminApi'
import SentPosts from './SentPosts'

// What the AI's read of a post couldn't file, on To do (Nov 27).
afterEach(() => cleanup())
const ID = '00000000-aaaa-4aaa-8aaa-000000000001'
const post = { id: ID, text: 'TJ has challah now', photoUrls: ['https://x.co/site-assets/message-source/1.png', 'https://x.co/site-assets/message-source/2.pdf'], left: ['Which place? Arch St or Market St: “TJ”'], createdAt: '2026-11-27T12:00:00Z' }
const apiWith = (posts: unknown[]) => ({ get: vi.fn(async () => ({ posts })), post: vi.fn(async () => ({ ok: true })) }) as unknown as AdminApi & { post: ReturnType<typeof vi.fn> }

describe('SentPosts', () => {
  it('shows each post as sent, its photos, and what was left; Done takes it off', async () => {
    const api = apiWith([post])
    render(<SentPosts api={api} />)
    const card = await screen.findByTestId('sent-post')
    expect(card).toHaveTextContent('TJ has challah now')
    expect(screen.getByRole('link', { name: 'Photo 1' })).toHaveAttribute('href', post.photoUrls[0])
    expect(screen.getByRole('link', { name: 'PDF 2' })).toBeInTheDocument()
    expect(screen.getByTestId('sent-post-left')).toHaveTextContent('Which place? Arch St or Market St: “TJ”')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByTestId('sent-posts')).not.toBeInTheDocument())
    expect(api.post).toHaveBeenCalledWith('/api/admin/sent-posts', { id: ID }, expect.any(String))
  })

  it('shows nothing when there are none, or they can’t be loaded', async () => {
    const api = apiWith([])
    render(<SentPosts api={api} />)
    await waitFor(() => expect(api.get).toHaveBeenCalled())
    expect(screen.queryByTestId('sent-posts')).not.toBeInTheDocument()
  })
})
