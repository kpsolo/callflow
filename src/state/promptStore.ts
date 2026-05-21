import { create } from "zustand";

export interface Prompt {
  id: string;
  name: string;
  description: string;
  category: "Greetings" | "System" | "Menus" | "Voicemail" | "Custom";
  duration: string;
  url: string;
  isCustom?: boolean;
}

interface PromptStore {
  prompts: Prompt[];
  addPrompt: (prompt: Prompt) => void;
  getPromptById: (id: string) => Prompt | undefined;
}

const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: "p_welcome_to_acme",
    name: "Welcome to ACME",
    description: "Welcome to ACME Corp. If you know your party's extension, you may dial it at any time...",
    category: "Greetings",
    duration: "12s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  },
  {
    id: "p_root_options",
    name: "Main Menu Options",
    description: "For Sales, press 1. For Engineering, press 2. For Customer Support, press 3...",
    category: "Menus",
    duration: "15s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  },
  {
    id: "p_sales_options",
    name: "Sales Menu Options",
    description: "For Enterprise Sales, press 1. For SMB Sales, press 2. To return to the main menu, press *...",
    category: "Menus",
    duration: "10s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  },
  {
    id: "p_eng_options",
    name: "Engineering Menu Options",
    description: "For Product Development, press 1. For DevOps, press 2. To return to the main menu, press *...",
    category: "Menus",
    duration: "11s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  },
  {
    id: "p_support_options",
    name: "Support Menu Options",
    description: "To open a support ticket, press 1. For HR, press 2. To return to the main menu, press *...",
    category: "Menus",
    duration: "12s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  },
  {
    id: "p_goodbye",
    name: "Goodbye Message",
    description: "Thank you for calling ACME Corp. Goodbye!",
    category: "Greetings",
    duration: "4s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  },
  {
    id: "p_recording_notice",
    name: "Call Recording Notice",
    description: "This call may be monitored or recorded for quality assurance.",
    category: "System",
    duration: "6s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
  },
  {
    id: "p_holiday_closing",
    name: "Holiday Closing Announcement",
    description: "We are currently closed for the holiday. Please leave a voicemail after the tone.",
    category: "Voicemail",
    duration: "8s",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  }
];

export const usePromptStore = create<PromptStore>((set, get) => ({
  prompts: DEFAULT_PROMPTS,
  addPrompt: (prompt) => set((state) => ({ prompts: [...state.prompts, prompt] })),
  getPromptById: (id) => get().prompts.find((p) => p.id === id),
}));
