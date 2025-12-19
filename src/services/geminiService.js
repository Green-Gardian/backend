const { GoogleGenerativeAI } = require("@google/generative-ai");
const { pool } = require('../config/db');

// Initialize Gemini
// Ensure GEMINI_API_KEY is in your .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

class GeminiService {
  /**
   * Determine the optimal driver using Gemini AI.
   * @param {Object} context - The context containing bin and driver information.
   * @param {Object} context.bin - { id, latitude, longitude, fill_level, society_id }
   * @param {Array} context.drivers - Array of { id, name, latitude, longitude, active_tasks, society_id }
   * @returns {Promise<Object>} - { driver_id, reason }
   */
  async getOptimalDriver(context) {
    try {
      if (!context.drivers || context.drivers.length === 0) {
        return null;
      }

      const prompt = this.constructPrompt(context);
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // Extract JSON from response (handle potential markdown formatting)
      const jsonStr = this.extractJson(text);
      if (!jsonStr) {
        console.error("Failed to extract JSON from Gemini response:", text);
        return null; // Fallback to traditional method if AI fails
      }

      return JSON.parse(jsonStr);

    } catch (error) {
      console.error("Error in GeminiService.getOptimalDriver:", error);
      return null;
    }
  }

  constructPrompt(context) {
    const { bin, drivers } = context;

    return `
      You are an intelligent task assignment controller for a waste management system.
      Your goal is to assign a task to empty a specific bin to the MOST OPTIMAL driver available.

      **Constraint & Rules:**
      1. **Bin Status:** The bin is at ${bin.fill_level}% capacity. It needs emptying.
      2. **Driver Availability:** Prefer drivers who are free (0 active tasks).
      3. **Workload:** Avoid overloading drivers. A driver with > 3 tasks is heavily loaded.
      4. **Proximity:** Calculated from Driver to Bin (Bin Location: ${bin.latitude}, ${bin.longitude}). Prefer closer drivers.
      5. **Society:** Prefer drivers within the same society (Society ID: ${bin.society_id}). 
      6. **Optimization:** If all closest drivers are busy (>3 tasks), look for a slightly further driver who is free. If everyone is busy, pick the one with the least tasks and closest distance.

      **Data:**

      Bin Location: [${bin.latitude}, ${bin.longitude}]
      Society ID: ${bin.society_id}

      **Candidate Drivers:**
      ${JSON.stringify(drivers, null, 2)}

      **Output Format:**
      You must return ONLY a valid JSON object with no explanations outside the JSON.
      {
        "driver_id": "DRIVER_UUID_OR_ID",
        "reason": "Brief explanation of why this driver was chosen (e.g., 'Closest free driver in same society')"
      }
    `;
  }

  extractJson(text) {
    try {
      // Find JSON between ```json and ``` or just first { and last }
      const match = text.match(/\{[\s\S]*\}/);
      return match ? match[0] : null;
    } catch (e) {
      return null;
    }
  }
}

module.exports = new GeminiService();
