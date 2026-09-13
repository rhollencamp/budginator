import { useState } from 'react'
import {
  Alert,
  Button,
  Card,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { signInWithPassword } from '../data/useSession'

/**
 * The sign-in screen: email and password, typed into the app.
 *
 * Nothing here leaves the app and comes back, which is the whole point — see
 * the note at the top of `src/data/useSession.ts` for why a magic link or an
 * emailed code could not be used. There is no sign-up and no "forgot
 * password" link: this is a two-person household ledger, accounts are made in
 * the Supabase dashboard, and a password is reset there too.
 */
export function SignInView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    setBusy(true)
    setError(null)
    try {
      await signInWithPassword(email.trim(), password)
      // Nothing to do on success: `onAuthStateChange` fires and the app
      // re-renders signed in, unmounting this screen.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setPassword('')
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

        {error && (
          <Alert color="red" variant="light" title="Could not sign in">
            {error}
          </Alert>
        )}

        <form onSubmit={submit}>
          <Stack gap="md">
            {/* The autocomplete hints are what let a password manager fill
                both fields in one tap, which on a phone is the difference
                between signing in and giving up. */}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              data-autofocus
            />

            <PasswordInput
              label="Password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
            />

            <Button
              type="submit"
              disabled={email.trim() === '' || password === '' || busy}
              loading={busy}
            >
              Sign in
            </Button>

            <Text size="xs" c="dimmed">
              Accounts are created in Supabase, not here.
            </Text>
          </Stack>
        </form>
      </Stack>
    </Card>
  )
}
