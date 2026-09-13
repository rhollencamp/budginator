import {
  Anchor,
  Divider,
  Drawer,
  Group,
  NavLink,
  Stack,
  Text,
} from '@mantine/core'
import { GIT_SHA, REPO_URL } from '../buildInfo'
import { GitHubIcon } from './GitHubIcon'
import { VIEWS, type View } from './navigation'

interface NavDrawerProps {
  opened: boolean
  view: View | null
  onSelect: (view: View) => void
  onClose: () => void
  /** Whether a new version is installed and waiting to take over. */
  updateReady?: boolean
  onUpdate?: () => void
  /** How many imported rows are waiting to be linked, shown against Link. */
  unlinkedCount?: number
}

export function NavDrawer({
  opened,
  view,
  onSelect,
  onClose,
  updateReady = false,
  onUpdate,
  unlinkedCount = 0,
}: NavDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="left"
      size="16rem"
      title="Budginator"
      padding={0}
      styles={{
        // The drawer is its own surface over the whole screen, so it owes the
        // unsafe edges the same clearance `.app-header` and `.app-safe-bottom`
        // give the page.
        header: {
          paddingInline: 'var(--mantine-spacing-md)',
          paddingTop: 'env(safe-area-inset-top)',
        },
        // Mantine's drawer content is a plain scroll box, so the column that
        // lets the footer sit at the bottom rather than under the last link has
        // to be declared here — on the content, with the body as what grows.
        content: { display: 'flex', flexDirection: 'column' },
        body: { flex: 1, display: 'flex', flexDirection: 'column' },
      }}
    >
      <Stack gap={0}>
        {VIEWS.map((entry) => (
          <NavLink
            key={entry.key}
            component="button"
            label={entry.label}
            active={entry.key === view}
            onClick={() => onSelect(entry.key)}
            // The queue of unlinked bank rows is the app's only real backlog,
            // so it is the one number worth carrying into the menu.
            description={
              entry.key === 'link' && unlinkedCount > 0
                ? `${unlinkedCount} waiting`
                : undefined
            }
          />
        ))}

        {/* Only present while a new version waits, below the views it is not
            one of: this reloads the app rather than switching screens. */}
        {updateReady && (
          <>
            <Divider my="xs" />
            <NavLink
              component="button"
              label="Update available"
              description="Click to restart and install"
              onClick={onUpdate}
            />
          </>
        )}
      </Stack>

      {/* The home indicator sits over the bottom of the panel, so the footer
          clears it the way `.app-safe-bottom` does for the page. */}
      <Group
        mt="auto"
        p="md"
        gap="xs"
        wrap="nowrap"
        c="dimmed"
        style={{
          paddingBottom:
            'calc(var(--mantine-spacing-md) + env(safe-area-inset-bottom))',
        }}
      >
        <Anchor
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          title="Source on GitHub"
          display="flex"
        >
          <GitHubIcon />
        </Anchor>

        {/* The build's commit, so a bug report can name what was running. It is
            the only version this app has — `package.json`'s is a placeholder. */}
        <Text size="xs" ff="monospace" title="The commit this build came from">
          {GIT_SHA}
        </Text>
      </Group>
    </Drawer>
  )
}
