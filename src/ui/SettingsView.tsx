import {
  Button,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
  useMantineColorScheme,
} from '@mantine/core'
import { signOut } from '../data/useSession'

interface SettingsViewProps {
  email?: string
  onExport: () => void
}

export function SettingsView({ email, onExport }: SettingsViewProps) {
  // 'auto' follows the device. The value is stored under the key the inline
  // script in index.html reads before first paint, so a choice made here
  // survives a reload without a flash of the other scheme.
  const { colorScheme, setColorScheme } = useMantineColorScheme()

  return (
    <Stack gap="md">
      <Card withBorder padding="sm">
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <div>
            <Text fw={600}>Appearance</Text>
            <Text size="sm" c="dimmed">
              System follows your device.
            </Text>
          </div>
          <SegmentedControl
            value={colorScheme}
            onChange={(value) =>
              setColorScheme(value as 'light' | 'dark' | 'auto')
            }
            data={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'auto', label: 'System' },
            ]}
          />
        </Group>
      </Card>

      <Card withBorder padding="sm">
        <Stack gap="xs" align="flex-start">
          <div>
            <Text fw={600}>Export</Text>
            <Text size="sm" c="dimmed">
              Downloads everything as JSON — budgets, transactions, splits and
              imported rows — so there is a copy that does not depend on this
              app still existing.
            </Text>
          </div>
          <Button variant="light" onClick={onExport}>
            Download a backup
          </Button>
        </Stack>
      </Card>

      <Card withBorder padding="sm">
        <Stack gap="xs" align="flex-start">
          <div>
            <Text fw={600}>Account</Text>
            <Text size="sm" c="dimmed">
              {email ?? 'Signed in'}
            </Text>
          </div>
          <Button variant="subtle" color="red" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Stack>
      </Card>
    </Stack>
  )
}
