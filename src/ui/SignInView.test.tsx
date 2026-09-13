import { beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../test/render'

// The module reaches for the Supabase client at import time, and these tests
// are about the screen's behaviour rather than the network underneath it.
vi.mock('../data/useSession', () => ({
  sendSignInCode: vi.fn(),
  verifySignInCode: vi.fn(),
}))

import { sendSignInCode, verifySignInCode } from '../data/useSession'
import { SignInView } from './SignInView'

const sent = vi.mocked(sendSignInCode)
const verified = vi.mocked(verifySignInCode)

beforeEach(() => {
  sent.mockReset().mockResolvedValue(undefined)
  verified.mockReset().mockResolvedValue(undefined)
})

/** Walks the first step, leaving the screen on code entry. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), 'me@example.com')
  await user.click(screen.getByRole('button', { name: /send me a code/i }))
  await screen.findAllByLabelText('Sign-in code')
}

/**
 * A PinInput is one input per digit, so a code is typed across six boxes.
 * Focusing the first and using the keyboard lets Mantine advance the focus the
 * way it does for a real person.
 */
async function typeCode(
  user: ReturnType<typeof userEvent.setup>,
  digits: string,
) {
  const boxes = screen.getAllByLabelText('Sign-in code')
  await user.click(boxes[0])
  await user.keyboard(digits)
}

describe('SignInView', () => {
  it('asks for an email first, and will not send an empty one', () => {
    render(<SignInView />)

    expect(
      screen.getByRole('button', { name: /send me a code/i }),
    ).toBeDisabled()
  })

  it('sends a code to the address given', async () => {
    const user = userEvent.setup()
    render(<SignInView />)

    await reachCodeStep(user)

    expect(sent).toHaveBeenCalledWith('me@example.com')
  })

  it('moves to code entry and names the address it used', async () => {
    const user = userEvent.setup()
    render(<SignInView />)
    await reachCodeStep(user)

    expect(screen.getByText(/me@example.com/)).toBeInTheDocument()
  })

  it('stays on the email step when sending fails', async () => {
    const user = userEvent.setup()
    sent.mockRejectedValue(new Error('Signups not allowed for otp'))
    render(<SignInView />)

    await user.type(screen.getByLabelText(/email/i), 'nobody@example.com')
    await user.click(screen.getByRole('button', { name: /send me a code/i }))

    expect(
      await screen.findByText(/signups not allowed for otp/i),
    ).toBeInTheDocument()
    expect(screen.queryAllByLabelText('Sign-in code')).toHaveLength(0)
  })

  it('verifies the code once the last digit is typed', async () => {
    const user = userEvent.setup()
    render(<SignInView />)
    await reachCodeStep(user)

    await typeCode(user, '123456')

    await waitFor(() =>
      expect(verified).toHaveBeenCalledWith('me@example.com', '123456'),
    )
  })

  it('redeems a code exactly once, not twice', async () => {
    const user = userEvent.setup()
    render(<SignInView />)
    await reachCodeStep(user)

    // Typing the sixth digit submits; the button must not resubmit the same
    // code, since a code is single-use and the second attempt would fail.
    await typeCode(user, '123456')
    await waitFor(() => expect(verified).toHaveBeenCalledTimes(1))
    expect(verified).toHaveBeenCalledTimes(1)
  })

  it('reports a bad code and clears the field to retry', async () => {
    const user = userEvent.setup()
    verified.mockRejectedValue(new Error('Token has expired or is invalid'))
    render(<SignInView />)
    await reachCodeStep(user)

    await typeCode(user, '000000')

    expect(
      await screen.findByText(/token has expired or is invalid/i),
    ).toBeInTheDocument()
    // Still on the code step, ready for another try.
    expect(screen.getAllByLabelText('Sign-in code')).toHaveLength(6)
  })

  it('can go back and use a different email', async () => {
    const user = userEvent.setup()
    render(<SignInView />)
    await reachCodeStep(user)

    await user.click(screen.getByRole('button', { name: /different email/i }))

    expect(
      screen.getByRole('button', { name: /send me a code/i }),
    ).toBeInTheDocument()
  })

  it('resends to the same address', async () => {
    const user = userEvent.setup()
    render(<SignInView />)
    await reachCodeStep(user)

    await user.click(screen.getByRole('button', { name: /resend/i }))

    await waitFor(() => expect(sent).toHaveBeenCalledTimes(2))
    expect(sent).toHaveBeenLastCalledWith('me@example.com')
  })
})
