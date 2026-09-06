import { create } from 'zustand';
import type { LibrarySection } from '../../../shared/types';

export type ModalName = 'settings' | 'track-edit' | 'game-edit' | 'playlist-edit' | 'playlist-add' | 'scan' | null;

export interface UiStore {
  selectedGameId: string | null;
  selectedPlaylistId: string | null;
  activeSection: LibrarySection;
  searchText: string;
  scanDialogOpen: boolean;
  currentModal: ModalName;
  setSelectedGame: (gameId: string | null) => void;
  setSelectedGameId: (gameId: string | null) => void;
  setSelectedPlaylist: (playlistId: string | null) => void;
  setActiveSection: (section: LibrarySection) => void;
  setSearchText: (value: string) => void;
  setSearch: (value: string) => void;
  setScanDialogOpen: (open: boolean) => void;
  setCurrentModal: (modal: ModalName) => void;
  reset: () => void;
}

const initialState = {
  selectedGameId: null as string | null,
  selectedPlaylistId: null as string | null,
  activeSection: 'library' as LibrarySection,
  searchText: '',
  scanDialogOpen: false,
  currentModal: null as ModalName,
};

export const useUiStore = create<UiStore>((set) => ({
  ...initialState,
  setSelectedGame: (selectedGameId) => set({ selectedGameId }),
  setSelectedGameId: (selectedGameId) => set({ selectedGameId }),
  setSelectedPlaylist: (selectedPlaylistId) => set({ selectedPlaylistId }),
  setActiveSection: (activeSection) => set({ activeSection }),
  setSearchText: (searchText) => set({ searchText }),
  setSearch: (searchText) => set({ searchText }),
  setScanDialogOpen: (scanDialogOpen) => set({ scanDialogOpen }),
  setCurrentModal: (currentModal) => set({ currentModal }),
  reset: () => set({ ...initialState }),
}));

export const uiStore = useUiStore;
