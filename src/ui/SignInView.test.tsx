import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../test/render'

// The module reaches for the Supabase client at import time, and these tests
// are about the screen's behaviour rather than the network underneath it.
vi.mock('../data/useSession', () => ({ signInWithPassword: vi.fn() }))

import { signInWithPassword } from '../data/useSession'
import { SignInView } from './SignInView'

const signIn = vi.mocked(signInWithPassword)

beforeEach(() => {
  signIn.mockReset().mockResolvedValue(undefined)
})

describe('SignInView', () => {
  it('will not submit until both fields are filled', async () => {
    const user = userEvent.setup()
    render(<SignInView />)

    const button = screen.getByRole('button', { name: /sign in/i })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/^email/i), 'me@example.com')
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/^password/i), 'hunter2')
    expect(button).toBeEnabled()
  })

  it('signs in with the credentials given, trimming the email', async () => {
    const user = userEvent.setup()
    render(<SignInView />)

    await user.type(screen.getByLabelText(/^email/i), '  me@example.com  ')
    await user.type(screen.getByLabelText(/^password/i), 'hunter2')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith('me@example.com', 'hunter2'),
    )
  })

  it('reports a rejected sign-in and clears only the password', async () => {
    const user = userEvent.setup()
    signIn.mockRejectedValue(new Error('Invalid login credentials'))
    render(<SignInView />)

    await user.type(screen.getByLabelText(/^email/i), 'me@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(
      await screen.findByText(/invalid login credentials/i),
    ).toBeInTheDocument()
    // The email survives so a retry is one field, not two.
    expect(screen.getByLabelText(/^email/i)).toHaveValue('me@example.com')
    expect(screen.getByLabelText(/^password/i)).toHaveValue('')
  })

  it('carries the autocomplete hints a password manager needs', () => {
    render(<SignInView />)

    expect(screen.getByLabelText(/^email/i)).toHaveAttribute(
      'autocomplete',
      'username',
    )
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
  })

  it('offers no way to create an account', () => {
    render(<SignInView />)

    expect(screen.queryByText(/sign up/i)).not.toBeInTheDocument()
    expect(
      screen.getByText(/accounts are created in supabase/i),
    ).toBeInTheDocument()
  })
})
