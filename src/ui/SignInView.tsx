import { useState } from 'react'
import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  PinInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { sendSignInCode, verifySignInCode } from '../data/useSession'

/** How many digits the emailed code has. Supabase sends six. */
const CODE_LENGTH = 6

/**
 * Sign-in, in two steps: ask for a code, then type it.
 *
 * The code rather than the link is what makes this work in an installed PWA —
 * see the note at the top of `src/data/useSession.ts`. The email carries a link
 * too, which is the better route on a desktop browser, so the first step says
 * so rather than pretending the link is not there.
 */
export function SignInView() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resent, setResent] = useState(false)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await sendSignInCode(email.trim())
      setStep('code')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const submitEmail = (event: React.FormEvent) => {
    event.preventDefault()
    void send()
  }

  // The one path that redeems a code, whether the button was pressed or the
  // sixth digit was just typed. Both go through `busy`, so the two cannot
  // submit the same code twice.
  const verify = async (value: string) => {
    if (busy) return

    setBusy(true)
    setError(null)
    try {
      await verifySignInCode(email.trim(), value)
      // Nothing to do on success: `onAuthStateChange` fires and the app
      // re-renders signed in, unmounting this screen.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = (event: React.FormEvent) => {
    event.preventDefault()
    void verify(code)
  }

  const resend = async () => {
    setResent(false)
    setCode('')
    await send()
    setResent(true)
  }

  return (
    <Card withBorder padding="lg" maw={420} mx="auto" mt="xl">
      <Stack gap="md">
        <Title order={1} size="h3">
          Budginator
        </Title>

        {error && (
          <Alert color="red" variant="light" title="Could not sign in">
            {error}
          </Alert>
        )}

        {step === 'email' ? (
          <form onSubmit={submitEmail}>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Enter your email and we will send you a sign-in code. There is
                no password.
              </Text>

              <TextInput
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.currentTarget.value)}
                required
                data-autofocus
              />

              <Button
                type="submit"
                disabled={email.trim() === '' || busy}
                loading={busy}
              >
                Send me a code
              </Button>
            </Stack>
          </form>
        ) : (
          <form onSubmit={submitCode}>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                We sent a {CODE_LENGTH}-digit code to {email}. Enter it here —
                the email also has a link, which is the easier route in a
                desktop browser.
              </Text>

              {resent && (
                <Alert color="green" variant="light">
                  A new code is on its way.
                </Alert>
              )}

              <Stack gap={4}>
                {/* Not a <label>: a PinInput is six inputs, so there is no one
                    control for a label to point at. Each input carries its own
                    name via `ariaLabel` instead — Mantine's default is the
                    unhelpful "PinInput". */}
                <Text size="sm" fw={500}>
                  Code
                </Text>
                {/* `oneTimeCode` sets autocomplete so the device can offer the
                    code straight from the email rather than making somebody
                    switch apps and memorise six digits. */}
                <PinInput
                  length={CODE_LENGTH}
                  type="number"
                  inputMode="numeric"
                  oneTimeCode
                  ariaLabel="Sign-in code"
                  value={code}
                  onChange={setCode}
                  // Submitting on the last digit saves a tap, and a wrong code
                  // is recoverable — the field clears and stays put.
                  onComplete={(value) => void verify(value)}
                  data-autofocus
                />
              </Stack>

              <Button
                type="submit"
                disabled={code.length !== CODE_LENGTH || busy}
                loading={busy}
              >
                Sign in
              </Button>

              <Group justify="space-between">
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => {
                    setStep('email')
                    setCode('')
                    setError(null)
                    setResent(false)
                  }}
                >
                  Use a different email
                </Anchor>
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => void resend()}
                >
                  Resend
                </Anchor>
              </Group>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  )
}
