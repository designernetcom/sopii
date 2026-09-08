import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemePreference = 'light' | 'dark' | 'system';

const THEME_KEY = 'sopii.theme';
const SIDEBAR_KEY = 'sopii.sidebar';

function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* ignore */
  }
  return 'system';
}

function readCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export interface UiState {
  theme: ThemePreference;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  commandOpen: boolean;
}

const initialState: UiState = {
  theme: readTheme(),
  sidebarCollapsed: readCollapsed(),
  mobileNavOpen: false,
  commandOpen: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    themeChanged(state, action: PayloadAction<ThemePreference>) {
      state.theme = action.payload;
      try {
        localStorage.setItem(THEME_KEY, action.payload);
      } catch {
        /* ignore */
      }
    },
    sidebarToggled(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      try {
        localStorage.setItem(SIDEBAR_KEY, state.sidebarCollapsed ? 'collapsed' : 'expanded');
      } catch {
        /* ignore */
      }
    },
    mobileNavToggled(state, action: PayloadAction<boolean | undefined>) {
      state.mobileNavOpen = action.payload ?? !state.mobileNavOpen;
    },
    commandToggled(state, action: PayloadAction<boolean | undefined>) {
      state.commandOpen = action.payload ?? !state.commandOpen;
    },
  },
});

export const { themeChanged, sidebarToggled, mobileNavToggled, commandToggled } = uiSlice.actions;
export default uiSlice.reducer;
