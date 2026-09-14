import { useState } from 'react'
import {
  Alert,
  Button,
  Center,
  Container,
  Loader,
  MantineProvider,
  Stack,
  Text,
} from '@mantine/core'
import { theme } from './theme'
import { isSupabaseConfigured } from './data/supabase'
import { useSession } from './data/useSession'
import { useLedger } from './data/useLedger'
import { downloadLedger } from './data/backup'
import * as api from './data/api'
import { AppHeader } from './ui/AppHeader'
import { NavDrawer } from './ui/NavDrawer'
import { AboutView } from './ui/AboutView'
import { AutoLinkView } from './ui/AutoLinkView'
import { DashboardView } from './ui/DashboardView'
import { EditTransactionView } from './ui/EditTransactionView'
import { ImportView } from './ui/ImportView'
import { LinkView } from './ui/LinkView'
import { SettingsView } from './ui/SettingsView'
import { SetupView } from './ui/SetupView'
import { SignInView } from './ui/SignInView'
import { TrackView } from './ui/TrackView'
import { TransactionsView } from './ui/TransactionsView'
import { HOME, screenTitle, type Screen, type View } from './ui/navigation'
import { applyPwaUpdate } from './pwaUpdate'
import { usePwaUpdate } from './usePwaUpdate'

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Shell />
    </MantineProvider>
  )
}

function Shell() {
  const { session, loading: authLoading } = useSession()
  const signedIn = session !== null
  const { ledger, loading, loadedOnce, refreshing, error, reload, run } =
    useLedger(signedIn)

  const [screen, setScreen] = useState<Screen>(HOME)
  const [menuOpened, setMenuOpened] = useState(false)
  const updateReady = usePwaUpdate()

  const go = (next: Screen) => {
    setScreen(next)
    setMenuOpened(false)
    // Every screen change is a fresh page as far as the reader is concerned,
    // and without this an editor opened from halfway down a long list starts
    // halfway down itself.
    window.scrollTo({ top: 0 })
  }

  const openView = (view: View) => go({ view } as Screen)

  if (!isSupabaseConfigured) {
    return (
      <Container size="sm" py="xl">
        <Alert color="red" title="Not configured">
          This build has no Supabase project to talk to. Set
          <code> VITE_SUPABASE_URL</code> and
          <code> VITE_SUPABASE_PUBLISHABLE_KEY</code> and build again — see
          <code> .env.example</code>.
        </Alert>
      </Container>
    )
  }

  if (authLoading) {
    return (
      <Center h="100svh">
        <Loader />
      </Center>
    )
  }

  if (!signedIn) {
    return (
      <Container size="sm" py="xl">
        <SignInView />
      </Container>
    )
  }

  const unlinkedCount = ledger.imported.filter(
    (row) => row.transactionId === null,
  ).length

  return (
    <div className="app-shell">
      <AppHeader
        title={screenTitle(screen)}
        menuOpened={menuOpened}
        onToggleMenu={() => setMenuOpened((opened) => !opened)}
        menuAttention={updateReady}
        busy={refreshing}
      />

      <NavDrawer
        opened={menuOpened}
        view={screen.view === 'editTransaction' ? null : screen.view}
        onSelect={openView}
        onClose={() => setMenuOpened(false)}
        updateReady={updateReady}
        unlinkedCount={unlinkedCount}
        onUpdate={() => {
          setMenuOpened(false)
          void applyPwaUpdate()
        }}
      />

      <Container component="main" size="sm" py="lg" flex={1} w="100%">
        {error && (
          <Alert color="red" title="Could not load" variant="light" mb="md">
            <Stack align="flex-start" gap="sm">
              <Text size="sm">{error}</Text>
              <Button
                variant="light"
                color="red"
                loading={refreshing}
                onClick={() => void reload()}
              >
                Try again
              </Button>
            </Stack>
          </Alert>
        )}

        {/*
          A failed first read leaves an empty ledger behind, and drawing a
          screen from it would say "no budgets yet" to somebody who has plenty
          — the error above and a contradiction below it. Until one read has
          landed, the error is the whole screen.
        */}
        {loading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : !loadedOnce ? null : (
          <Screens
            screen={screen}
            go={go}
            ledger={ledger}
            run={run}
            email={session.user.email}
          />
        )}
      </Container>

      <div className="app-safe-bottom" />
    </div>
  )
}

interface ScreensProps {
  screen: Screen
  go: (screen: Screen) => void
  ledger: ReturnType<typeof useLedger>['ledger']
  run: ReturnType<typeof useLedger>['run']
  email?: string
}

