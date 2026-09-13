import { createTheme } from '@mantine/core'

// Mantine is the theming layer: colours, typography, spacing and dark mode all
// come from this object and Mantine's CSS custom properties rather than
// hand-rolled tokens. Reskin the app here.
//
// Mantine derives its surfaces from three places: `colors.ledger` (accents),
// `colors.dark` (every dark-scheme surface, border and muted text), and
// `black` (light-scheme body text).
export const theme = createTheme({
  // Ledger green. The 7th shade is what Mantine uses as `ledger.filled`, and it
  // matches the PWA theme colour in index.html and the manifest.
  primaryColor: 'ledger',
  primaryShade: 7,
  // Light-scheme body text: ink, not pure black.
  black: '#16211c',

  colors: {
    ledger: [
      '#e8f4ee',
      '#d0e7dc',
      '#a4cebb',
      '#74b399',
      '#4d9c7c',
      '#328c6a',
      '#228560',
      '#0f6b4a',
      '#0a5c3f',
      '#014c33',
    ],

    // Money that has run out reads red wherever it appears — the available
    // badge on the dashboard, an overdrawn month, a negative split. Mantine's
    // stock red is a warning colour; this one is muted enough to sit in a table
    // without shouting at every line of ordinary spending.
    overdrawn: [
      '#fdeceb',
      '#f7d6d4',
      '#eeaba7',
      '#e57d77',
      '#de5750',
      '#da3f37',
      '#d9332a',
      '#c1261e',
      '#ad1f19',
      '#981612',
    ],
  },

  fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  headings: { fontWeight: '600' },

  components: {
    // Money is read in columns and compared down the column, so it is set in a
    // tabular font wherever it appears. The `.amount` class in styles/app.css
    // is the other half of this — a theme object cannot reach the table cells
    // that Mantine renders itself.
    Table: { defaultProps: { verticalSpacing: 'sm', horizontalSpacing: 'sm' } },
    // A badge on the dashboard carries a balance, which is data rather than
    // decoration.
    Badge: { defaultProps: { variant: 'light', tt: 'none' } },
    // This is a phone-first app used one-handed in a shop: controls are at
    // least a thumb across, and text inputs are 16px so iOS does not zoom the
    // page when one takes focus.
    Button: { defaultProps: { size: 'md' } },
    TextInput: { defaultProps: { size: 'md' } },
    NumberInput: { defaultProps: { size: 'md' } },
    Select: { defaultProps: { size: 'md' } },
    NativeSelect: { defaultProps: { size: 'md' } },
    Textarea: { defaultProps: { size: 'md' } },
    FileInput: { defaultProps: { size: 'md' } },
  },
})

/**
 * The colour a signed amount is drawn in: red when the envelope is overdrawn
 * or the figure is negative, green when there is money left. Used for badges
 * and totals, never for ordinary spending lines — if every expense were red,
 * the one that matters would not stand out.
 */
export function amountColor(cents: number): 'ledger' | 'overdrawn' {
  return cents < 0 ? 'overdrawn' : 'ledger'
}
