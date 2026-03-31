/// <reference types="vite/client" />
import { GoogleGenAI } from '@google/genai';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function generateSubtasks(taskTitle: string): Promise<string[]> {
  if (!ai) {
    console.warn("VITE_GEMINI_API_KEY is not set. Generating fallback mock subtasks.");
    return [
      `Analyze requirements for ${taskTitle}`,
      `Break down the tasks`,
      `Execute ${taskTitle}`
    ];
  }

  try {
    const prompt = `Break down the following task into 3 to 5 actionable subtasks. Return ONLY a JSON array of strings. Do not include markdown formatting like \`\`\`json. Task: "${taskTitle}"`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    const textStr = response.text || '';
    const text = textStr.trim();
    // remove markdown code block delimiters if present
    const cleanText = text.replace(/^```json/i, '').replace(/```$/i, '').trim();

    try {
      const parsed = JSON.parse(cleanText);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.error("Failed to parse Gemini output as JSON", cleanText);
    }
    
    // Fallback if parsing fails but text exists
    return text.split('\n').map(line => line.replace(/^[-*0-9.]+\s*/, '').trim()).filter(l => l.length > 0);
  } catch (err) {
    console.error("Gemini API Error:", err);
    throw new Error('Failed to generate subtasks');
  }
}
