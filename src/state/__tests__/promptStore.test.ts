import { describe, expect, it } from "vitest";
import { usePromptStore, type Prompt } from "../promptStore";

describe("promptStore", () => {
  it("should have pre-loaded default greetings and menu options", () => {
    const state = usePromptStore.getState();
    expect(state.prompts.length).toBeGreaterThanOrEqual(8);
    
    const welcome = state.getPromptById("p_welcome_to_acme");
    expect(welcome).toBeDefined();
    expect(welcome?.name).toBe("Welcome to ACME");
    expect(welcome?.category).toBe("Greetings");
  });

  it("should support adding custom prompts", () => {
    const timestamp = Date.now();
    const customId = `p_test_custom_${timestamp}`;
    const newPrompt: Prompt = {
      id: customId,
      name: "Test Custom Announcement",
      description: "A test prompt for unit verification",
      category: "Custom",
      duration: "5s",
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      isCustom: true,
    };

    usePromptStore.getState().addPrompt(newPrompt);

    const state = usePromptStore.getState();
    const retrieved = state.getPromptById(customId);
    
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe("Test Custom Announcement");
    expect(retrieved?.isCustom).toBe(true);
    expect(retrieved?.category).toBe("Custom");
  });
});
