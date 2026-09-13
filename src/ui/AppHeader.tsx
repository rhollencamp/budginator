import {
  Burger,
  Container,
  Group,
  Indicator,
  Loader,
  Title,
} from '@mantine/core'

interface AppHeaderProps {
  title: string
  menuOpened: boolean
  onToggleMenu: () => void
  /** Draws the attention dot on the burger: something in the menu is waiting. */
  menuAttention?: boolean
  /** Shows a small spinner while a read or write is in flight. */
  busy?: boolean
}

export function AppHeader({
  title,
  menuOpened,
  onToggleMenu,
  menuAttention = false,
  busy = false,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <Container size="sm" py="xs">
        <Group gap="sm" wrap="nowrap">
          {/* The dot is decorative — the menu item it points at carries the
              wording — so it stays unlabelled. The wrapper must not be
              aria-hidden, or it would take the burger with it. */}
          <Indicator
            disabled={!menuAttention}
            color="red"
            size={8}
            offset={2}
            withBorder
          >
            <Burger
              opened={menuOpened}
              onClick={onToggleMenu}
              size="sm"
              aria-label="Menu"
            />
          </Indicator>

          <Title order={1} size="h5" fw={600} flex={1}>
            {title}
          </Title>

          {/* Every action here writes and then re-reads, so this is on screen
              often enough to need to be quiet: no layout shift, no overlay,
              just something moving while the numbers catch up. */}
          {busy && <Loader size="xs" aria-label="Working" />}
        </Group>
      </Container>
    </header>
  )
}
