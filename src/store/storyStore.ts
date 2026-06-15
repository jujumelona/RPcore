import { create } from 'zustand';
import { StoryAPI } from '../api/StoryAPI';
import { useLanguageStore } from './languageStore';

interface StoryState {
  storyDetail: any | null;
  storyConfig: any | null;
  recommendStories: any[];
  isLoading: boolean;
  fetchStoryDetail: (_id: string) => Promise<void>;
  fetchStoryConfig: (_id: string) => Promise<void>;
  fetchRecommended: (_id: string) => Promise<void>;
}

export const useStoryStore = create<StoryState>((set, get) => ({
  storyDetail: null,
  storyConfig: null,
  recommendStories: [],
  isLoading: false,

  fetchStoryDetail: async (id) => {
    const lang = useLanguageStore.getState().appLanguage;
    set({ isLoading: true });
    try {
      const story = await StoryAPI.getStory(id, lang);
      set({ storyDetail: story });
    } catch (error) {
      console.error('[StoryStore] fetchStoryDetail error:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchStoryConfig: async (id) => {
    // story_config is typically embedded in the story detail.
    // We update storyConfig state from the detail if already loaded, or fetch it.
    try {
      let story = get().storyDetail;
      if (!story || story.id !== id) {
        const lang = useLanguageStore.getState().appLanguage;
        story = await StoryAPI.getStory(id, lang);
      }
      
      const config = story?.story_config || story;
      // Handle the case where story_config is a string
      if (typeof config === 'string') {
        try {
          set({ storyConfig: JSON.parse(config) });
        } catch {
          set({ storyConfig: {} });
        }
      } else {
        set({ storyConfig: config || {} });
      }
    } catch (error) {
      console.error('[StoryStore] fetchStoryConfig error:', error);
    }
  },

  fetchRecommended: async (id) => {
    try {
      const currentStory = get().storyDetail;
      const genre = currentStory?.genre;
      
      // Fetch stories with the same genre if possible
      const stories = await StoryAPI.getStories(genre ? { genre, lang: useLanguageStore.getState().appLanguage } : { lang: useLanguageStore.getState().appLanguage });
      set({ recommendStories: stories.filter(s => s.id !== id).slice(0, 6) });
    } catch (error) {
      console.error('[StoryStore] fetchRecommended error:', error);
    }
  } }));