/**
 * Which screen is showing, and what it is wired to. The views themselves take
 * plain data and callbacks — this is the only place that knows they are backed
 * by a database, which is what keeps them testable and replaceable.
 */
function Screens({ screen, go, ledger, run, email }: ScreensProps) {
  switch (screen.view) {
    case 'dashboard':
      return (
        <DashboardView
          budgets={ledger.budgets}
          transactions={ledger.transactions}
          onViewTransactions={(budgetId) =>
            go({ view: 'transactions', budgetId })
          }
          onTrack={(budgetId) => go({ view: 'track', budgetId })}
          onSetUpBudgets={() => go({ view: 'setup' })}
        />
      )

    case 'track':
      return (
        <TrackView
          budgets={ledger.budgets}
          initialBudgetId={screen.budgetId}
          onSave={(input) =>
            run(() =>
              api.saveTransaction({
                id: null,
                date: input.date,
                merchant: input.merchant,
                amountCents: input.amountCents,
                // Quick entry is always one budget; splitting it across
                // several is the editor's job.
                splits: [
                  {
                    budgetId: input.budgetId,
                    amountCents: input.amountCents,
                    note: input.note,
                  },
                ],
              }),
            )
          }
          onSaved={(budgetId) => go({ view: 'transactions', budgetId })}
        />
      )

    case 'transactions':
      return (
        <TransactionsView
          transactions={ledger.transactions}
          budgets={ledger.budgets}
          imported={ledger.imported}
          budgetId={screen.budgetId}
          onFilter={(budgetId) => go({ view: 'transactions', budgetId })}
          onEdit={(transactionId) =>
            go({ view: 'editTransaction', transactionId })
          }
        />
      )

    case 'editTransaction': {
      const transaction = ledger.transactions.find(
        (entry) => entry.id === screen.transactionId,
      )

      // The transaction can be missing after a delete, or if the screen was
      // restored against a ledger that no longer has it.
      if (!transaction) {
        return (
          <Alert title="Not found" variant="light">
            That transaction is no longer here.
          </Alert>
        )
      }

      return (
        <EditTransactionView
          transaction={transaction}
          budgets={ledger.budgets}
          linkedImport={ledger.imported.find(
            (row) => row.transactionId === transaction.id,
          )}
          onSave={(input) => run(() => api.saveTransaction(input))}
          onDelete={(id) => run(() => api.deleteTransaction(id))}
          onDone={() => go({ view: 'transactions' })}
        />
      )
    }

    case 'import':
      return (
        <ImportView
          accounts={ledger.accounts}
          onLoadExisting={api.fetchImportedForAccount}
          onImport={(accountId, rows) =>
            run(() => api.insertImported(accountId, rows))
          }
          onSetUpAccounts={() => go({ view: 'setup' })}
          onDone={() => go({ view: 'link' })}
        />
      )

    case 'link':
      return (
        <LinkView
          imported={ledger.imported}
          transactions={ledger.transactions}
          budgets={ledger.budgets}
          onLinkToBudget={(importedId, budgetId, note) =>
            run(() =>
              api.linkImportedToBudgets([{ importedId, budgetId, note }]),
            )
          }
          onLinkToTransaction={(importedId, transactionId) =>
            run(() => api.linkImportedToTransaction(importedId, transactionId))
          }
          onDiscard={(importedId) => run(() => api.deleteImported(importedId))}
        />
      )

    case 'autoLink':
      return (
        <AutoLinkView
          imported={ledger.imported}
          expressions={ledger.expressions}
          budgets={ledger.budgets}
          onApply={(links) => run(() => api.linkImportedToBudgets(links))}
          onEditRules={() => go({ view: 'setup' })}
        />
      )

    case 'setup':
      return (
        <SetupView
          budgets={ledger.budgets}
          accounts={ledger.accounts}
          expressions={ledger.expressions}
          onSaveBudget={(input) => run(() => api.saveBudget(input))}
          onDeleteBudget={(id) => run(() => api.deleteBudget(id))}
          onSaveAccount={(input) => run(() => api.saveAccount(input))}
          onDeleteAccount={(id) => run(() => api.deleteAccount(id))}
          onSaveExpression={(input) => run(() => api.saveExpression(input))}
          onDeleteExpression={(id) => run(() => api.deleteExpression(id))}
          imported={ledger.imported}
          transactions={ledger.transactions}
          onSaveImported={(input) => run(() => api.saveImported(input))}
          onUnlinkImported={(id) => run(() => api.unlinkImported(id))}
          onDeleteImported={(id) => run(() => api.deleteImported(id))}
        />
      )

    case 'settings':
      return (
        <SettingsView email={email} onExport={() => downloadLedger(ledger)} />
      )

    case 'about':
      return <AboutView />
  }
}
