
import { GoogleGenAI, Type } from "@google/genai";
import { Dustbin, RouteOptimizationResult, Coordinates } from "../types";

export async function optimizeCollectionRoute(bins: Dustbin[], startPos?: Coordinates): Promise<RouteOptimizationResult> {
  // Always use new GoogleGenAI({ apiKey: process.env.API_KEY }) as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const binsToCollect = bins.filter(b => {
    const isFull = b.level >= 90;
    const isSmelly = b.smell >= 200 && b.level >= 60;
    return isFull || isSmelly;
  });

  if (binsToCollect.length === 0) {
    return { optimizedOrder: [], explanation: "No bins currently require collection based on IoT sensor thresholds." };
  }

  const prompt = `
    I am performing waste collection in Limuru/Nairobi. 
    I need the SHORTEST ROAD sequence for a garbage truck.
    
    STARTING LOCATION (Current Truck Position):
    ${startPos ? `Latitude: ${startPos.lat}, Longitude: ${startPos.lng}` : "Not provided, use the first bin as start."}
    
    BINS REQUIRING PICKUP (Target Nodes):
    ${JSON.stringify(binsToCollect.map(b => ({ id: b.id, name: b.name, lat: b.location.lat, lng: b.location.lng, level: b.level, gas: b.smell })))}

    IMPORTANT:
    1. The route MUST begin from the Starting Location.
    2. Optimize based on proximity (Longitude and Latitude distance).
    3. Return a JSON object with:
       - optimizedOrder: Array of Bin IDs in the sequence they should be visited.
       - explanation: A clear sentence describing why this route is shortest and where it starts.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            optimizedOrder: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Array of dustbin IDs in the optimal visit order starting from user"
            },
            explanation: {
              type: Type.STRING,
              description: "Brief reasoning for the route"
            }
          },
          required: ["optimizedOrder", "explanation"]
        }
      }
    });

    // Access .text property directly instead of text() method
    const result = JSON.parse(response.text || "{}");
    return result as RouteOptimizationResult;
  } catch (error) {
    console.error("Gemini optimization failed:", error);
    return {
      optimizedOrder: binsToCollect.map(b => b.id),
      explanation: "Route visualized based on default sensor discovery order."
    };
  }
}
