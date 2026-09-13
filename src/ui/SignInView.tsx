import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { sendMagicLink } from '../data/useSession'

/**
 * The sign-in screen.
 *
 * A magic link rather than a password: this is a single-user app opened on a
 * phone, where a password manager is the difference between signing in and
 * giving up, and there is no password here to be reused or leaked.
 */
export function SignInView() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    setBusy(true)
    setError(null)
    try {
      await sendMagicLink(email.trim())
      setSent(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card withBorder padding="lg" maw={420} mx="auto" mt="xl">
      <Stack gap="md">
        <Title order={1} size="h3">
          Budginator
        </Title>

        {sent ? (
          <Alert color="green" variant="light" title="Check your email">
            <Text size="sm">
              A sign-in link is on its way to {email}. Open it on this device —
              the link signs in the browser it is opened in.
            </Text>
          </Alert>
        ) : (
          <form onSubmit={submit}>
            <Stack gap="md">
              {error && (
                <Alert
                  color="red"
                  variant="light"
                  title="Could not send the link"
                >
                  {error}
                </Alert>
              )}

              <Text size="sm" c="dimmed">
                Sign in with a link sent to your email. There is no password.
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
                Send me a link
              </Button>
            </Stack>
          </form>
        )}
      </Stack>
    </Card>
  )
}
